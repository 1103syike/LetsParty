<script setup lang="ts">
import { computed, ref } from 'vue';

import ActionButton from '@/components/action-button.vue';
import PartyCrownChart from '@/components/party-crown-chart.vue';
import { homeCopy } from '@/locales/zh-TW/home';
import { listSelectableMiniGames } from '@/minigames/registry';
import { createTiedCrownHistoryDemo } from '@/party/scoring/crown-history';
import { usePartyStore } from '@/stores/party-store';

const emit = defineEmits<{
  pick: [gameId: string];
  backHome: [];
}>();

const partyStore = usePartyStore();
const games = listSelectableMiniGames();

const showCrownDemo = ref(false);
const crownDemoKey = ref(0);

const demoParticipants = computed(() => partyStore.participants);

const demoCrownHistory = computed(() =>
  createTiedCrownHistoryDemo(demoParticipants.value),
);

function handleOpenCrownDemo(): void {
  showCrownDemo.value = true;
  crownDemoKey.value += 1;
}

function handleReplayCrownDemo(): void {
  crownDemoKey.value += 1;
}

function handleCloseCrownDemo(): void {
  showCrownDemo.value = false;
}
</script>

<template>
  <section class="test-game-picker flex flex-col gap-lg">
    <header class="flex flex-col gap-xs text-center">
      <h1 class="test-game-picker__title font-game">{{ homeCopy.testModeTitle }}</h1>
      <p class="text-sm text-muted">{{ homeCopy.testModePickGame }}</p>
    </header>

    <ul class="test-game-picker__list flex flex-col gap-md">
      <li
        v-for="game in games"
        :key="game.id"
      >
        <ActionButton
          variant="hero"
          @click="emit('pick', game.id)"
        >
          {{ game.name }}
        </ActionButton>
        <p class="test-game-picker__rules text-xs text-muted">
          {{ game.rules }}
        </p>
      </li>
    </ul>

    <div class="test-game-picker__tools flex flex-col gap-sm">
      <p class="text-xs text-muted text-center">
        {{ homeCopy.testCrownChartHint }}
      </p>
      <ActionButton @click="handleOpenCrownDemo">
        {{ homeCopy.testCrownChart }}
      </ActionButton>
    </div>

    <div
      v-if="showCrownDemo"
      class="test-game-picker__demo flex flex-col gap-md"
    >
      <PartyCrownChart
        :key="crownDemoKey"
        :participants="demoParticipants"
        :crown-history="demoCrownHistory"
      />
      <div class="flex gap-sm justify-center">
        <ActionButton @click="handleReplayCrownDemo">
          {{ homeCopy.testCrownChartReplay }}
        </ActionButton>
        <ActionButton @click="handleCloseCrownDemo">
          {{ homeCopy.testCrownChartClose }}
        </ActionButton>
      </div>
    </div>

    <ActionButton @click="emit('backHome')">
      {{ homeCopy.testModeBackHome }}
    </ActionButton>
  </section>
</template>

<style lang="scss" scoped>
.test-game-picker__title {
  margin: 0;
  font-size: var(--font-size-2xl);
  color: var(--color-text-heading);
}

.test-game-picker__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.test-game-picker__rules {
  margin: var(--space-xs) 0 0;
  padding: 0 var(--space-sm);
  line-height: var(--line-height-normal);
}

.test-game-picker__tools,
.test-game-picker__demo {
  width: 100%;
  padding: var(--space-md);
  border: 3px solid color-mix(in srgb, var(--color-accent) 35%, white);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-surface-solid) 92%, white);
}
</style>
