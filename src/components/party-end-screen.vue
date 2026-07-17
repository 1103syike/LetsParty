<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref } from 'vue';

import ActionButton from '@/components/action-button.vue';
import AnimalModelPreview from '@/components/animal-model-preview.vue';
import PartyCrownChart from '@/components/party-crown-chart.vue';
import RoundResultLeaderboard from '@/components/round-result-leaderboard.vue';
import { commonCopy } from '@/locales/zh-TW/common';
import { partyCopy } from '@/locales/zh-TW/party';
import { sortParticipantsByCrown } from '@/party/scoring/crown';
import type { CrownHistory } from '@/party/scoring/crown-history';
import type { Participant } from '@/types/party';

type PartyEndStep = 'celebrate' | 'standings' | 'recap';

const props = defineProps<{
  winnerIds: string[];
  participants: Participant[];
  participantsById: Record<string, Participant>;
  crownHistory: CrownHistory;
}>();

const emit = defineEmits<{
  backHome: [];
}>();

const CELEBRATE_MS = 4200;
const STANDINGS_MS = 4200;

const step = ref<PartyEndStep>('celebrate');
const showFanfare = ref(false);
const showWinnerPop = ref(false);
const showConfetti = ref(false);
let stepTimeoutIds: number[] = [];

const sortedParticipants = computed(() => sortParticipantsByCrown(props.participants));

const rankingIds = computed(() =>
  sortedParticipants.value.map((participant) => participant.id),
);

const primaryWinnerId = computed((): string | null => {
  if (props.winnerIds.length > 0) {
    return props.winnerIds[0];
  }

  return sortedParticipants.value[0]?.id ?? null;
});

const primaryWinner = computed(() => {
  if (!primaryWinnerId.value) {
    return null;
  }

  return props.participantsById[primaryWinnerId.value] ?? null;
});

const podiumSlots = computed(() => {
  const ranked = sortedParticipants.value;
  const first = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  const third = ranked[2] ?? null;

  return [
    { place: 2, participant: second },
    { place: 1, participant: first },
    { place: 3, participant: third },
  ] as const;
});

const leftoverRankingIds = computed(() =>
  rankingIds.value.slice(3),
);

const winnerNames = computed((): string => {
  if (props.winnerIds.length > 0) {
    return props.winnerIds
      .map((winnerId) => props.participantsById[winnerId]?.displayName ?? winnerId)
      .join('、');
  }

  return primaryWinner.value?.displayName ?? '';
});

const partyEndMessage = computed((): string =>
  partyCopy.partyEndWinner.replace('{name}', winnerNames.value),
);

const confettiPieces = Array.from({ length: 36 }, (_, index) => {
  const spread = (index % 9) * 14 - 56;

  return {
    id: index,
    left: `${4 + (index * 27) % 92}%`,
    delay: `${(index % 10) * 0.07}s`,
    duration: `${1.5 + (index % 6) * 0.16}s`,
    hue: (index * 41 + 18) % 360,
    drift: `${spread}px`,
    rotate: `${(index % 5) * 40 - 80}deg`,
  };
});

const starPieces = Array.from({ length: 12 }, (_, index) => ({
  id: index,
  left: `${10 + (index * 7) % 80}%`,
  top: `${8 + (index * 11) % 55}%`,
  delay: `${(index % 6) * 0.12}s`,
  size: `${0.55 + (index % 3) * 0.18}rem`,
}));

function clearStepTimers(): void {
  for (const timeoutId of stepTimeoutIds) {
    window.clearTimeout(timeoutId);
  }

  stepTimeoutIds = [];
}

function schedulePartyEndSequence(): void {
  clearStepTimers();
  step.value = 'celebrate';
  showConfetti.value = true;
  showFanfare.value = false;
  showWinnerPop.value = false;

  stepTimeoutIds = [
    window.setTimeout(() => {
      showFanfare.value = true;
    }, 120),
    window.setTimeout(() => {
      showWinnerPop.value = true;
    }, 280),
    window.setTimeout(() => {
      step.value = 'standings';
    }, CELEBRATE_MS),
    window.setTimeout(() => {
      step.value = 'recap';
    }, CELEBRATE_MS + STANDINGS_MS),
  ];
}

onMounted(() => {
  schedulePartyEndSequence();
});

onScopeDispose(() => {
  clearStepTimers();
});

function playerColorVar(color: Participant['color']): string {
  return `var(--color-${color})`;
}

function placeLabel(place: number): string {
  return String(place);
}
</script>

<template>
  <section class="party-end glass-panel-solid flex flex-col gap-md pad-lg">
    <Transition name="party-end-step" mode="out-in">
      <div
        v-if="step === 'celebrate'"
        key="celebrate"
        class="party-end__celebrate flex flex-col items-center gap-md"
      >
        <div
          class="party-end__confetti"
          :class="{ 'party-end__confetti--active': showConfetti }"
          aria-hidden="true"
        >
          <span
            v-for="piece in confettiPieces"
            :key="piece.id"
            class="party-end__confetti-piece"
            :style="{
              left: piece.left,
              animationDelay: piece.delay,
              animationDuration: piece.duration,
              '--drift': piece.drift,
              '--hue': piece.hue,
              '--spin': piece.rotate,
            }"
          />
        </div>

        <div
          class="party-end__stars"
          aria-hidden="true"
        >
          <span
            v-for="star in starPieces"
            :key="star.id"
            class="party-end__star"
            :style="{
              left: star.left,
              top: star.top,
              width: star.size,
              height: star.size,
              animationDelay: star.delay,
            }"
          />
        </div>

        <div
          class="party-end__burst"
          :class="{ 'party-end__burst--active': showWinnerPop }"
          aria-hidden="true"
        />

        <p
          class="party-end__kicker font-game text-title text-sm text-center"
          :class="{ 'party-end__kicker--in': showFanfare }"
        >
          {{ partyCopy.partyEndCelebrateKicker }}
        </p>

        <p
          class="party-end__fanfare font-game text-title text-center"
          :class="{ 'party-end__fanfare--in': showFanfare }"
        >
          {{ partyCopy.partyEndFanfare }}
        </p>

        <div
          class="party-end__victory-block flex flex-col items-center gap-sm"
          :class="{ 'party-end__victory-block--pop': showWinnerPop }"
        >
          <span class="party-end__victory-shout font-game text-title">
            {{ partyCopy.partyEndVictoryShout }}
          </span>

          <div
            v-if="primaryWinner"
            class="party-end__winner-spotlight flex flex-col items-center gap-sm"
            :style="{ '--winner-color': playerColorVar(primaryWinner.color) }"
          >
            <span class="party-end__crown-badge" aria-hidden="true" />

            <div class="party-end__winner-model">
              <AnimalModelPreview
                hero
                :animal-id="primaryWinner.animalId"
                :player-color="primaryWinner.color"
              />
            </div>

            <p class="party-end__winner-name font-game text-title text-xl text-center">
              {{ primaryWinner.displayName }}
            </p>

            <span class="party-end__champion-chip">
              {{ partyCopy.partyEndChampion }}
            </span>
          </div>

          <p
            v-else
            class="party-end__winner-name font-game text-title text-xl text-center"
          >
            {{ partyEndMessage }}
          </p>
        </div>

        <div class="party-end__dots" aria-hidden="true">
          <span class="party-end__dots-item party-end__dots-item--active" />
          <span class="party-end__dots-item" />
          <span class="party-end__dots-item" />
        </div>
      </div>

      <div
        v-else-if="step === 'standings'"
        key="standings"
        class="party-end__standings flex flex-col gap-md"
      >
        <header class="flex flex-col gap-xs items-center">
          <h2 class="party-end__section-title font-game text-title text-xl text-center">
            {{ partyCopy.partyEndPodiumTitle }}
          </h2>
          <p class="text-sm text-muted text-center">{{ partyCopy.partyEndFinalStandings }}</p>
        </header>

        <div class="party-end__podium" aria-label="podium">
          <div
            v-for="slot in podiumSlots"
            :key="slot.place"
            class="party-end__podium-slot"
            :class="[
              `party-end__podium-slot--p${slot.place}`,
              { 'party-end__podium-slot--empty': !slot.participant },
            ]"
          >
            <template v-if="slot.participant">
              <div
                class="party-end__podium-figure flex flex-col items-center gap-xs"
                :style="{ '--seat-color': playerColorVar(slot.participant.color) }"
              >
                <span
                  v-if="slot.place === 1"
                  class="party-end__podium-crown"
                  aria-hidden="true"
                />
                <div class="party-end__podium-model">
                  <AnimalModelPreview
                    compact
                    :animal-id="slot.participant.animalId"
                    :player-color="slot.participant.color"
                  />
                </div>
                <span class="party-end__podium-name text-sm font-bold">
                  {{ slot.participant.displayName }}
                </span>
              </div>

              <div class="party-end__podium-block font-game">
                <span class="party-end__podium-place">{{ placeLabel(slot.place) }}</span>
                <span class="party-end__podium-crowns">
                  {{ partyCopy.crownCount.replace('{count}', String(slot.participant.crownCount)) }}
                </span>
              </div>
            </template>
          </div>
        </div>

        <RoundResultLeaderboard
          v-if="leftoverRankingIds.length > 0"
          :participant-ids="leftoverRankingIds"
          :participants-by-id="participantsById"
          :last-round-results="{}"
          :last-crown-awards="{}"
          :show-crown-gain-pop="false"
          :show-rank-delta="false"
          :show-final-ranking-order="true"
          :show-round-outcomes="false"
          :pre-round-rankings="leftoverRankingIds"
          :crown-rankings="leftoverRankingIds"
          :champion-ids="[]"
        />

        <div class="party-end__dots" aria-hidden="true">
          <span class="party-end__dots-item" />
          <span class="party-end__dots-item party-end__dots-item--active" />
          <span class="party-end__dots-item" />
        </div>
      </div>

      <div
        v-else
        key="recap"
        class="party-end__recap flex flex-col gap-md"
      >
        <header class="flex flex-col gap-xs items-center">
          <h2 class="party-end__section-title font-game text-title text-xl text-center">
            {{ partyCopy.partyEndRecapTitle }}
          </h2>
        </header>

        <PartyCrownChart
          :participants="participants"
          :crown-history="crownHistory"
        />

        <p class="party-end__summary text-md font-bold text-center">
          {{ partyEndMessage }}
        </p>

        <ActionButton variant="hero" @click="emit('backHome')">
          {{ commonCopy.backHome }}
        </ActionButton>

        <div class="party-end__dots" aria-hidden="true">
          <span class="party-end__dots-item" />
          <span class="party-end__dots-item" />
          <span class="party-end__dots-item party-end__dots-item--active" />
        </div>
      </div>
    </Transition>
  </section>
</template>

<style lang="scss" scoped>
.party-end {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-lg);
  min-height: 22rem;
}

.party-end-step-enter-active,
.party-end-step-leave-active {
  transition: opacity 0.38s ease, transform 0.38s ease;
}

.party-end-step-enter-from {
  opacity: 0;
  transform: translateY(var(--space-md)) scale(0.98);
}

.party-end-step-leave-to {
  opacity: 0;
  transform: translateY(calc(-1 * var(--space-sm))) scale(0.98);
}

.party-end__celebrate {
  position: relative;
  padding-top: var(--space-sm);
  padding-bottom: var(--space-xs);
  min-height: 20rem;
}

.party-end__confetti {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  opacity: 0;
  z-index: 2;

  &--active {
    opacity: 1;
  }
}

.party-end__confetti-piece {
  position: absolute;
  top: -14%;
  width: var(--space-sm);
  height: var(--space-md);
  border-radius: 2px;
  background: hsl(var(--hue), 85%, 62%);
  opacity: 0;
  animation: party-end-confetti-fall linear infinite;

  &:nth-child(odd) {
    width: var(--space-sm);
    height: var(--space-sm);
    border-radius: 50%;
  }

  &:nth-child(3n) {
    width: 0.65rem;
    height: 0.65rem;
    clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
  }
}

.party-end__stars {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}

.party-end__star {
  position: absolute;
  display: block;
  background: var(--color-warning);
  clip-path: polygon(
    50% 0%,
    61% 35%,
    98% 35%,
    68% 57%,
    79% 91%,
    50% 70%,
    21% 91%,
    32% 57%,
    2% 35%,
    39% 35%
  );
  opacity: 0.85;
  animation: party-end-star-twinkle 1.2s ease-in-out infinite;
}

.party-end__burst {
  position: absolute;
  top: 16%;
  left: 50%;
  width: min(18rem, 78vw);
  height: min(18rem, 78vw);
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--color-warning) 48%, transparent) 0%,
    color-mix(in srgb, var(--color-accent) 18%, transparent) 42%,
    transparent 74%
  );
  opacity: 0;
  transform: translateX(-50%) scale(0.72);
  pointer-events: none;

  &--active {
    animation: party-end-burst 1.15s ease-in-out infinite;
  }
}

.party-end__kicker {
  position: relative;
  z-index: 3;
  margin: 0;
  letter-spacing: 0.14em;
  color: var(--color-text-muted);
  opacity: 0.55;
  transform: translateY(var(--space-sm));

  &--in {
    animation: party-end-kicker-rise 0.45s cubic-bezier(0.22, 1.08, 0.36, 1) forwards;
  }
}

.party-end__fanfare {
  position: relative;
  z-index: 3;
  margin: 0;
  font-size: var(--font-size-2xl);
  letter-spacing: 0.1em;
  color: var(--color-accent);
  opacity: 0;
  transform: scale(0.7) rotate(-4deg);

  &--in {
    animation: party-end-fanfare-slam 0.55s cubic-bezier(0.22, 1.2, 0.36, 1) forwards;
  }
}

.party-end__victory-block {
  position: relative;
  z-index: 3;
  width: 100%;
  opacity: 0.35;
  transform: translateY(var(--space-sm)) scale(0.96);

  &--pop {
    animation: party-end-victory-pop 0.66s cubic-bezier(0.22, 1.12, 0.36, 1) forwards;
  }
}

.party-end__victory-shout {
  margin: 0;
  font-size: clamp(2.4rem, 12vw, 3.4rem);
  line-height: var(--line-height-tight);
  letter-spacing: 0.08em;
  color: var(--color-warning);
  text-shadow:
    0 var(--space-xs) 0 rgba(92, 77, 130, 0.2),
    0 0 var(--space-lg) color-mix(in srgb, var(--color-warning) 40%, transparent);
  transform: rotate(-4deg);
}

.party-end__winner-spotlight {
  width: 100%;
  padding: var(--space-md);
  border: 3px solid rgba(255, 255, 255, 0.8);
  border-radius: var(--radius-lg);
  background:
    linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.92) 0%,
      color-mix(in srgb, var(--winner-color, var(--color-accent)) 14%, white) 100%
    );
  box-shadow:
    6px 6px 0 rgba(92, 77, 130, 0.14),
    0 0 0 4px color-mix(in srgb, var(--winner-color, var(--color-accent)) 18%, transparent);
  animation: party-end-spotlight-bob 2.2s ease-in-out infinite;
}

.party-end__crown-badge {
  display: block;
  width: 2.4rem;
  height: 1.45rem;
  background: linear-gradient(180deg, #ffd86b 0%, #e0a93a 100%);
  clip-path: polygon(50% 0%, 0% 100%, 18% 100%, 50% 58%, 82% 100%, 100% 100%);
  filter: drop-shadow(0 2px 0 rgba(92, 77, 130, 0.18));
  animation: party-end-crown-bounce 1s ease-in-out infinite;
}

.party-end__winner-model {
  width: min(100%, 12rem);
  padding: var(--space-xs);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--winner-color, var(--color-accent)) 12%, white);
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--winner-color, var(--color-accent)) 24%, transparent);
}

.party-end__winner-name {
  margin: 0;
  color: var(--color-text-heading);
}

.party-end__champion-chip {
  display: inline-flex;
  align-items: center;
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-warning) 28%, white);
  color: #8a6110;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.12em;
}

.party-end__section-title {
  margin: 0;
}

.party-end__podium {
  display: grid;
  grid-template-columns: 1fr 1.15fr 1fr;
  align-items: end;
  gap: var(--space-sm);
  min-height: 14rem;
  padding: var(--space-sm) var(--space-xs) 0;
}

.party-end__podium-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  min-width: 0;

  &--empty {
    opacity: 0.35;
  }

  &--p1 {
    .party-end__podium-block {
      height: 7.5rem;
      background: linear-gradient(180deg, #ffe7a0 0%, #f0c14b 100%);
      border-color: #e2b33d;
    }

    .party-end__podium-figure {
      animation: party-end-champ-hop 1.1s ease-in-out infinite;
    }
  }

  &--p2 .party-end__podium-block {
    height: 5.5rem;
    background: linear-gradient(180deg, #f0f2f7 0%, #cfd6e4 100%);
    border-color: #b7c0d1;
  }

  &--p3 .party-end__podium-block {
    height: 4.25rem;
    background: linear-gradient(180deg, #f3d2b4 0%, #d9a174 100%);
    border-color: #c48b5d;
  }
}

.party-end__podium-figure {
  width: 100%;
}

.party-end__podium-crown {
  display: block;
  width: 1.6rem;
  height: 1rem;
  background: linear-gradient(180deg, #ffd86b 0%, #e0a93a 100%);
  clip-path: polygon(50% 0%, 0% 100%, 18% 100%, 50% 58%, 82% 100%, 100% 100%);
  filter: drop-shadow(0 2px 0 rgba(92, 77, 130, 0.16));
}

.party-end__podium-model {
  width: 100%;
  max-width: 5.5rem;
  padding: 2px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--seat-color, var(--color-accent)) 14%, white);
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--seat-color, var(--color-accent)) 22%, transparent);
}

.party-end__podium-name {
  max-width: 100%;
  overflow: hidden;
  color: var(--color-text-heading);
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.party-end__podium-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  width: 100%;
  border: 3px solid;
  border-radius: var(--radius-md) var(--radius-md) var(--radius-sm) var(--radius-sm);
  box-shadow: 4px 4px 0 rgba(92, 77, 130, 0.12);
  animation: party-end-podium-rise 0.55s cubic-bezier(0.22, 1.12, 0.36, 1) backwards;
}

.party-end__podium-slot--p2 .party-end__podium-block {
  animation-delay: 0.08s;
}

.party-end__podium-slot--p1 .party-end__podium-block {
  animation-delay: 0.16s;
}

.party-end__podium-slot--p3 .party-end__podium-block {
  animation-delay: 0.24s;
}

.party-end__podium-place {
  font-size: var(--font-size-2xl);
  line-height: 1;
  color: var(--color-text-heading);
}

.party-end__podium-crowns {
  font-family: var(--font-family-base);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-muted);
}

.party-end__summary {
  margin: 0;
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  color: var(--color-text-heading);
}

.party-end__dots {
  display: flex;
  justify-content: center;
  gap: var(--space-xs);
  margin-top: var(--space-xs);
}

.party-end__dots-item {
  width: var(--space-sm);
  height: var(--space-sm);
  border-radius: 50%;
  background: color-mix(in srgb, var(--color-accent) 24%, transparent);

  &--active {
    background: var(--color-accent);
    transform: scale(1.15);
  }
}

@keyframes party-end-confetti-fall {
  0% {
    opacity: 0;
    transform: translate3d(0, -10%, 0) rotate(0deg);
  }

  12% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: translate3d(var(--drift), 120%, 0) rotate(var(--spin));
  }
}

@keyframes party-end-star-twinkle {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.85) rotate(0deg);
  }

  50% {
    opacity: 1;
    transform: scale(1.15) rotate(12deg);
  }
}

@keyframes party-end-burst {
  0%,
  100% {
    opacity: 0.55;
    transform: translateX(-50%) scale(0.92);
  }

  50% {
    opacity: 1;
    transform: translateX(-50%) scale(1.08);
  }
}

@keyframes party-end-kicker-rise {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes party-end-fanfare-slam {
  0% {
    opacity: 0;
    transform: scale(0.7) rotate(-8deg);
  }

  70% {
    opacity: 1;
    transform: scale(1.08) rotate(2deg);
  }

  100% {
    opacity: 1;
    transform: scale(1) rotate(-2deg);
  }
}

@keyframes party-end-victory-pop {
  0% {
    opacity: 0.35;
    transform: translateY(var(--space-md)) scale(0.9);
  }

  70% {
    opacity: 1;
    transform: translateY(0) scale(1.04);
  }

  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes party-end-spotlight-bob {
  0%,
  100% {
    transform: translateY(0) rotate(-0.5deg);
  }

  50% {
    transform: translateY(-5px) rotate(0.5deg);
  }
}

@keyframes party-end-crown-bounce {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }

  50% {
    transform: translateY(-4px) scale(1.1);
  }
}

@keyframes party-end-champ-hop {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-6px);
  }
}

@keyframes party-end-podium-rise {
  from {
    opacity: 0;
    transform: translateY(var(--space-lg));
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
