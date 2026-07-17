<script setup lang="ts">
import AnimalModelPreview from '@/components/animal-model-preview.vue';
import CuteCrownIcon from '@/components/cute-crown-icon.vue';
import { arenaBumpCopy } from '@/minigames/arena-bump/locales/zh-TW';
import { rpsCopy } from '@/minigames/rock-paper-scissors/locales/zh-TW';
import { partyCopy } from '@/locales/zh-TW/party';
import type { Participant } from '@/types/party';

const props = defineProps<{
  participantIds: string[];
  participantsById: Record<string, Participant>;
  lastRoundResults: Record<string, string>;
  lastCrownAwards: Record<string, number>;
  showCrownGainPop: boolean;
  showRankDelta: boolean;
  showFinalRankingOrder: boolean;
  /** 顯示本局勝負戳記（猜拳／擂台） */
  showRoundOutcomes: boolean;
  /** 擂台用「倖存／出局」文案 */
  isArenaBumpGame?: boolean;
  preRoundRankings: string[];
  crownRankings: string[];
  championIds?: string[];
}>();

function displayedCrownCount(participantId: string): number {
  const current = props.participantsById[participantId]?.crownCount ?? 0;
  const award = props.lastCrownAwards[participantId] ?? 0;

  if (props.showFinalRankingOrder || award === 0) {
    return current;
  }

  return current - award;
}

function hasCrownGain(participantId: string): boolean {
  return (props.lastCrownAwards[participantId] ?? 0) > 0;
}

function rankDelta(participantId: string): number {
  const previousIndex = props.preRoundRankings.indexOf(participantId);
  const nextIndex = props.crownRankings.indexOf(participantId);

  if (previousIndex === -1 || nextIndex === -1) {
    return 0;
  }

  return previousIndex - nextIndex;
}

function rankDeltaLabel(delta: number): string {
  if (delta > 0) {
    return partyCopy.rankUp.replace('{count}', String(delta));
  }

  return partyCopy.rankDown.replace('{count}', String(Math.abs(delta)));
}

function rankDeltaClass(participantId: string): string {
  const delta = rankDelta(participantId);

  if (delta > 0) {
    return 'result-card__delta--up';
  }

  if (delta < 0) {
    return 'result-card__delta--down';
  }

  return '';
}

function playerCardClass(color: Participant['color'] | undefined): string {
  return color ? `result-card--${color}` : '';
}

function rankStickerClass(rankIndex: number): string {
  if (rankIndex === 0) {
    return 'result-card__rank--gold';
  }

  if (rankIndex === 1) {
    return 'result-card__rank--silver';
  }

  if (rankIndex === 2) {
    return 'result-card__rank--bronze';
  }

  return '';
}

function resultText(participantId: string): string {
  const outcome = props.lastRoundResults[participantId];

  if (props.isArenaBumpGame) {
    if (outcome === 'win') {
      return arenaBumpCopy.resultSurvive;
    }

    if (outcome === 'lose') {
      return arenaBumpCopy.resultFallen;
    }

    return '';
  }

  if (outcome === 'win') {
    return rpsCopy.resultWin;
  }

  if (outcome === 'lose') {
    return rpsCopy.resultLose;
  }

  if (outcome === 'tie') {
    return rpsCopy.resultTie;
  }

  return '';
}

function resultBadgeClass(participantId: string): string {
  const outcome = props.lastRoundResults[participantId];

  if (outcome === 'win') {
    return 'result-card__stamp--win';
  }

  if (outcome === 'lose') {
    return 'result-card__stamp--lose';
  }

  return 'result-card__stamp--tie';
}

function isChampion(participantId: string): boolean {
  return props.championIds?.includes(participantId) ?? false;
}

</script>

<template>
  <TransitionGroup
    tag="ul"
    class="result-board"
    name="result-board-rank"
  >
    <li
      v-for="(participantId, rankIndex) in participantIds"
      :key="participantId"
      class="result-card pad-sm"
      :class="[
        playerCardClass(participantsById[participantId]?.color),
        {
          'result-card--top': rankIndex === 0,
          'result-card--gain': hasCrownGain(participantId) && showCrownGainPop,
          'result-card--shift': showFinalRankingOrder && rankDelta(participantId) !== 0,
        },
      ]"
    >
      <div class="result-card__rank-col flex flex-col items-center gap-xs">
        <span
          class="result-card__rank font-game"
          :class="rankStickerClass(rankIndex)"
        >
          {{ rankIndex + 1 }}
        </span>
        <span
          v-if="showRankDelta && rankDelta(participantId) !== 0"
          class="result-card__delta"
          :class="rankDeltaClass(participantId)"
        >
          {{ rankDeltaLabel(rankDelta(participantId)) }}
        </span>
      </div>

      <div class="result-card__avatar-wrap">
        <AnimalModelPreview
          v-if="participantsById[participantId]"
          compact
          :animal-id="participantsById[participantId]!.animalId"
          :player-color="participantsById[participantId]!.color"
        />
      </div>

      <div class="result-card__body flex flex-col gap-xs">
        <span class="result-card__name text-md font-bold">
          {{ participantsById[participantId]?.displayName ?? participantId }}
        </span>

        <div class="result-card__meta flex items-center gap-xs">
          <span
            v-if="isChampion(participantId)"
            class="result-card__stamp result-card__stamp--win"
          >
            {{ partyCopy.partyEndChampion }}
          </span>

          <span
            v-else-if="showRoundOutcomes && lastRoundResults[participantId]"
            class="result-card__stamp"
            :class="resultBadgeClass(participantId)"
          >
            {{ resultText(participantId) }}
          </span>

          <span
            v-if="hasCrownGain(participantId) && showCrownGainPop"
            class="result-card__gain-pop"
            aria-hidden="true"
          >
            {{ partyCopy.crownGain }}
          </span>
        </div>

      </div>

      <div class="result-card__score flex flex-col items-end gap-xs">
        <span
          class="result-card__crown-total text-sm font-bold"
          :class="{ 'result-card__crown-total--bump': hasCrownGain(participantId) && showFinalRankingOrder }"
        >
          <CuteCrownIcon size="sm" />
          × {{ displayedCrownCount(participantId) }}
        </span>
      </div>
    </li>
  </TransitionGroup>
</template>

<style lang="scss" scoped>
.result-board {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  list-style: none;
  margin: 0;
  padding: 0;
  position: relative;
}

.result-board-rank-move {
  transition: transform 0.58s cubic-bezier(0.22, 1, 0.36, 1);
  z-index: 1;
}

.result-card {
  position: relative;
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: center;
  gap: var(--space-sm);
  border: 3px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 4px 4px 0 rgba(92, 77, 130, 0.12);
  animation: result-card-rise 0.45s cubic-bezier(0.22, 1.08, 0.36, 1) backwards;

  &:nth-child(1) {
    animation-delay: 0.04s;
  }

  &:nth-child(2) {
    animation-delay: 0.1s;
  }

  &:nth-child(3) {
    animation-delay: 0.16s;
  }

  &:nth-child(4) {
    animation-delay: 0.22s;
  }

  &--player-1 {
    --player-tone: var(--color-player-1);
    --player-soft: rgba(232, 107, 138, 0.22);
  }

  &--player-2 {
    --player-tone: var(--color-player-2);
    --player-soft: rgba(155, 127, 212, 0.22);
  }

  &--player-3 {
    --player-tone: var(--color-player-3);
    --player-soft: rgba(107, 168, 232, 0.22);
  }

  &--player-4 {
    --player-tone: var(--color-player-4);
    --player-soft: rgba(126, 207, 154, 0.22);
  }

  &--top {
    border-color: color-mix(in srgb, var(--player-tone, var(--color-accent)) 55%, var(--color-border));
    background: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.92) 0%,
      color-mix(in srgb, var(--player-soft, rgba(155, 127, 212, 0.22)) 70%, white) 100%
    );
    box-shadow:
      4px 4px 0 rgba(92, 77, 130, 0.14),
      0 0 0 1px color-mix(in srgb, var(--player-tone, var(--color-accent)) 18%, transparent);
  }

  &--gain {
    animation: result-card-gain 0.55s ease 0.34s backwards;
  }

  &--shift {
    z-index: 2;
  }

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: var(--space-md);
    right: var(--space-md);
    height: var(--space-xs);
    border-radius: 0 0 var(--radius-full) var(--radius-full);
    background: var(--player-tone, var(--color-accent));
    opacity: 0.85;
  }
}

.result-card__rank-col {
  flex-shrink: 0;
  width: 2rem;
  padding-top: var(--space-xs);
}

.result-card__rank {
  display: grid;
  place-items: center;
  width: 1.85rem;
  height: 1.85rem;
  border: 2px solid rgba(92, 77, 130, 0.18);
  border-radius: 50%;
  background: var(--player-soft, rgba(155, 127, 212, 0.14));
  font-size: var(--font-size-sm);
  line-height: 1;
  color: var(--color-text-heading);

  &--gold {
    border-color: color-mix(in srgb, var(--color-warning) 55%, white);
    background: color-mix(in srgb, var(--color-warning) 28%, white);
    color: #8a5a12;
  }

  &--silver {
    border-color: rgba(138, 124, 168, 0.35);
    background: rgba(220, 214, 232, 0.85);
    color: #6a5f82;
  }

  &--bronze {
    border-color: color-mix(in srgb, var(--color-player-1) 35%, white);
    background: color-mix(in srgb, var(--color-player-1) 18%, white);
    color: #9a5068;
  }
}

.result-card__delta {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  line-height: 1;
  animation: result-card-delta 0.42s cubic-bezier(0.22, 1.08, 0.36, 1) backwards;

  &--up {
    color: var(--color-success);
  }

  &--down {
    color: var(--color-text-muted);
  }
}

.result-card__avatar-wrap {
  width: 3.25rem;
  flex-shrink: 0;
}

.result-card__body {
  min-width: 0;
  padding-top: var(--space-xs);
}

.result-card__name {
  overflow: hidden;
  color: var(--color-text-heading);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-card__meta {
  position: relative;
  flex-wrap: wrap;
}

.result-card__stamp {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.5rem;
  padding: var(--space-xs) var(--space-sm);
  border: 2px solid color-mix(in srgb, var(--color-border) 80%, white);
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.04em;
  line-height: 1;

  &--win {
    border-color: color-mix(in srgb, var(--color-success) 40%, white);
    background: color-mix(in srgb, var(--color-success) 18%, white);
    color: var(--color-success);
  }

  &--lose {
    border-color: color-mix(in srgb, var(--color-text-muted) 28%, white);
    background: color-mix(in srgb, var(--color-text-muted) 10%, white);
    color: var(--color-text-muted);
  }

  &--tie {
    border-color: color-mix(in srgb, var(--color-warning) 45%, white);
    background: color-mix(in srgb, var(--color-warning) 20%, white);
    color: var(--color-text-heading);
  }
}

.result-card__gain-pop {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-accent) 16%, transparent);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  color: var(--color-accent);
  animation: result-card-gain-pop 0.72s cubic-bezier(0.22, 1.08, 0.36, 1) backwards;
}


.result-card__score {
  flex-shrink: 0;
  padding-top: var(--space-xs);
}

.result-card__crown-total {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  min-height: 1.75rem;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-warning) 16%, white);
  color: var(--color-text-heading);
  line-height: 1;

  &--bump {
    animation: result-card-total-bump 0.42s cubic-bezier(0.22, 1.08, 0.36, 1);
  }
}

@keyframes result-card-rise {
  from {
    opacity: 0;
    transform: translateY(calc(var(--space-sm) + var(--space-xs)));
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes result-card-gain {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-accent) 28%, transparent);
  }

  100% {
    box-shadow: 4px 4px 0 rgba(92, 77, 130, 0.14);
  }
}

@keyframes result-card-delta {
  from {
    opacity: 0;
    transform: translateY(var(--space-xs));
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes result-card-gain-pop {
  0% {
    opacity: 0;
    transform: scale(0.72);
  }

  45% {
    opacity: 1;
    transform: scale(1.08);
  }

  100% {
    opacity: 0.85;
    transform: scale(1);
  }
}


@keyframes result-card-total-bump {
  0% {
    transform: scale(1);
  }

  40% {
    transform: scale(1.12);
  }

  100% {
    transform: scale(1);
  }
}
</style>
