<script setup lang="ts">
import { computed, nextTick, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import LobbySetup from '@/components/lobby-setup.vue';
import PartyView from '@/components/party-view.vue';
import TestGamePicker from '@/components/test-game-picker.vue';
import { usePartyBgm } from '@/composables/use-party-bgm';
import { usePartySession } from '@/composables/use-party-session';
import { usePartyStore } from '@/stores/party-store';

const route = useRoute();
const router = useRouter();
const partyStore = usePartyStore();
const partySession = usePartySession();

const roomId = computed((): string => String(route.params.id));

const isInLobby = computed(() => partySession.phase.value === 'lobby');

usePartyBgm({
  phase: computed(() => partySession.phase.value),
  gameId: computed(() => partySession.currentGameId.value),
});

const gameName = computed(() => partySession.currentDefinition.value?.name ?? '');

const gameRules = computed(() => partySession.currentDefinition.value?.rules ?? '');

const hasActivePartySession = computed(
  () =>
    Boolean(partyStore.localParticipantId) &&
    partyStore.roomId === roomId.value &&
    partyStore.participants.length > 0,
);

function goHome(): void {
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

// 重整後 Pinia 已空、URL 卻還在 /room/:id → 直接送回首頁，避免幽靈大廳
onMounted(() => {
  if (!hasActivePartySession.value) {
    goHome();
  }
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

function handleStartParty(): void {
  partySession.startParty();
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
</script>

<template>
  <main
    v-if="hasActivePartySession"
    class="room-page"
    :class="{ 'room-page--wide': partyStore.isTestMode && isInLobby }"
  >
    <PartyView
      v-if="!isInLobby"
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
      @mash="partySession.sendLocalMash()"
      @choose-rps="partySession.sendRpsChoice($event)"
      @claim-rps="partySession.sendRpsClaim($event)"
      @joystick="partySession.sendJoystickInput($event.x, $event.y)"
      @arena="partySession.sendArenaInput($event)"
      @volleyball="partySession.sendVolleyballInput($event)"
      @continue-party="handleContinueParty"
      @start-intro-game="partySession.completeIntro()"
      @back-home="handleBackHome"
    />

    <TestGamePicker
      v-else-if="partyStore.isTestMode"
      @pick="handlePickTestGame"
      @back-home="handleBackHome"
    />

    <LobbySetup
      v-else
      @start-party="handleStartParty"
      @back-home="handleBackHome"
    />
  </main>
</template>

<style lang="scss" scoped>
.room-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  width: 100%;
  max-width: 28rem;
  min-height: 100vh;
  margin: 0 auto;
  padding: var(--space-lg) var(--space-md) calc(var(--space-xl) + env(safe-area-inset-bottom));
}

.room-page--wide {
  max-width: 32rem;
}
</style>
