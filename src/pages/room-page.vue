<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import LobbySetup from '@/components/lobby-setup.vue';
import PartyView from '@/components/party-view.vue';
import { usePartySession } from '@/composables/use-party-session';
import { usePartyStore } from '@/stores/party-store';

const route = useRoute();
const router = useRouter();
const partyStore = usePartyStore();
const partySession = usePartySession();

const roomId = computed((): string => String(route.params.id));

const isInLobby = computed(() => partySession.phase.value === 'lobby');

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

// 重整後 Pinia 已空、URL 卻還在 /room/:id → 直接送回首頁，避免幽靈大廳
onMounted(() => {
  if (!hasActivePartySession.value) {
    goHome();
  }
});

function handleStartParty(): void {
  partySession.startParty();
}

function handleBackHome(): void {
  goHome();
}
</script>

<template>
  <main
    v-if="hasActivePartySession"
    class="room-page"
  >
    <PartyView
      v-if="!isInLobby"
      :phase="partySession.phase.value"
      :round-index="partySession.roundIndex.value"
      :winner-ids="partySession.winnerIds.value"
      :is-sudden-death="partySession.isSuddenDeath.value"
      :intro-seconds-left="partySession.introSecondsLeft.value"
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
      @continue-party="partySession.acknowledgeRoundResult()"
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
</style>
