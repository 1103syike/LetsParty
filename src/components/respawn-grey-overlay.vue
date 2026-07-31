<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  /** 剩餘毫秒 */
  msLeft: number;
  /** 標題文案，例如「重生中」 */
  title: string;
}>();

const secondsLeft = computed(() => Math.max(1, Math.ceil(props.msLeft / 1000)));
</script>

<template>
  <div
    class="respawn-grey game-chrome"
    aria-live="polite"
  >
    <p class="respawn-grey__title font-game">
      {{ title }}
    </p>
    <p class="respawn-grey__count font-game">
      {{ secondsLeft }}
    </p>
  </div>
</template>

<style lang="scss" scoped>
.respawn-grey {
  position: absolute;
  inset: 0;
  z-index: 18;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  pointer-events: none;
  background: color-mix(in srgb, #1a1a1a 55%, transparent);
  backdrop-filter: grayscale(1) brightness(0.55);
}

.respawn-grey__title {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-on-accent);
  -webkit-text-stroke: 2px var(--color-text-heading);
  paint-order: stroke fill;
}

.respawn-grey__count {
  margin: 0;
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-warning);
  -webkit-text-stroke: 3px var(--color-text-heading);
  paint-order: stroke fill;
  animation: respawn-pulse 0.9s ease-in-out infinite;
}

@keyframes respawn-pulse {
  0%,
  100% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.08);
  }
}
</style>
