<script setup lang="ts">
import { computed } from 'vue';

import {
  ANIMAL_LIST,
  getAnimalById,
  normalizeAnimalId,
} from '@/common/animals/animals';
import AnimalModelPreview from '@/components/animal-model-preview.vue';
import { commonCopy } from '@/locales/zh-TW/common';
import { lobbyCopy } from '@/locales/zh-TW/lobby';
import {
  findParticipantByAnimalId,
  isAnimalBlockedForHumanPick,
} from '@/party/roster/animal-pick';
import { usePartyStore } from '@/stores/party-store';
import type { AnimalId } from '@/types/animal';
import type { Participant, PlayerColor } from '@/types/party';

const SLOT_BY_COLOR: Record<PlayerColor, number> = {
  'player-1': 1,
  'player-2': 2,
  'player-3': 3,
  'player-4': 4,
};

const props = withDefaults(
  defineProps<{
    /** 包在大廳步驟裡時隱藏重複標題 */
    embedded?: boolean;
  }>(),
  {
    embedded: false,
  },
);

const partyStore = usePartyStore();

const selectedAnimalId = computed(() => partyStore.localParticipant?.animalId ?? null);

const localPlayerColor = computed(() => partyStore.localParticipant?.color ?? 'player-1');

const canPickAnimal = computed(() => Boolean(partyStore.localParticipantId));

const selectedAnimalName = computed(() => {
  if (!selectedAnimalId.value) {
    return '';
  }

  return getAnimalById(selectedAnimalId.value).name;
});

const occupantByAnimalId = computed((): Partial<Record<AnimalId, Participant>> => {
  const map: Partial<Record<AnimalId, Participant>> = {};

  for (const animal of ANIMAL_LIST) {
    const occupant = findParticipantByAnimalId(partyStore.participants, animal.id);

    if (occupant) {
      map[animal.id] = occupant;
    }
  }

  return map;
});

function isTakenByOtherHuman(animalId: AnimalId): boolean {
  if (!partyStore.localParticipantId) {
    return false;
  }

  return isAnimalBlockedForHumanPick(
    animalId,
    partyStore.participants,
    partyStore.localParticipantId,
  );
}

function handleSelect(animalId: AnimalId): void {
  if (!canPickAnimal.value || isTakenByOtherHuman(animalId)) {
    return;
  }

  partyStore.setLocalAnimal(animalId);
}

function isSelected(animalId: AnimalId): boolean {
  return selectedAnimalId.value === normalizeAnimalId(animalId);
}

function seatClass(color: PlayerColor): string {
  return `animal-seat--${color}`;
}

function playerSlotLabel(color: PlayerColor): string {
  return lobbyCopy.playerSlot.replace('{slot}', String(SLOT_BY_COLOR[color]));
}

function seatRole(participant: Participant): string {
  if (participant.id === partyStore.localParticipantId) {
    return lobbyCopy.youTag;
  }

  if (participant.kind === 'cpu') {
    return commonCopy.cpuLabel;
  }

  return '';
}
</script>

<template>
  <section
    class="animal-picker"
    :class="{ 'animal-picker--embedded': props.embedded }"
  >
    <header
      v-if="!props.embedded"
      class="animal-picker__header"
    >
      <h2 class="animal-picker__title font-game">{{ lobbyCopy.rosterLabel }}</h2>
      <p class="animal-picker__hint">{{ lobbyCopy.rosterHint }}</p>
    </header>

    <ul class="animal-grid">
      <li
        v-for="animal in ANIMAL_LIST"
        :key="animal.id"
      >
        <button
          type="button"
          class="animal-seat"
          :class="[
            occupantByAnimalId[animal.id]
              ? seatClass(occupantByAnimalId[animal.id]!.color)
              : '',
            {
              'animal-seat--active': isSelected(animal.id),
              'animal-seat--disabled': isTakenByOtherHuman(animal.id),
              'animal-seat--empty': !occupantByAnimalId[animal.id],
            },
          ]"
          :disabled="!canPickAnimal || isTakenByOtherHuman(animal.id)"
          @click="handleSelect(animal.id)"
        >
          <span
            v-if="occupantByAnimalId[animal.id]"
            class="animal-seat__slot font-game"
          >
            {{ playerSlotLabel(occupantByAnimalId[animal.id]!.color) }}
          </span>

          <div class="animal-seat__stage">
            <AnimalModelPreview
              :animal-id="animal.id"
              :player-color="occupantByAnimalId[animal.id]?.color ?? localPlayerColor"
              :is-active="isSelected(animal.id)"
            />
          </div>

          <span class="animal-seat__animal font-game">{{ animal.name }}</span>

          <div
            v-if="occupantByAnimalId[animal.id]"
            class="animal-seat__nameplate"
          >
            <span class="animal-seat__name">
              {{ occupantByAnimalId[animal.id]!.displayName }}
            </span>
            <span
              v-if="seatRole(occupantByAnimalId[animal.id]!)"
              class="animal-seat__role"
            >
              {{ seatRole(occupantByAnimalId[animal.id]!) }}
            </span>
          </div>

          <span
            v-if="isTakenByOtherHuman(animal.id)"
            class="animal-seat__taken"
          >
            {{ lobbyCopy.animalTaken }}
          </span>
        </button>
      </li>
    </ul>

    <p
      v-if="selectedAnimalId"
      class="animal-picker__selected font-game"
    >
      {{ lobbyCopy.animalSelected.replace('{name}', selectedAnimalName) }}
    </p>
  </section>
</template>

<style lang="scss" scoped>
.animal-picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-md);
  border: 3px solid color-mix(in srgb, var(--color-accent) 28%, white);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-surface-solid) 92%, white);
  box-shadow: 4px 4px 0 color-mix(in srgb, var(--color-accent) 18%, transparent);

  &--embedded {
    padding: 0;
    border: none;
    background: transparent;
    box-shadow: none;
  }
}

.animal-picker__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  text-align: center;
}

.animal-picker__title {
  margin: 0;
  font-size: var(--font-size-xl);
  color: var(--color-text-heading);
}

.animal-picker__hint {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.animal-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.animal-seat {
  --seat-tone: var(--color-border);
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-xs);
  width: 100%;
  padding: var(--space-sm);
  border: 3px solid color-mix(in srgb, var(--seat-tone) 55%, white);
  border-radius: var(--radius-md);
  background: linear-gradient(
    165deg,
    color-mix(in srgb, var(--seat-tone) 22%, white) 0%,
    white 70%
  );
  color: var(--color-text);
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    background 0.16s ease;

  &--player-1 {
    --seat-tone: var(--color-player-1);
  }

  &--player-2 {
    --seat-tone: var(--color-player-2);
  }

  &--player-3 {
    --seat-tone: var(--color-player-3);
  }

  &--player-4 {
    --seat-tone: var(--color-player-4);
  }

  &--active {
    border-color: var(--seat-tone);
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--seat-tone) 35%, white),
      3px 3px 0 color-mix(in srgb, var(--seat-tone) 28%, transparent);
  }

  &--disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  &--empty {
    --seat-tone: var(--color-text-muted);
  }
}

.animal-seat__slot {
  position: absolute;
  top: var(--space-xs);
  left: var(--space-xs);
  z-index: 1;
  min-width: 1.75rem;
  padding: 2px var(--space-xs);
  border-radius: var(--radius-sm);
  background: var(--seat-tone);
  font-size: var(--font-size-xs);
  line-height: 1.2;
  color: var(--color-on-accent);
  text-align: center;
}

.animal-seat__stage {
  overflow: hidden;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--seat-tone) 12%, white);
  border: 2px solid color-mix(in srgb, var(--seat-tone) 22%, white);
}

.animal-seat__animal {
  font-size: var(--font-size-md);
  letter-spacing: 0.08em;
  color: var(--color-text-heading);
  text-align: center;
}

.animal-seat__nameplate {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  min-height: 2rem;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-full);
  background: var(--seat-tone);
  color: var(--color-on-accent);
}

.animal-seat__name {
  max-width: 100%;
  overflow: hidden;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.animal-seat__role {
  padding: 0 var(--space-xs);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, white 28%, transparent);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  white-space: nowrap;
}

.animal-seat__taken {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  text-align: center;
}

.animal-picker__selected {
  margin: 0;
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-accent) 14%, white);
  font-size: var(--font-size-sm);
  color: var(--color-accent-hover);
  text-align: center;
}
</style>
