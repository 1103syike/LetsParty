<script setup lang="ts">
import type { RpsChoice } from '@/types/player-input';

withDefaults(
  defineProps<{
    choice: RpsChoice | null;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    bounce?: boolean;
  }>(),
  {
    size: 'md',
    bounce: false,
  },
);
</script>

<template>
  <span
    class="rps-choice-icon"
    :class="[
      `rps-choice-icon--${size}`,
      `rps-choice-icon--${choice ?? 'unknown'}`,
      { 'rps-choice-icon--bounce': bounce },
    ]"
    aria-hidden="true"
  >
    <!-- 石頭：圓潤石頭 + 裂紋 -->
    <svg
      v-if="choice === 'rock'"
      class="rps-choice-icon__svg"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse cx="24" cy="40" rx="12" ry="3" fill="#9aa3b0" opacity="0.28" />
      <path
        d="M12 28c-1.5-6 2-14 12-16 9-2 16 4 16 12 0 7-5 12-14 12-7 0-12.5-3.5-14-8z"
        fill="#c8d0da"
        stroke="#8a93a0"
        stroke-width="2"
        stroke-linejoin="round"
      />
      <path
        d="M18 22c2-1 5-1 7 1M26 28c3 0 5 1 6 3"
        stroke="#8a93a0"
        stroke-width="1.6"
        stroke-linecap="round"
        opacity="0.7"
      />
      <circle cx="20" cy="26" r="1.4" fill="#fff" opacity="0.65" />
    </svg>

    <!-- 布：摺紙感紙張 -->
    <svg
      v-else-if="choice === 'paper'"
      class="rps-choice-icon__svg"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse cx="24" cy="40" rx="11" ry="2.8" fill="#e0a93a" opacity="0.22" />
      <path
        d="M14 12h14l8 8v18a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V14a2 2 0 0 1 2-2z"
        fill="#fff8e8"
        stroke="#e0b85a"
        stroke-width="2"
        stroke-linejoin="round"
      />
      <path
        d="M28 12v7a1 1 0 0 0 1 1h7"
        fill="#ffe8b0"
        stroke="#e0b85a"
        stroke-width="2"
        stroke-linejoin="round"
      />
      <path
        d="M17 24h12M17 29h10M17 34h8"
        stroke="#e0b85a"
        stroke-width="1.8"
        stroke-linecap="round"
        opacity="0.75"
      />
    </svg>

    <!-- 剪刀：可愛開合剪刀 -->
    <svg
      v-else-if="choice === 'scissors'"
      class="rps-choice-icon__svg"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse cx="24" cy="40" rx="11" ry="2.8" fill="#6ba8e8" opacity="0.24" />
      <path
        d="M18 30 L32 14"
        stroke="#7a94b8"
        stroke-width="3.2"
        stroke-linecap="round"
      />
      <path
        d="M30 30 L16 14"
        stroke="#7a94b8"
        stroke-width="3.2"
        stroke-linecap="round"
      />
      <circle
        cx="14"
        cy="34"
        r="5.5"
        fill="#c8e4ff"
        stroke="#6ba8e8"
        stroke-width="2"
      />
      <circle
        cx="34"
        cy="34"
        r="5.5"
        fill="#c8e4ff"
        stroke="#6ba8e8"
        stroke-width="2"
      />
      <circle cx="14" cy="34" r="2" fill="#fff" />
      <circle cx="34" cy="34" r="2" fill="#fff" />
      <circle cx="24" cy="22" r="2.2" fill="#9b7fd4" />
    </svg>

    <!-- 未出拳 -->
    <svg
      v-else
      class="rps-choice-icon__svg"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse cx="24" cy="40" rx="10" ry="2.6" fill="#8a7ca8" opacity="0.2" />
      <circle
        cx="24"
        cy="24"
        r="12"
        fill="#ebe6f2"
        stroke="#b8a4e0"
        stroke-width="2"
      />
      <path
        d="M20 20c0-2.4 1.8-4 4-4s4 1.6 4 4c0 2.2-1.6 3.2-2.8 4.2-.8.6-1.2 1.2-1.2 2.2"
        stroke="#8a7ca8"
        stroke-width="2.2"
        stroke-linecap="round"
      />
      <circle cx="24" cy="32" r="1.6" fill="#8a7ca8" />
    </svg>
  </span>
</template>

<style lang="scss" scoped>
.rps-choice-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  line-height: 0;
  vertical-align: middle;

  &--sm {
    width: 1.25rem;
    height: 1.25rem;
  }

  &--md {
    width: 2rem;
    height: 2rem;
  }

  &--lg {
    width: 3.25rem;
    height: 3.25rem;
  }

  &--xl {
    width: 4.25rem;
    height: 4.25rem;
  }

  &--bounce {
    animation: rps-choice-icon-bounce 0.9s ease-in-out infinite;
  }
}

.rps-choice-icon__svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  filter: drop-shadow(0 1px 0 rgba(92, 77, 130, 0.14));
}

@keyframes rps-choice-icon-bounce {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-3px);
  }
}
</style>
