<script setup lang="ts">
import { computed, ref } from 'vue';

import ActionButton from '@/components/action-button.vue';
import AnimalPicker from '@/components/animal-picker.vue';
import CuteCrownIcon from '@/components/cute-crown-icon.vue';
import { commonCopy } from '@/locales/zh-TW/common';
import { lobbyCopy } from '@/locales/zh-TW/lobby';
import { listSelectableMiniGames } from '@/minigames/registry';
import { usePartyStore } from '@/stores/party-store';
import type { CrownWinOption } from '@/types/party';

const LOBBY_STEPS = ['name', 'animal', 'mode'] as const;

type LobbyStep = (typeof LOBBY_STEPS)[number];

const emit = defineEmits<{
  startParty: [];
  backHome: [];
}>();

const partyStore = usePartyStore();

const step = ref<LobbyStep>('name');
const nameDraft = ref(partyStore.localParticipant?.displayName ?? '');

const stepIndex = computed(() => LOBBY_STEPS.indexOf(step.value) + 1);

const stepTitle = computed(() => {
  if (step.value === 'name') {
    return lobbyCopy.stepName;
  }

  if (step.value === 'animal') {
    return lobbyCopy.stepAnimal;
  }

  return lobbyCopy.stepMode;
});

const stepBadge = computed(() =>
  lobbyCopy.stepLabel.replace('{step}', String(stepIndex.value)),
);

const canContinueName = computed(() => nameDraft.value.trim().length > 0);

const canContinueAnimal = computed(() => Boolean(partyStore.localParticipant?.animalId));

const selectableGames = listSelectableMiniGames();

const canStartParty = computed(() =>
  partyStore.isHost && partyStore.settings.enabledMiniGameIds.length > 0,
);

function isMiniGameEnabled(miniGameId: string): boolean {
  return partyStore.settings.enabledMiniGameIds.includes(miniGameId);
}

function goToStep(next: LobbyStep): void {
  step.value = next;
}

function handleNameNext(): void {
  if (!canContinueName.value) {
    return;
  }

  partyStore.setLocalDisplayName(nameDraft.value);
  goToStep('animal');
}

function handleAnimalNext(): void {
  if (!canContinueAnimal.value) {
    return;
  }

  goToStep('mode');
}

function handleBack(): void {
  if (step.value === 'name') {
    emit('backHome');
    return;
  }

  if (step.value === 'animal') {
    goToStep('name');
    return;
  }

  goToStep('animal');
}

function handleSelectTargetCrowns(option: CrownWinOption): void {
  if (!partyStore.isHost) {
    return;
  }

  partyStore.setTargetCrowns(option);
}

function handleToggleMiniGame(miniGameId: string): void {
  if (!partyStore.isHost) {
    return;
  }

  partyStore.toggleMiniGameEnabled(miniGameId);
}

function handleStartParty(): void {
  if (!canStartParty.value) {
    return;
  }

  // 保險：開始前再寫一次暱稱
  partyStore.setLocalDisplayName(nameDraft.value);
  emit('startParty');
}
</script>

<template>
  <section class="lobby-setup">
    <header class="lobby-setup__hero">
      <p class="lobby-setup__badge font-game">{{ stepBadge }}</p>
      <h1 class="lobby-setup__title font-game">{{ stepTitle }}</h1>
      <p class="lobby-setup__room font-game">
        {{ lobbyCopy.roomCodeValue.replace('{id}', partyStore.roomId) }}
      </p>
    </header>

    <ol class="lobby-setup__steps" aria-hidden="true">
      <li
        v-for="(item, index) in LOBBY_STEPS"
        :key="item"
        class="lobby-setup__step-dot"
        :class="{
          'lobby-setup__step-dot--done': index + 1 < stepIndex,
          'lobby-setup__step-dot--current': index + 1 === stepIndex,
        }"
      >
        {{ index + 1 }}
      </li>
    </ol>

    <div
      v-if="step === 'name'"
      class="lobby-setup__panel"
    >
      <label class="lobby-setup__field">
        <span class="lobby-setup__label">{{ lobbyCopy.nameLabel }}</span>
        <input
          v-model="nameDraft"
          class="party-input"
          type="text"
          maxlength="12"
          :placeholder="lobbyCopy.namePlaceholder"
          @keyup.enter="handleNameNext"
        />
        <span class="lobby-setup__hint">{{ lobbyCopy.nameHint }}</span>
      </label>
    </div>

    <div
      v-else-if="step === 'animal'"
      class="lobby-setup__panel lobby-setup__panel--animal"
    >
      <p class="lobby-setup__hint text-center">{{ lobbyCopy.rosterHint }}</p>
      <AnimalPicker embedded />
    </div>

    <div
      v-else
      class="lobby-setup__panel"
    >
      <p class="lobby-setup__hint">{{ lobbyCopy.modeSectionHint }}</p>

      <section class="lobby-mode-card">
        <div class="lobby-mode-card__heading">
          <CuteCrownIcon size="md" />
          <div class="lobby-mode-card__copy">
            <h2 class="lobby-mode-card__title font-game">{{ lobbyCopy.targetCrownsLabel }}</h2>
            <p class="lobby-mode-card__hint">{{ lobbyCopy.targetCrownsHint }}</p>
          </div>
        </div>

        <div class="lobby-mode-card__options">
          <button
            v-for="option in partyStore.crownWinOptions"
            :key="option"
            type="button"
            class="lobby-mode-card__pad font-game"
            :class="{ 'lobby-mode-card__pad--active': partyStore.settings.targetCrowns === option }"
            :disabled="!partyStore.isHost"
            @click="handleSelectTargetCrowns(option)"
          >
            <CuteCrownIcon size="sm" />
            <span>{{ option }}</span>
          </button>
        </div>
      </section>

      <section class="lobby-mode-card lobby-mode-card--games">
        <div class="lobby-mode-card__heading">
          <div class="lobby-mode-card__copy">
            <h2 class="lobby-mode-card__title font-game">{{ lobbyCopy.gamesLabel }}</h2>
            <p class="lobby-mode-card__hint">{{ lobbyCopy.gamesHint }}</p>
          </div>
        </div>

        <div class="lobby-games">
          <button
            v-for="game in selectableGames"
            :key="game.id"
            type="button"
            class="lobby-games__chip"
            :class="{ 'lobby-games__chip--active': isMiniGameEnabled(game.id) }"
            :disabled="!partyStore.isHost"
            :aria-pressed="isMiniGameEnabled(game.id)"
            @click="handleToggleMiniGame(game.id)"
          >
            <span class="lobby-games__name font-game">{{ game.name }}</span>
            <span class="lobby-games__rules">{{ game.rules }}</span>
          </button>
        </div>

        <p
          v-if="partyStore.settings.enabledMiniGameIds.length <= 1"
          class="lobby-setup__hint"
        >
          {{ lobbyCopy.gamesNeedOne }}
        </p>
      </section>
    </div>

    <footer class="lobby-setup__actions">
      <ActionButton
        v-if="step === 'name'"
        variant="hero"
        :disabled="!canContinueName"
        @click="handleNameNext"
      >
        {{ lobbyCopy.nextStep }}
      </ActionButton>

      <ActionButton
        v-else-if="step === 'animal'"
        variant="hero"
        :disabled="!canContinueAnimal"
        @click="handleAnimalNext"
      >
        {{ lobbyCopy.nextStep }}
      </ActionButton>

      <template v-else>
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
          class="lobby-setup__wait"
        >
          {{ lobbyCopy.waitingHost }}
        </p>
      </template>

      <button
        type="button"
        class="lobby-setup__link"
        @click="handleBack"
      >
        {{ step === 'name' ? commonCopy.backHome : lobbyCopy.prevStep }}
      </button>
    </footer>
  </section>
</template>

<style lang="scss" scoped>
.lobby-setup {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  width: 100%;
}

.lobby-setup__hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  text-align: center;
}

.lobby-setup__badge {
  margin: 0;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-accent) 16%, white);
  font-size: var(--font-size-xs);
  letter-spacing: 0.08em;
  color: var(--color-accent-hover);
}

.lobby-setup__title {
  margin: 0;
  font-size: var(--font-size-2xl);
  line-height: var(--line-height-tight);
  color: var(--color-text-heading);
}

.lobby-setup__room {
  margin: 0;
  padding: var(--space-xs) var(--space-md);
  border: 2px solid color-mix(in srgb, var(--color-accent) 35%, white);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-surface-solid) 90%, white);
  font-size: var(--font-size-sm);
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.lobby-setup__steps {
  display: flex;
  justify-content: center;
  gap: var(--space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.lobby-setup__step-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border: 2px solid color-mix(in srgb, var(--color-border) 80%, white);
  border-radius: 50%;
  background: white;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  line-height: 1;
  color: var(--color-text-muted);

  &--done {
    border-color: color-mix(in srgb, var(--color-success) 55%, white);
    background: color-mix(in srgb, var(--color-success) 22%, white);
    color: var(--color-text-heading);
  }

  &--current {
    border-color: var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 18%, white);
    color: var(--color-accent-hover);
  }
}

.lobby-setup__panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-md);
  border: 3px solid color-mix(in srgb, var(--color-accent) 28%, white);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-surface-solid) 92%, white);
  box-shadow: 4px 4px 0 color-mix(in srgb, var(--color-accent) 16%, transparent);

  &--animal {
    gap: var(--space-sm);
  }
}

.lobby-setup__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.lobby-setup__label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
}

.lobby-setup__hint {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
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

.lobby-games {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
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
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--color-accent) 22%, white);
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

.lobby-mode-card__heading {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.lobby-mode-card__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
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
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--color-accent) 25%, white);
  }
}

.lobby-setup__actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
}

.lobby-setup__wait {
  margin: 0;
  width: 100%;
  padding: var(--space-md);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-surface-solid) 88%, white);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-muted);
  text-align: center;
}

.lobby-setup__link {
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

.text-center {
  text-align: center;
}
</style>
