<script setup lang="ts">
import { computed } from 'vue';

import AnimalModelPreview from '@/components/animal-model-preview.vue';
import CuteCrownIcon from '@/components/cute-crown-icon.vue';
import { sortParticipantsByCrown } from '@/party/scoring/crown';
import type { Participant } from '@/types/party';

const props = withDefaults(
  defineProps<{
    participants: Participant[];
    sorted?: boolean;
    highlightLeader?: boolean;
    compact?: boolean;
  }>(),
  {
    sorted: false,
    highlightLeader: false,
    compact: false,
  },
);

const displayParticipants = computed(() =>
  props.sorted ? sortParticipantsByCrown(props.participants) : props.participants,
);

function boardItemClass(color: Participant['color']): string {
  return `crown-board-item--${color}`;
}
</script>

<template>
  <ul
    class="crown-board"
    :class="{ 'crown-board--compact': compact }"
  >
    <li
      v-for="(participant, index) in displayParticipants"
      :key="participant.id"
      class="crown-board-item"
      :class="[
        boardItemClass(participant.color),
        {
          'crown-board-item--leader': highlightLeader && index === 0 && participant.crownCount > 0,
          'crown-board-item--compact': compact,
        },
      ]"
    >
      <div class="crown-board-item__model">
        <AnimalModelPreview
          :animal-id="participant.animalId"
          :player-color="participant.color"
          :compact="compact"
        />
      </div>
      <div class="crown-board-item__meta flex flex-col gap-xs items-center">
        <span class="crown-board-item__name">{{ participant.displayName }}</span>
        <span class="crown-board-item__crowns">
          <CuteCrownIcon size="sm" />
          × {{ participant.crownCount }}
        </span>
      </div>
    </li>
  </ul>
</template>

<style lang="scss" scoped>
.crown-board {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-sm);
  list-style: none;
  margin: 0;
  padding: 0;

  &--compact {
    gap: var(--space-xs);
  }
}

.crown-board-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm);
  text-align: center;
  border: 2px solid rgba(255, 255, 255, 0.75);
  border-top-width: 5px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 3px 3px 0 rgba(92, 77, 130, 0.08);
  transition: transform 0.2s ease;

  &--compact {
    flex-direction: row;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    text-align: left;
    border-top-width: 2px;
    border-left-width: 5px;
  }

  &--player-1 {
    border-top-color: var(--color-player-1);
    border-left-color: var(--color-player-1);
  }

  &--player-2 {
    border-top-color: var(--color-player-2);
    border-left-color: var(--color-player-2);
  }

  &--player-3 {
    border-top-color: var(--color-player-3);
    border-left-color: var(--color-player-3);
  }

  &--player-4 {
    border-top-color: var(--color-player-4);
    border-left-color: var(--color-player-4);
  }

  &--leader {
    transform: scale(1.02);
    box-shadow:
      3px 3px 0 rgba(92, 77, 130, 0.1),
      0 0 0 2px color-mix(in srgb, var(--color-warning) 35%, transparent);
  }
}

.crown-board-item__model {
  width: 100%;
  max-width: 7rem;
}

.crown-board-item--compact .crown-board-item__model {
  width: 3.5rem;
  max-width: 3.5rem;
  flex-shrink: 0;
}

.crown-board-item__meta {
  min-width: 0;
  width: 100%;
}

.crown-board-item--compact .crown-board-item__meta {
  align-items: flex-start;
}

.crown-board-item__name {
  max-width: 100%;
  overflow: hidden;
  color: var(--color-text-heading);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.crown-board-item__crowns {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px var(--space-sm);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-warning) 18%, white);
  color: #8a6110;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
}

.crown-board-item__crowns :deep(.cute-crown) {
  margin-right: 1px;
}
</style>
