<script setup lang="ts">
import { computed } from 'vue';

import AnimalModelPreview from '@/components/animal-model-preview.vue';
import CuteCrownIcon from '@/components/cute-crown-icon.vue';
import { partyCopy } from '@/locales/zh-TW/party';
import { sortParticipantsByCrown } from '@/party/scoring/crown';
import type { Participant } from '@/types/party';

const props = defineProps<{
  roundLabel: string;
  crownHint: string;
  isSuddenDeath: boolean;
  introSecondsLeft: number;
  gameName: string;
  gameRules: string;
  participants: Participant[];
  targetCrowns: number;
}>();

const sortedParticipants = computed(() => sortParticipantsByCrown(props.participants));

const introTitle = computed(() =>
  props.isSuddenDeath ? partyCopy.suddenDeathTitle : partyCopy.introTitle,
);

function playerToneClass(color: Participant['color']): string {
  return `party-intro__lane--${color}`;
}

function crownSlots(): number[] {
  return Array.from({ length: props.targetCrowns }, (_, index) => index + 1);
}
</script>

<template>
  <section class="party-intro">
    <div class="party-intro__sparkles" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>

    <header class="party-intro__top flex flex-col gap-sm items-center">
      <div class="party-intro__round-badge font-game">
        {{ roundLabel }}
      </div>
      <p class="party-intro__goal text-sm text-center">
        <CuteCrownIcon size="sm" bounce />
        {{ crownHint }}
      </p>
    </header>

    <article class="party-intro__poster">
      <span class="party-intro__poster-tag font-game">{{ partyCopy.nextGameLabel }}</span>
      <h2 class="party-intro__poster-title font-game text-title">
        {{ introTitle }}
      </h2>
      <p class="party-intro__poster-game font-game text-title">
        {{ gameName }}
      </p>
      <p class="party-intro__poster-rules text-sm text-center">
        {{ gameRules }}
      </p>
    </article>

    <section
      class="party-intro__race"
      :aria-label="partyCopy.introCrownRaceTitle"
    >
      <h3 class="party-intro__race-title text-sm font-bold text-center">
        {{ partyCopy.introCrownRaceTitle }}
      </h3>

      <ul class="party-intro__lanes">
        <li
          v-for="(participant, index) in sortedParticipants"
          :key="participant.id"
          class="party-intro__lane"
          :class="[
            playerToneClass(participant.color),
            { 'party-intro__lane--leader': index === 0 && participant.crownCount > 0 },
          ]"
        >
          <div class="party-intro__lane-avatar">
            <AnimalModelPreview
              compact
              :animal-id="participant.animalId"
              :player-color="participant.color"
            />
          </div>

          <div class="party-intro__lane-body flex flex-col gap-xs">
            <span class="party-intro__lane-name">{{ participant.displayName }}</span>
            <div class="party-intro__lane-track">
              <span
                v-for="slot in crownSlots()"
                :key="`${participant.id}-slot-${slot}`"
                class="party-intro__lane-pip"
                :class="{ 'party-intro__lane-pip--filled': slot <= participant.crownCount }"
              >
                <CuteCrownIcon
                  v-if="slot <= participant.crownCount"
                  size="sm"
                />
              </span>
            </div>
          </div>

          <span class="party-intro__lane-score font-game">
            {{ participant.crownCount }}
          </span>
        </li>
      </ul>
    </section>

    <footer
      class="party-intro__countdown"
      aria-live="polite"
    >
      <p class="party-intro__countdown-label font-game">
        {{ partyCopy.countdownLabel }}
      </p>
      <div
        class="party-intro__countdown-ring"
        :class="{ 'party-intro__countdown-ring--urgent': introSecondsLeft <= 1 }"
      >
        <span
          :key="introSecondsLeft"
          class="party-intro__countdown-value font-game"
        >
          {{ introSecondsLeft }}
        </span>
      </div>
    </footer>
  </section>
</template>

<style lang="scss" scoped>
.party-intro {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-lg);
  overflow: hidden;
  border: 3px solid rgba(255, 255, 255, 0.82);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(
      circle at 50% 0%,
      color-mix(in srgb, var(--color-accent) 14%, white) 0%,
      transparent 55%
    ),
    linear-gradient(180deg, rgba(255, 255, 255, 0.94) 0%, rgba(248, 243, 255, 0.92) 100%);
  box-shadow:
    6px 6px 0 rgba(92, 77, 130, 0.12),
    0 var(--space-lg) var(--space-xl) rgba(92, 77, 130, 0.08);
}

.party-intro__sparkles {
  position: absolute;
  inset: var(--space-sm) var(--space-md) auto;
  display: flex;
  justify-content: space-between;
  pointer-events: none;

  span {
    width: var(--space-sm);
    height: var(--space-sm);
    border-radius: 50%;
    background: color-mix(in srgb, var(--color-warning) 55%, white);
    opacity: 0.7;
    animation: party-intro-sparkle 1.6s ease-in-out infinite;

    &:nth-child(2) {
      animation-delay: 0.3s;
      transform: scale(0.8);
    }

    &:nth-child(3) {
      animation-delay: 0.6s;
    }
  }
}

.party-intro__top {
  position: relative;
  z-index: 1;
}

.party-intro__round-badge {
  padding: var(--space-xs) var(--space-md);
  border: 2px solid rgba(255, 255, 255, 0.9);
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-hover) 100%);
  box-shadow: 3px 3px 0 rgba(92, 77, 130, 0.18);
  color: var(--color-on-accent);
  font-size: var(--font-size-sm);
  letter-spacing: 0.06em;
  transform: rotate(-2deg);
}

.party-intro__goal {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  margin: 0;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-warning) 16%, white);
  color: var(--color-text-heading);
  font-weight: var(--font-weight-bold);
}

.party-intro__poster {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-md) var(--space-md) var(--space-lg);
  border: 3px solid rgba(255, 255, 255, 0.88);
  border-radius: var(--radius-md);
  background: linear-gradient(
    165deg,
    rgba(255, 255, 255, 0.96) 0%,
    color-mix(in srgb, var(--color-accent) 8%, white) 100%
  );
  box-shadow: 4px 4px 0 rgba(92, 77, 130, 0.1);
  transform: rotate(-0.8deg);
}

.party-intro__poster-tag {
  position: absolute;
  top: calc(-1 * var(--space-sm));
  left: var(--space-md);
  padding: var(--space-xs) var(--space-sm);
  border: 2px solid rgba(255, 255, 255, 0.9);
  border-radius: var(--radius-full);
  background: var(--color-text-heading);
  color: #f5f0e8;
  font-size: var(--font-size-xs);
  letter-spacing: 0.1em;
  transform: rotate(-6deg);
}

.party-intro__poster-title,
.party-intro__poster-game,
.party-intro__poster-rules {
  margin: 0;
}

.party-intro__poster-title {
  margin-top: var(--space-xs);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  letter-spacing: 0.12em;
}

.party-intro__poster-game {
  color: var(--color-text-heading);
  font-size: var(--font-size-2xl);
  line-height: var(--line-height-tight);
  text-align: center;
}

.party-intro__poster-rules {
  max-width: 18rem;
  color: var(--color-text-muted);
  line-height: var(--line-height-normal);
}

.party-intro__race-title {
  margin: 0 0 var(--space-sm);
  color: var(--color-text-heading);
  letter-spacing: 0.08em;
}

.party-intro__lanes {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  list-style: none;
  margin: 0;
  padding: 0;
}

.party-intro__lane {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  border: 2px solid rgba(255, 255, 255, 0.75);
  border-left-width: 5px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 2px 2px 0 rgba(92, 77, 130, 0.06);

  &--player-1 {
    border-left-color: var(--color-player-1);
    --lane-soft: rgba(232, 107, 138, 0.18);
  }

  &--player-2 {
    border-left-color: var(--color-player-2);
    --lane-soft: rgba(155, 127, 212, 0.18);
  }

  &--player-3 {
    border-left-color: var(--color-player-3);
    --lane-soft: rgba(107, 168, 232, 0.18);
  }

  &--player-4 {
    border-left-color: var(--color-player-4);
    --lane-soft: rgba(126, 207, 154, 0.18);
  }

  &--leader {
    background: rgba(255, 255, 255, 0.92);
    box-shadow:
      2px 2px 0 rgba(92, 77, 130, 0.1),
      0 0 0 1px color-mix(in srgb, var(--color-warning) 28%, transparent);
  }
}

.party-intro__lane-avatar {
  width: 3.25rem;
  flex-shrink: 0;
  padding: 2px;
  border-radius: var(--radius-sm);
  background: var(--lane-soft, rgba(155, 127, 212, 0.12));
}

.party-intro__lane-body {
  min-width: 0;
}

.party-intro__lane-name {
  overflow: hidden;
  color: var(--color-text-heading);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.party-intro__lane-track {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.party-intro__lane-pip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--space-md);
  height: var(--space-md);
  border: 2px dashed color-mix(in srgb, var(--color-text-muted) 28%, transparent);
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.55);
  line-height: 0;

  &--filled {
    border-style: solid;
    border-color: color-mix(in srgb, var(--color-warning) 45%, transparent);
    background: color-mix(in srgb, var(--color-warning) 14%, white);
  }

  :deep(.cute-crown) {
    width: 0.62rem;
    height: 0.62rem;
  }
}

.party-intro__lane-score {
  min-width: 1.25rem;
  color: var(--color-accent);
  font-size: var(--font-size-lg);
  line-height: 1;
  text-align: center;
}

.party-intro__countdown {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
}

.party-intro__countdown-label {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  letter-spacing: 0.14em;
  line-height: 1;
}

.party-intro__countdown-ring {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 5rem;
  height: 5rem;
  border: 4px solid color-mix(in srgb, var(--color-accent) 28%, white);
  border-radius: 50%;
  background: color-mix(in srgb, var(--color-surface-solid) 92%, white);
  box-shadow: inset 0 0 0 2px color-mix(in srgb, white 70%, transparent);

  &--urgent {
    border-color: color-mix(in srgb, var(--color-warning) 55%, white);
  }
}

.party-intro__countdown-value {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  margin: 0;
  color: var(--color-accent);
  font-size: var(--font-size-3xl);
  line-height: 1;
  text-align: center;
  /* Luckiest Guy 基線偏上，光學校正回圓心 */
  padding-top: 0.16em;
  animation: party-intro-count-pop 0.42s cubic-bezier(0.22, 1.12, 0.36, 1);
}

.party-intro__countdown-ring--urgent .party-intro__countdown-value {
  color: var(--color-warning);
}

@keyframes party-intro-sparkle {
  0%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }

  50% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

@keyframes party-intro-count-pop {
  0% {
    opacity: 0.4;
  }

  100% {
    opacity: 1;
  }
}
</style>
