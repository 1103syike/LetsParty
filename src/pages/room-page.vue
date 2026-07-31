<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import PartyRoom from '@/components/party-room.vue';
import PartyView from '@/components/party-view.vue';
import RoomChatPanel from '@/components/room-chat-panel.vue';
import RoomSpeechOverlay from '@/components/room-speech-overlay.vue';
import TestGamePicker from '@/components/test-game-picker.vue';
import { usePartyBgm } from '@/composables/use-party-bgm';
import { usePartyNetwork } from '@/composables/use-party-network';
import { usePartySession } from '@/composables/use-party-session';
import { usePartyStore } from '@/stores/party-store';

const route = useRoute();
const router = useRouter();
const partyStore = usePartyStore();
const network = usePartyNetwork();
const partySession = usePartySession();

const roomId = computed((): string => String(route.params.id));

const isInLobby = computed(() => partySession.phase.value === 'lobby');

usePartyBgm({
  phase: computed(() => partySession.phase.value),
  gameId: computed(() => partySession.currentGameId.value),
});

const gameName = computed(() => {
  const remote = network.remoteSession.value;

  if (!partyStore.isHost && !partyStore.isTestMode && remote?.gameName) {
    return remote.gameName;
  }

  return partySession.currentDefinition.value?.name ?? '';
});

const gameRules = computed(() => {
  const remote = network.remoteSession.value;

  if (!partyStore.isHost && !partyStore.isTestMode && remote?.gameRules) {
    return remote.gameRules;
  }

  return partySession.currentDefinition.value?.rules ?? '';
});

const hasActivePartySession = computed(() => {
  if (partyStore.roomId !== roomId.value) {
    return false;
  }

  if (partyStore.isTestMode) {
    return Boolean(partyStore.localParticipantId) && partyStore.participants.length > 0;
  }

  // 連線中／錯誤也要留在房間頁（Guest 尚無 roster）
  if (
    partyStore.connectionStatus === 'connecting'
    || partyStore.connectionStatus === 'error'
  ) {
    return true;
  }

  return partyStore.participants.length > 0;
});

function goHome(): void {
  void network.stopNetworking();
  partyStore.reset();
  router.replace({ name: 'home' });
}

function skipIntroIfTestMode(): void {
  if (!partyStore.isTestMode) {
    return;
  }

  const phase = partySession.phase.value;

  if (phase === 'miniGameIntro' || phase === 'suddenDeathIntro') {
    partySession.completeIntro();
  }
}

async function bootstrapNetwork(): Promise<void> {
  if (partyStore.isTestMode) {
    return;
  }

  try {
    if (partyStore.isHost) {
      await network.startHostNetworking(partyStore.roomId);
      return;
    }

    await network.startGuestNetworking(partyStore.roomId);
  } catch {
    // store 已標記 error
  }
}

onMounted(() => {
  if (partyStore.roomId !== roomId.value) {
    goHome();
    return;
  }

  if (partyStore.isTestMode) {
    if (!partyStore.localParticipantId || partyStore.participants.length === 0) {
      goHome();
    }

    return;
  }

  void bootstrapNetwork();
});

watch(
  () => partySession.phase.value,
  (phase) => {
    if (
      partyStore.isTestMode
      && (phase === 'miniGameIntro' || phase === 'suddenDeathIntro')
    ) {
      void nextTick(() => {
        skipIntroIfTestMode();
      });
    }
  },
);

watch(
  () => partyStore.connectionError,
  (error) => {
    if (error === 'closed' || error === 'full' || error === 'failed') {
      // 留在房間顯示錯誤；使用者可回首頁
    }
  },
);

function handleStartParty(): void {
  const miniGameId = partySession.startParty();

  if (miniGameId) {
    network.notifyStartParty(miniGameId);
  }
}

function handlePickTestGame(gameId: string): void {
  partySession.startTestGame(gameId);
}

function handleBackHome(): void {
  goHome();
}

function handleContinueParty(): void {
  if (partyStore.isTestMode) {
    partySession.returnToTestLobby();
    return;
  }

  partySession.acknowledgeRoundResult();
}

network.setStartPartyHandler((miniGameId) => {
  if (partyStore.isHost) {
    return;
  }

  partySession.startPartyAsGuest(miniGameId);
});

network.setRemoteInputHandler((participantId, input) => {
  partySession.applyRemotePlayerInput(participantId, input);
});

network.setSessionActionHandler((action, participantId) => {
  if (!partyStore.isHost) {
    return;
  }

  if (action === 'intro-ready') {
    if (!participantId) {
      return;
    }

    partySession.completeIntro(participantId);
    return;
  }

  if (action === 'result-ack') {
    partySession.acknowledgeRoundResult();
  }
});

onBeforeUnmount(() => {
  network.setStartPartyHandler(null);
  network.setRemoteInputHandler(null);
  network.setSessionActionHandler(null);
  void network.stopNetworking();
});
</script>

<template>
  <main
    v-if="hasActivePartySession"
    class="room-page"
    :class="{ 'room-page--wide': partyStore.isTestMode && isInLobby }"
  >
    <PartyView
      v-if="!isInLobby || partyStore.remotePartyStarted"
      :phase="partySession.phase.value"
      :round-index="partySession.roundIndex.value"
      :winner-ids="partySession.winnerIds.value"
      :is-sudden-death="partySession.isSuddenDeath.value"
      :game-id="partySession.currentGameId.value"
      :game-name="gameName"
      :game-rules="gameRules"
      :live-scores="partySession.liveScores.value"
      :last-crown-awards="partySession.lastCrownAwards.value"
      :last-round-results="partySession.lastRoundResults.value"
      :rps-snapshot="partySession.rpsSnapshot.value"
      :arena-bump-snapshot="partySession.arenaBumpSnapshot.value"
      :volleyball-snapshot="partySession.volleyballSnapshot.value"
      :bouncy-bomb-snapshot="partySession.bouncyBombSnapshot.value"
      :intro-ready-count="partySession.introReadyCount.value"
      :intro-ready-total="partySession.introReadyTotal.value"
      :has-local-intro-ready="partySession.hasLocalIntroReady.value"
      @mash="partySession.sendLocalMash()"
      @choose-rps="partySession.sendRpsChoice($event)"
      @claim-rps="partySession.sendRpsClaim($event)"
      @joystick="partySession.sendJoystickInput($event.x, $event.y)"
      @arena="partySession.sendArenaInput($event)"
      @volleyball="partySession.sendVolleyballInput($event)"
      @bouncy-bomb="partySession.sendBouncyBombInput($event)"
      @continue-party="handleContinueParty"
      @start-intro-game="partySession.completeIntro()"
      @back-home="handleBackHome"
    />

    <TestGamePicker
      v-else-if="partyStore.isTestMode"
      @pick="handlePickTestGame"
      @back-home="handleBackHome"
    />

    <PartyRoom
      v-else
      @start-party="handleStartParty"
      @back-home="handleBackHome"
    />

    <RoomChatPanel />
    <RoomSpeechOverlay />
  </main>
</template>

<style lang="scss" scoped>
.room-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  width: 100%;
  max-width: 52rem;
  min-height: 100vh;
  margin: 0 auto;
  padding: var(--space-lg) var(--space-md) calc(var(--space-xl) + env(safe-area-inset-bottom));
}

.room-page--wide {
  max-width: 52rem;
}
</style>
