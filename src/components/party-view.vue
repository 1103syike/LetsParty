<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue';

import ActionButton from '@/components/action-button.vue';
import CrownBoardGrid from '@/components/crown-board-grid.vue';
import PartyEndScreen from '@/components/party-end-screen.vue';
import PartyIntroScreen from '@/components/party-intro-screen.vue';
import RoundResultLeaderboard from '@/components/round-result-leaderboard.vue';
import type { ArenaBumpSnapshot } from '@/minigames/arena-bump/arena-bump';
import { ARENA_BUMP_ID } from '@/minigames/arena-bump/arena-bump-id';
import ArenaBumpPlay from '@/minigames/arena-bump/arena-bump-play.vue';
import { arenaBumpCopy } from '@/minigames/arena-bump/locales/zh-TW';
import { mashButtonCopy } from '@/minigames/mash-button/locales/zh-TW';
import { ROCK_PAPER_SCISSORS_ID } from '@/minigames/rock-paper-scissors';
import RockPaperScissorsPlay from '@/minigames/rock-paper-scissors/rock-paper-scissors-play.vue';
import type { RockPaperScissorsSnapshot } from '@/minigames/rock-paper-scissors';
import { rpsCopy } from '@/minigames/rock-paper-scissors/locales/zh-TW';
import { volleyballCopy } from '@/minigames/volleyball/locales/zh-TW';
import type { VolleyballSnapshot } from '@/minigames/volleyball';
import { VOLLEYBALL_ID } from '@/minigames/volleyball/volleyball-id';
import VolleyballPlay from '@/minigames/volleyball/volleyball-play.vue';
import { partyCopy } from '@/locales/zh-TW/party';
import type { PartyMachinePhase } from '@/party/party-machine/party-machine';
import {
  sortParticipantIdsByCrown,
} from '@/party/scoring/crown';
import { usePartyStore } from '@/stores/party-store';
import type { Participant } from '@/types/party';

const props = defineProps<{
  phase: PartyMachinePhase;
  roundIndex: number;
  winnerIds: string[];
  isSuddenDeath: boolean;
  introSecondsLeft: number;
  gameId: string | null;
  gameName: string;
  gameRules: string;
  liveScores: Record<string, number>;
  lastCrownAwards: Record<string, number>;
  lastRoundResults: Record<string, string>;
  rpsSnapshot: RockPaperScissorsSnapshot | null;
  arenaBumpSnapshot: ArenaBumpSnapshot | null;
  volleyballSnapshot: VolleyballSnapshot | null;
}>();

const emit = defineEmits<{
  mash: [];
  chooseRps: [choice: 'rock' | 'paper' | 'scissors'];
  claimRps: [choice: 'rock' | 'paper' | 'scissors'];
  joystick: [value: { x: number; y: number }];
  arena: [value: {
    x: number;
    y: number;
    jump: boolean;
    charge: boolean;
    defend: boolean;
  }];
  volleyball: [value: {
    x: number;
    y: number;
    jump: boolean;
    bump: boolean;
    set: boolean;
    spike: boolean;
    aimX?: number | null;
    aimZ?: number | null;
  }];
  continueParty: [];
  backHome: [];
}>();

const partyStore = usePartyStore();

const participantsById = computed((): Record<string, Participant> => {
  const map: Record<string, Participant> = {};

  for (const participant of partyStore.participants) {
    map[participant.id] = participant;
  }

  return map;
});

const localParticipantId = computed(() => partyStore.localParticipantId);

const crownHint = computed(() =>
  partyCopy.targetCrownsHint.replace('{count}', String(partyStore.settings.targetCrowns)),
);

const roundLabel = computed(() =>
  partyCopy.roundLabel.replace('{round}', String(props.roundIndex)),
);

const crownWinnerNames = computed((): string => {
  return Object.entries(props.lastCrownAwards)
    .filter(([, award]) => award > 0)
    .map(([participantId]) => participantsById.value[participantId]?.displayName ?? participantId)
    .join('、');
});

const roundResultMessage = computed((): string => {
  if (!crownWinnerNames.value) {
    return partyCopy.noCrownThisRound;
  }

  if (crownWinnerNames.value.includes('、')) {
    return partyCopy.multiCrownWinners.replace('{names}', crownWinnerNames.value);
  }

  return partyCopy.firstPlaceCrown.replace('{name}', crownWinnerNames.value);
});

function preRoundCrownCountFor(participantId: string): number {
  const current = participantsById.value[participantId]?.crownCount ?? 0;
  const award = props.lastCrownAwards[participantId] ?? 0;

  return current - award;
}

const preRoundRankings = computed(() =>
  sortParticipantIdsByCrown(partyStore.participants, preRoundCrownCountFor),
);

const crownRankings = computed(() =>
  sortParticipantIdsByCrown(
    partyStore.participants,
    (participantId) => participantsById.value[participantId]?.crownCount ?? 0,
  ),
);

const showFinalRankingOrder = ref(false);
const showCrownGainPop = ref(false);
const showRankDelta = ref(false);
let roundResultEffectTimeoutIds: number[] = [];

const displayedRoundRankings = computed(() =>
  showFinalRankingOrder.value ? crownRankings.value : preRoundRankings.value,
);

const isRpsGame = computed(() => props.gameId === ROCK_PAPER_SCISSORS_ID);

const isArenaBumpGame = computed(() => props.gameId === ARENA_BUMP_ID);

const isVolleyballGame = computed(() => props.gameId === VOLLEYBALL_ID);

const showRoundOutcomes = computed(
  () => isRpsGame.value || isArenaBumpGame.value || isVolleyballGame.value,
);

const roundResultAutoHint = computed(() => {
  if (isArenaBumpGame.value) {
    return arenaBumpCopy.autoNextRoundHint;
  }

  if (isVolleyballGame.value) {
    return volleyballCopy.autoNextRoundHint;
  }

  return rpsCopy.autoNextRoundHint;
});

const showCrownBoard = computed(
  () =>
    props.phase !== 'roundResult'
    && props.phase !== 'partyEnd'
    && props.phase !== 'miniGameIntro'
    && props.phase !== 'suddenDeathIntro',
);

const isIntroPhase = computed(
  () => props.phase === 'miniGameIntro' || props.phase === 'suddenDeathIntro',
);

function playerColorVar(color: Participant['color']): string {
  return `var(--color-${color})`;
}

function scoreForParticipant(participantId: string): number {
  return props.liveScores[participantId] ?? 0;
}

function clearRoundResultEffects(): void {
  for (const timeoutId of roundResultEffectTimeoutIds) {
    window.clearTimeout(timeoutId);
  }

  roundResultEffectTimeoutIds = [];
  showFinalRankingOrder.value = false;
  showCrownGainPop.value = false;
  showRankDelta.value = false;
}

function scheduleRoundResultEffects(): void {
  clearRoundResultEffects();

  roundResultEffectTimeoutIds = [
    window.setTimeout(() => {
      showCrownGainPop.value = true;
    }, 340),
    window.setTimeout(() => {
      showFinalRankingOrder.value = true;
    }, 560),
    window.setTimeout(() => {
      showRankDelta.value = true;
    }, 900),
  ];
}

watch(
  () => props.phase,
  (nextPhase) => {
    if (nextPhase === 'roundResult') {
      scheduleRoundResultEffects();
      return;
    }

    clearRoundResultEffects();

    if (nextPhase === 'partyEnd') {
      showFinalRankingOrder.value = true;
    }
  },
  { immediate: true },
);

onScopeDispose(() => {
  clearRoundResultEffects();
});
</script>

<template>
  <section class="party-view">
    <RockPaperScissorsPlay
      v-if="phase === 'miniGamePlay' && isRpsGame && rpsSnapshot"
      :snapshot="rpsSnapshot"
      :round-index="roundIndex"
      @choose="emit('chooseRps', $event)"
      @claim="emit('claimRps', $event)"
    />

    <ArenaBumpPlay
      v-else-if="phase === 'miniGamePlay' && isArenaBumpGame && arenaBumpSnapshot"
      :key="'arena-bump-play'"
      :snapshot="arenaBumpSnapshot"
      :round-index="roundIndex"
      @arena="emit('arena', $event)"
    />

    <VolleyballPlay
      v-else-if="phase === 'miniGamePlay' && isVolleyballGame && volleyballSnapshot"
      :key="'volleyball-play'"
      :snapshot="volleyballSnapshot"
      :round-index="roundIndex"
      @volleyball="emit('volleyball', $event)"
    />

    <template v-else>
      <div class="flex flex-col gap-lg party-view__body">
      <header
        v-if="showCrownBoard"
        class="flex flex-col gap-sm party-view__header"
      >
        <p class="text-sm text-muted text-center">{{ roundLabel }} · {{ crownHint }}</p>
        <CrownBoardGrid :participants="partyStore.participants" />
      </header>

      <p
        v-else-if="phase === 'roundResult' || phase === 'partyEnd'"
        class="round-result__meta text-sm text-muted text-center"
      >
        <template v-if="phase === 'roundResult'">{{ roundLabel }} · {{ crownHint }}</template>
        <template v-else>{{ crownHint }}</template>
      </p>

      <PartyIntroScreen
        v-if="isIntroPhase"
        :round-label="roundLabel"
        :crown-hint="crownHint"
        :is-sudden-death="isSuddenDeath"
        :intro-seconds-left="introSecondsLeft"
        :game-name="gameName"
        :game-rules="gameRules"
        :participants="partyStore.participants"
        :target-crowns="partyStore.settings.targetCrowns"
      />

      <section
        v-else-if="phase === 'miniGamePlay'"
        class="glass-panel-solid flex flex-col gap-md pad-md"
      >
        <h2 class="font-game text-title text-lg text-center">{{ gameName }}</h2>
        <ul class="flex flex-col gap-sm score-list">
          <li
            v-for="participant in partyStore.participants"
            :key="participant.id"
            class="flex items-center justify-between score-row pad-sm"
          >
            <span class="flex items-center gap-sm">
              <span
                class="seat-dot"
                :style="{ background: playerColorVar(participant.color) }"
              />
              <span class="text-md font-bold">{{ participant.displayName }}</span>
            </span>
            <span class="text-sm text-muted">
              {{ mashButtonCopy.scoreLabel }}：{{ scoreForParticipant(participant.id) }}
            </span>
          </li>
        </ul>
        <ActionButton v-if="localParticipantId" variant="hero" @click="emit('mash')">
          {{ mashButtonCopy.mashButton }}
        </ActionButton>
      </section>

      <section
        v-else-if="phase === 'roundResult'"
        class="round-result glass-panel-solid flex flex-col gap-md pad-lg"
      >
        <header class="round-result__header flex flex-col gap-xs items-center">
          <h2 class="round-result__title font-game text-title text-xl text-center">
            {{ partyCopy.resultTitle }}
          </h2>
        </header>

        <RoundResultLeaderboard
          :participant-ids="displayedRoundRankings"
          :participants-by-id="participantsById"
          :last-round-results="lastRoundResults"
          :last-crown-awards="lastCrownAwards"
          :show-crown-gain-pop="showCrownGainPop"
          :show-rank-delta="showRankDelta"
          :show-final-ranking-order="showFinalRankingOrder"
          :show-round-outcomes="showRoundOutcomes"
          :is-arena-bump-game="isArenaBumpGame"
          :pre-round-rankings="preRoundRankings"
          :crown-rankings="crownRankings"
        />

        <p class="round-result__summary text-md font-bold text-center">
          {{ roundResultMessage }}
        </p>

        <div
          v-if="showRoundOutcomes"
          class="round-result__auto flex flex-col gap-sm items-center"
        >
          <span class="round-result__auto-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <p class="text-sm text-muted text-center">
            {{ roundResultAutoHint }}
          </p>
        </div>

        <ActionButton
          v-else
          class="round-result__continue"
          @click="emit('continueParty')"
        >
          {{ partyCopy.continueParty }}
        </ActionButton>
      </section>

      <PartyEndScreen
        v-else-if="phase === 'partyEnd'"
        :key="`party-end-${winnerIds.join('-') || 'none'}`"
        :winner-ids="winnerIds"
        :participants="partyStore.participants"
        :participants-by-id="participantsById"
        :crown-history="partyStore.crownHistory"
        @back-home="emit('backHome')"
      />
      </div>
    </template>
  </section>
</template>

<style lang="scss" scoped>
.party-view {
  width: 100%;
}

.party-view__header {
  margin-bottom: var(--space-sm);
}

.round-result {
  overflow: hidden;
  border-radius: var(--radius-lg);
}

.round-result__meta {
  margin: 0;
}

.round-result__header {
  position: relative;
}

.round-result__title {
  margin: 0;
}

.round-result__summary {
  margin: 0;
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  color: var(--color-text-heading);
}

.round-result__auto {
  padding-top: var(--space-xs);
}

.round-result__auto-dots {
  display: inline-flex;
  gap: var(--space-xs);

  span {
    width: var(--space-sm);
    height: var(--space-sm);
    border-radius: 50%;
    background: var(--color-accent);
    animation: round-result-dot 0.9s ease-in-out infinite;

    &:nth-child(2) {
      animation-delay: 0.15s;
    }

    &:nth-child(3) {
      animation-delay: 0.3s;
    }
  }
}

.round-result__continue {
  margin-top: var(--space-xs);
}

.score-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.score-row {
  background: rgba(255, 255, 255, 0.35);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.seat-dot {
  width: var(--space-md);
  height: var(--space-md);
  border-radius: 50%;
}

@keyframes round-result-dot {
  0%,
  80%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }

  40% {
    opacity: 1;
    transform: translateY(-4px);
  }
}
</style>
