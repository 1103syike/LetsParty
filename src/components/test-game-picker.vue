<script setup lang="ts">
import ActionButton from '@/components/action-button.vue';
import { homeCopy } from '@/locales/zh-TW/home';
import { listSelectableMiniGames } from '@/minigames/registry';

const emit = defineEmits<{
  pick: [gameId: string];
  backHome: [];
}>();

const games = listSelectableMiniGames();
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
</style>
