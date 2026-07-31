<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { getAnimalById } from '@/common/animals/animals';
import ActionButton from '@/components/action-button.vue';
import AnimalModelPreview from '@/components/animal-model-preview.vue';
import AnimalPicker from '@/components/animal-picker.vue';
import CuteCrownIcon from '@/components/cute-crown-icon.vue';
import { usePartyNetwork } from '@/composables/use-party-network';
import { commonCopy } from '@/locales/zh-TW/common';
import { lobbyCopy } from '@/locales/zh-TW/lobby';
import { listSelectableMiniGames } from '@/minigames/registry';
import { usePartyStore } from '@/stores/party-store';
import type { CrownWinOption, Participant, PlayerColor } from '@/types/party';

const SLOT_BY_COLOR: Record<PlayerColor, number> = {
  'player-1': 1,
  'player-2': 2,
  'player-3': 3,
  'player-4': 4,
};

const emit = defineEmits<{
  startParty: [];
  backHome: [];
}>();

const partyStore = usePartyStore();
const network = usePartyNetwork();

const nameDraft = ref(partyStore.localParticipant?.displayName ?? '');
const copyFlash = ref(false);
let copyTimer = 0;

watch(
  () => partyStore.localParticipant?.displayName,
  (name) => {
    if (name != null && name !== nameDraft.value) {
      nameDraft.value = name;
    }
  },
);

const roomCodeLabel = computed(() =>
  lobbyCopy.roomCodeValue.replace('{id}', partyStore.roomId),
);

const roleLabel = computed(() =>
  partyStore.isHost ? lobbyCopy.roleHost : lobbyCopy.roleGuest,
);

const seats = computed(() => partyStore.seatSlots);

const selectableGames = listSelectableMiniGames();

const enabledGameNames = computed(() =>
  selectableGames
    .filter((game) => partyStore.settings.enabledMiniGameIds.includes(game.id))
    .map((game) => game.name),
);

const guestTargetLabel = computed(() =>
  lobbyCopy.guestTargetCrowns.replace(
    '{count}',
    String(partyStore.settings.targetCrowns),
  ),
);

const readyProgressLabel = computed(() =>
  lobbyCopy.waitingPlayersReady
    .replace('{ready}', String(partyStore.readyHumanCount))
    .replace('{total}', String(partyStore.humanCount)),
);

const localHasName = computed(() => {
  const name = partyStore.localParticipant?.displayName?.trim() ?? '';
  return name.length > 0;
});

const canToggleReady = computed(() => localHasName.value);

const canStartParty = computed(() => {
  if (!partyStore.isHost) {
    return false;
  }

  if (partyStore.settings.enabledMiniGameIds.length === 0) {
    return false;
  }

  if (!localHasName.value) {
    return false;
  }

  return partyStore.allHumansReady;
});

const startHint = computed(() => {
  if (!partyStore.isHost) {
    return '';
  }

  if (!localHasName.value) {
    return lobbyCopy.needName;
  }

  if (!partyStore.allHumansReady) {
    return lobbyCopy.needAllReady;
  }

  return '';
});

const guestWaitLabel = computed(() => {
  if (partyStore.localParticipant?.isReady) {
    return lobbyCopy.waitingHostAfterReady;
  }

  return lobbyCopy.waitingHost;
});

function seatSlotLabel(participant: Participant | null, index: number): string {
  if (participant) {
    return lobbyCopy.playerSlot.replace('{slot}', String(SLOT_BY_COLOR[participant.color]));
  }

  return lobbyCopy.playerSlot.replace('{slot}', String(index + 1));
}

function seatName(participant: Participant | null): string {
  if (!participant) {
    return lobbyCopy.emptySeat;
  }

  const trimmed = participant.displayName.trim();

  if (trimmed.length > 0) {
    return trimmed;
  }

  return lobbyCopy.unnamed;
}

function animalName(participant: Participant | null): string {
  if (!participant) {
    return '';
  }

  return getAnimalById(participant.animalId).name;
}

function isLocalSeat(participant: Participant | null): boolean {
  return Boolean(
    participant
    && partyStore.localParticipantId
    && participant.id === partyStore.localParticipantId,
  );
}

function isMiniGameEnabled(miniGameId: string): boolean {
  return partyStore.settings.enabledMiniGameIds.includes(miniGameId);
}

function handleApplyName(): void {
  network.notifyLocalName(nameDraft.value);
}

function handleSelectTargetCrowns(option: CrownWinOption): void {
  if (!partyStore.isHost) {
    return;
  }

  partyStore.setTargetCrowns(option);
  network.notifySettingsChanged();
}

function handleToggleMiniGame(miniGameId: string): void {
  if (!partyStore.isHost) {
    return;
  }

  partyStore.toggleMiniGameEnabled(miniGameId);
  network.notifySettingsChanged();
}

function handleStartParty(): void {
  if (!canStartParty.value) {
    return;
  }

  network.notifyLocalName(nameDraft.value);
  emit('startParty');
}

function handleToggleReady(): void {
  if (!canToggleReady.value) {
    return;
  }

  network.notifyLocalName(nameDraft.value);
  const nextReady = !(partyStore.localParticipant?.isReady ?? false);
  network.notifyLocalReady(nextReady);
}

async function handleCopyRoomCode(): Promise<void> {
  try {
    await navigator.clipboard.writeText(partyStore.roomId);
    copyFlash.value = true;
    window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => {
      copyFlash.value = false;
    }, 1600);
  } catch {
    copyFlash.value = false;
  }
}
</script>

<template>
  <section class="party-room flex flex-col gap-lg full-width">
    <header class="party-room__hero flex flex-col items-center gap-sm text-center">
      <h1 class="party-room__title font-game">
        {{ lobbyCopy.title }}
      </h1>
      <div class="party-room__code-row flex items-center gap-sm">
        <p class="party-room__code font-game">
          {{ roomCodeLabel }}
        </p>
        <button
          type="button"
          class="party-room__copy"
          @click="handleCopyRoomCode"
        >
          {{ copyFlash ? lobbyCopy.roomCodeCopied : lobbyCopy.roomCodeCopy }}
        </button>
      </div>
      <p class="party-room__role font-game">
        {{ roleLabel }}
      </p>
      <p class="party-room__hint">
        {{ lobbyCopy.seatsHint }}
      </p>
      <p
        v-if="partyStore.connectionStatus === 'connecting'"
        class="party-room__hint"
      >
        {{ lobbyCopy.connecting }}
      </p>
      <p
        v-else-if="partyStore.connectionError === 'full'"
        class="party-room__error"
      >
        {{ lobbyCopy.roomFull }}
      </p>
      <p
        v-else-if="partyStore.connectionError === 'closed'"
        class="party-room__error"
      >
        {{ lobbyCopy.hostLeft }}
      </p>
      <p
        v-else-if="partyStore.connectionStatus === 'error'"
        class="party-room__error"
      >
        {{ lobbyCopy.connectionFailed }}
      </p>
    </header>

    <div class="party-room__seats-wrap">
      <ul class="party-room__seats">
        <li
          v-for="(seat, index) in seats"
          :key="seat?.id ?? `empty-${index}`"
          class="party-room__seat"
          :data-chat-anchor="seat?.id"
          :class="{
            'party-room__seat--local': isLocalSeat(seat),
            'party-room__seat--cpu': seat?.kind === 'cpu',
            'party-room__seat--human': seat?.kind === 'human',
            [`party-room__seat--${seat?.color ?? 'player-1'}`]: Boolean(seat),
          }"
        >
          <span class="party-room__slot font-game">
            {{ seatSlotLabel(seat, index) }}
          </span>

          <div
            v-if="seat"
            class="party-room__preview"
          >
            <AnimalModelPreview
              compact
              :animal-id="seat.animalId"
              :player-color="seat.color"
            />
          </div>
          <div
            v-else
            class="party-room__preview party-room__preview--empty"
          />

          <p class="party-room__name font-game">
            {{ seatName(seat) }}
          </p>
          <p class="party-room__animal">
            {{ animalName(seat) }}
          </p>

          <div class="party-room__tags flex gap-xs justify-center">
            <span
              v-if="isLocalSeat(seat)"
              class="party-room__tag party-room__tag--you font-game"
            >
              {{ lobbyCopy.youTag }}
            </span>
            <span
              v-else-if="seat?.kind === 'cpu'"
              class="party-room__tag party-room__tag--cpu font-game"
            >
              {{ lobbyCopy.cpuTag }}
            </span>
            <span
              v-else-if="seat?.kind === 'human'"
              class="party-room__tag party-room__tag--human font-game"
            >
              {{ lobbyCopy.humanTag }}
            </span>
            <span
              v-if="seat?.isReady"
              class="party-room__tag party-room__tag--ready font-game"
            >
              {{ lobbyCopy.readyTag }}
            </span>
          </div>
        </li>
      </ul>
    </div>

    <section class="party-room__panel flex flex-col gap-md">
      <label class="party-room__field flex flex-col gap-xs">
        <span class="party-room__label">{{ lobbyCopy.nameLabel }}</span>
        <div class="party-room__name-row flex gap-sm items-center">
          <input
            v-model="nameDraft"
            class="party-input full-width"
            type="text"
            maxlength="12"
            :placeholder="lobbyCopy.namePlaceholder"
            @keyup.enter="handleApplyName"
          >
          <ActionButton @click="handleApplyName">
            {{ lobbyCopy.nameApply }}
          </ActionButton>
        </div>
        <span class="party-room__hint">{{ lobbyCopy.nameHint }}</span>
      </label>

      <div class="party-room__picker flex flex-col gap-sm">
        <p class="party-room__hint text-center">
          {{ lobbyCopy.rosterHint }}
        </p>
        <AnimalPicker embedded />
      </div>
    </section>

    <section
      v-if="partyStore.isHost"
      class="party-room__panel flex flex-col gap-md"
    >
      <p class="party-room__hint">
        {{ lobbyCopy.modeSectionHint }}
      </p>

      <div class="lobby-mode-card">
        <div class="lobby-mode-card__heading flex items-center gap-sm">
          <CuteCrownIcon size="md" />
          <div class="lobby-mode-card__copy flex flex-col gap-xs">
            <h2 class="lobby-mode-card__title font-game">
              {{ lobbyCopy.targetCrownsLabel }}
            </h2>
            <p class="lobby-mode-card__hint">
              {{ lobbyCopy.targetCrownsHint }}
            </p>
          </div>
        </div>

        <div class="lobby-mode-card__options">
          <button
            v-for="option in partyStore.crownWinOptions"
            :key="option"
            type="button"
            class="lobby-mode-card__pad font-game"
            :class="{ 'lobby-mode-card__pad--active': partyStore.settings.targetCrowns === option }"
            @click="handleSelectTargetCrowns(option)"
          >
            <CuteCrownIcon size="sm" />
            <span>{{ option }}</span>
          </button>
        </div>
      </div>

      <div class="lobby-mode-card lobby-mode-card--games">
        <div class="lobby-mode-card__heading">
          <div class="lobby-mode-card__copy flex flex-col gap-xs">
            <h2 class="lobby-mode-card__title font-game">
              {{ lobbyCopy.gamesLabel }}
            </h2>
            <p class="lobby-mode-card__hint">
              {{ lobbyCopy.gamesHint }}
            </p>
          </div>
        </div>

        <div class="lobby-games flex flex-col gap-sm">
          <button
            v-for="game in selectableGames"
            :key="game.id"
            type="button"
            class="lobby-games__chip"
            :class="{ 'lobby-games__chip--active': isMiniGameEnabled(game.id) }"
            :aria-pressed="isMiniGameEnabled(game.id)"
            @click="handleToggleMiniGame(game.id)"
          >
            <span class="lobby-games__name font-game">{{ game.name }}</span>
            <span class="lobby-games__rules">{{ game.rules }}</span>
          </button>
        </div>

        <p
          v-if="partyStore.settings.enabledMiniGameIds.length <= 1"
          class="party-room__hint"
        >
          {{ lobbyCopy.gamesNeedOne }}
        </p>
      </div>
    </section>

    <section
      v-else
      class="party-room__panel flex flex-col gap-md"
    >
      <div class="lobby-mode-card">
        <div class="lobby-mode-card__heading flex items-center gap-sm">
          <CuteCrownIcon size="md" />
          <div class="lobby-mode-card__copy flex flex-col gap-xs">
            <h2 class="lobby-mode-card__title font-game">
              {{ lobbyCopy.guestMatchSummaryTitle }}
            </h2>
            <p class="lobby-mode-card__hint">
              {{ guestTargetLabel }}
            </p>
          </div>
        </div>
      </div>

      <div class="lobby-mode-card lobby-mode-card--games">
        <div class="lobby-mode-card__heading">
          <div class="lobby-mode-card__copy flex flex-col gap-xs">
            <h2 class="lobby-mode-card__title font-game">
              {{ lobbyCopy.guestGamesLabel }}
            </h2>
          </div>
        </div>

        <ul class="lobby-games flex flex-col gap-sm">
          <li
            v-for="name in enabledGameNames"
            :key="name"
            class="lobby-games__chip lobby-games__chip--active lobby-games__chip--readonly"
          >
            <span class="lobby-games__name font-game">{{ name }}</span>
          </li>
        </ul>
      </div>
    </section>

    <footer class="party-room__footer flex flex-col items-center gap-md">
      <p class="party-room__wait font-game">
        {{ readyProgressLabel }}
      </p>

      <ActionButton
        :variant="partyStore.localParticipant?.isReady ? 'default' : 'hero'"
        :disabled="!canToggleReady"
        @click="handleToggleReady"
      >
        {{
          partyStore.localParticipant?.isReady
            ? lobbyCopy.cancelReady
            : lobbyCopy.ready
        }}
      </ActionButton>

      <ActionButton
        v-if="partyStore.isHost"
        variant="hero"
        :disabled="!canStartParty"
        @click="handleStartParty"
      >
        {{ lobbyCopy.startParty }}
      </ActionButton>
      <p
        v-else
        class="party-room__wait font-game"
      >
        {{ guestWaitLabel }}
      </p>

      <p
        v-if="startHint"
        class="party-room__hint"
      >
        {{ startHint }}
      </p>
      <p
        v-else-if="!canToggleReady"
        class="party-room__hint"
      >
        {{ lobbyCopy.needName }}
      </p>

      <button
        type="button"
        class="party-room__link"
        @click="emit('backHome')"
      >
        {{ commonCopy.backHome }}
      </button>
    </footer>
  </section>
</template>

<style lang="scss" scoped>
.party-room__title {
  margin: 0;
  font-size: var(--font-size-2xl);
  line-height: var(--line-height-tight);
  color: var(--color-text-heading);
}

.party-room__code {
  margin: 0;
  padding: var(--space-xs) var(--space-md);
  border: 2px solid color-mix(in srgb, var(--color-accent) 35%, white);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-surface-solid) 90%, white);
  font-size: var(--font-size-sm);
  letter-spacing: 0.06em;
  color: var(--color-text-heading);
}

.party-room__copy {
  padding: var(--space-xs) var(--space-sm);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface-solid);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  color: var(--color-accent-hover);
  cursor: pointer;
}

.party-room__role {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-accent-hover);
}

.party-room__hint {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.party-room__error {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-accent);
}

.party-room__seats-wrap {
  width: 100%;
  overflow-x: auto;
  padding-bottom: var(--space-xs);
}

.party-room__seats {
  display: flex;
  flex-direction: row;
  gap: var(--space-sm);
  min-width: max-content;
  margin: 0 auto;
  padding: 0;
  list-style: none;
}

.party-room__seat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  width: 8.5rem;
  padding: var(--space-sm);
  border: 3px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-solid);

  &--local {
    outline: 3px solid var(--color-accent);
  }

  &--cpu {
    opacity: 0.92;
  }

  &--player-1 {
    border-color: var(--color-player-1);
  }

  &--player-2 {
    border-color: var(--color-player-2);
  }

  &--player-3 {
    border-color: var(--color-player-3);
  }

  &--player-4 {
    border-color: var(--color-player-4);
  }
}

.party-room__slot {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.party-room__preview {
  width: 4.5rem;
  height: 4.5rem;

  &--empty {
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-border) 40%, white);
  }
}

.party-room__name {
  margin: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-sm);
  color: var(--color-text-heading);
}

.party-room__animal {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.party-room__tag {
  padding: 0 var(--space-xs);
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  line-height: 1.4;

  &--you {
    background: color-mix(in srgb, var(--color-accent) 22%, white);
    color: var(--color-accent-hover);
  }

  &--cpu {
    background: color-mix(in srgb, var(--color-text-muted) 22%, white);
    color: var(--color-text-muted);
  }

  &--human {
    background: color-mix(in srgb, var(--color-success) 22%, white);
    color: var(--color-text-heading);
  }

  &--ready {
    background: color-mix(in srgb, var(--color-success) 45%, white);
    color: var(--color-text-heading);
  }
}

.party-room__panel {
  padding: var(--space-md);
  border: 3px solid color-mix(in srgb, var(--color-accent) 28%, white);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-surface-solid) 92%, white);
}

.party-room__label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
}

.party-room__name-row {
  width: 100%;
}

.lobby-mode-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-md);
  border: 3px solid color-mix(in srgb, var(--color-warning) 45%, white);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-warning) 12%, white);

  &--games {
    border-color: color-mix(in srgb, var(--color-accent) 40%, white);
    background: color-mix(in srgb, var(--color-accent) 10%, white);
  }
}

.lobby-mode-card__title {
  margin: 0;
  font-size: var(--font-size-md);
  color: var(--color-text-heading);
}

.lobby-mode-card__hint {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.lobby-mode-card__options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-sm);
}

.lobby-mode-card__pad {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm);
  border: 3px solid color-mix(in srgb, var(--color-warning) 35%, white);
  border-radius: var(--radius-md);
  background: white;
  color: var(--color-text-heading);
  font-size: var(--font-size-xl);
  line-height: 1;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.85;
  }

  &--active {
    border-color: var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 14%, white);
    color: var(--color-accent-hover);
  }
}

.lobby-games__chip {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-xs);
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  border: 3px solid color-mix(in srgb, var(--color-accent) 28%, white);
  border-radius: var(--radius-md);
  background: white;
  text-align: left;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.85;
  }

  &--active {
    border-color: var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 14%, white);
  }

  &--readonly {
    cursor: default;
    pointer-events: none;
  }
}

.lobby-games__name {
  font-size: var(--font-size-md);
  color: var(--color-text-heading);
}

.lobby-games__rules {
  font-size: var(--font-size-xs);
  line-height: var(--line-height-normal);
  color: var(--color-text-muted);
}

.party-room__wait {
  margin: 0;
  width: 100%;
  padding: var(--space-md);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-surface-solid) 88%, white);
  font-size: var(--font-size-md);
  color: var(--color-text-muted);
  text-align: center;
}

.party-room__link {
  padding: 0;
  border: none;
  background: none;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-accent-hover);
  cursor: pointer;

  &:hover {
    color: var(--color-accent);
  }
}
</style>
