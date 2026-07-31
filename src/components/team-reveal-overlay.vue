<script setup lang="ts">
import { computed } from 'vue';

import AnimalModelPreview from '@/components/animal-model-preview.vue';
import { usePartyStore } from '@/stores/party-store';
import type { Participant } from '@/types/party';

export interface TeamRevealCopy {
  title: string;
  teamA: string;
  teamB: string;
  vs: string;
  go: string;
  localPlayerTag: string;
}

const props = defineProps<{
  teamAIds: string[];
  teamBIds: string[];
  showGo: boolean;
  localParticipantId: string | null;
  copy: TeamRevealCopy;
}>();

const partyStore = usePartyStore();

function buildRows(ids: string[]): Participant[] {
  return ids.flatMap((id) => {
    const participant = partyStore.participants.find((entry) => entry.id === id);
    return participant ? [participant] : [];
  });
}

const teamARows = computed(() => buildRows(props.teamAIds));
const teamBRows = computed(() => buildRows(props.teamBIds));
</script>

<template>
  <div
    class="team-reveal game-chrome"
    aria-live="polite"
  >
    <p class="team-reveal__title font-game">
      {{ copy.title }}
    </p>
    <div class="team-reveal__matchup">
      <div class="team-reveal__side team-reveal__side--red">
        <p class="team-reveal__side-label font-game">
          {{ copy.teamA }}
        </p>
        <ul class="team-reveal__list">
          <li
            v-for="participant in teamARows"
            :key="participant.id"
            class="team-reveal__card"
            :class="{ 'team-reveal__card--local': participant.id === localParticipantId }"
          >
            <div class="team-reveal__portrait">
              <AnimalModelPreview
                compact
                :animal-id="participant.animalId"
                :player-color="participant.color"
              />
            </div>
            <span class="team-reveal__name font-game">
              {{ participant.displayName }}
              <span
                v-if="participant.id === localParticipantId"
                class="team-reveal__you"
              >{{ copy.localPlayerTag }}</span>
            </span>
          </li>
        </ul>
      </div>
      <p
        class="team-reveal__vs font-game"
        aria-hidden="true"
      >
        {{ copy.vs }}
      </p>
      <div class="team-reveal__side team-reveal__side--blue">
        <p class="team-reveal__side-label font-game">
          {{ copy.teamB }}
        </p>
        <ul class="team-reveal__list">
          <li
            v-for="participant in teamBRows"
            :key="participant.id"
            class="team-reveal__card"
            :class="{ 'team-reveal__card--local': participant.id === localParticipantId }"
          >
            <div class="team-reveal__portrait">
              <AnimalModelPreview
                compact
                :animal-id="participant.animalId"
                :player-color="participant.color"
              />
            </div>
            <span class="team-reveal__name font-game">
              {{ participant.displayName }}
              <span
                v-if="participant.id === localParticipantId"
                class="team-reveal__you"
              >{{ copy.localPlayerTag }}</span>
            </span>
          </li>
        </ul>
      </div>
    </div>
    <p
      v-if="showGo"
      class="team-reveal__go font-game"
    >
      {{ copy.go }}
    </p>
  </div>
</template>

<style lang="scss" scoped>
.team-reveal {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-lg);
  padding: var(--space-xl);
  pointer-events: none;
  background: color-mix(in srgb, var(--color-bg) 42%, transparent);
}

.team-reveal__title {
  margin: 0;
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-on-accent);
  -webkit-text-stroke: 2px var(--color-text-heading);
  paint-order: stroke fill;
  animation: team-reveal-pop 0.55s cubic-bezier(0.22, 1.4, 0.36, 1) both;
}

.team-reveal__matchup {
  display: flex;
  align-items: stretch;
  justify-content: center;
  gap: var(--space-lg);
  width: min(52rem, 94vw);
}

.team-reveal__side {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-md);
  border: 4px solid var(--color-on-accent);
  border-radius: var(--radius-lg);
  background: var(--color-surface-solid);
  box-shadow: 0 var(--space-sm) 0 color-mix(in srgb, var(--color-text-heading) 28%, transparent);
  animation: team-reveal-pop 0.6s cubic-bezier(0.22, 1.4, 0.36, 1) both;

  &--red {
    animation-delay: 0.08s;
    border-color: var(--color-player-1);
  }

  &--blue {
    animation-delay: 0.16s;
    border-color: var(--color-player-3);
  }
}

.team-reveal__side-label {
  margin: 0;
  text-align: center;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
}

.team-reveal__side--red .team-reveal__side-label {
  color: var(--color-player-1);
}

.team-reveal__side--blue .team-reveal__side-label {
  color: var(--color-player-3);
}

.team-reveal__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.team-reveal__card {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-bg) 8%, transparent);

  &--local {
    outline: 3px solid var(--color-accent);
    outline-offset: 1px;
  }
}

.team-reveal__portrait {
  width: 3.5rem;
  height: 3.5rem;
  flex-shrink: 0;
}

.team-reveal__name {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-xs);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
}

.team-reveal__you {
  padding: 0 var(--space-xs);
  border-radius: var(--radius-full);
  background: var(--color-accent);
  color: var(--color-on-accent);
  font-size: var(--font-size-xs);
}

.team-reveal__vs {
  align-self: center;
  margin: 0;
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-warning);
  -webkit-text-stroke: 2px var(--color-text-heading);
  paint-order: stroke fill;
  animation: team-reveal-pop 0.5s cubic-bezier(0.22, 1.4, 0.36, 1) 0.2s both;
}

.team-reveal__go {
  margin: 0;
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-accent);
  -webkit-text-stroke: 2px var(--color-on-accent);
  paint-order: stroke fill;
  animation: team-reveal-go 0.48s cubic-bezier(0.22, 1.45, 0.36, 1) both;
}

@keyframes team-reveal-pop {
  0% {
    opacity: 0;
    transform: scale(0.72) translateY(var(--space-md));
  }

  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes team-reveal-go {
  0% {
    opacity: 0;
    transform: scale(0.5);
  }

  60% {
    opacity: 1;
    transform: scale(1.12);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
