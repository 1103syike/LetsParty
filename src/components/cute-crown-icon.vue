<script setup lang="ts">
import { computed, useId } from 'vue';

withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg';
    bounce?: boolean;
  }>(),
  {
    size: 'md',
    bounce: false,
  },
);

const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
const goldId = computed(() => `cute-crown-gold-${uid}`);
const bandId = computed(() => `cute-crown-band-${uid}`);
</script>

<template>
  <span
    class="cute-crown"
    :class="[
      `cute-crown--${size}`,
      { 'cute-crown--bounce': bounce },
    ]"
    aria-hidden="true"
  >
    <svg
      class="cute-crown__svg"
      viewBox="2 4 28 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse
        cx="16"
        cy="22.4"
        rx="9"
        ry="1.6"
        fill="#f4c542"
        opacity="0.2"
      />
      <path
        d="M4.5 12.5 L8.2 19.8 H23.8 L27.5 12.5 L21.8 15.2 L16 7.2 L10.2 15.2 Z"
        :fill="`url(#${goldId})`"
        stroke="#e0a93a"
        stroke-width="1.2"
        stroke-linejoin="round"
      />
      <rect
        x="7.4"
        y="19.2"
        width="17.2"
        height="3.4"
        rx="1.4"
        :fill="`url(#${bandId})`"
        stroke="#e0a93a"
        stroke-width="1"
      />
      <circle cx="16" cy="14.8" r="1.7" fill="#ff8fab" stroke="#ff6f91" stroke-width="0.7" />
      <circle cx="10.6" cy="17.1" r="1.25" fill="#8fd3ff" stroke="#5bb8f0" stroke-width="0.6" />
      <circle cx="21.4" cy="17.1" r="1.25" fill="#b8f0a8" stroke="#7ed96a" stroke-width="0.6" />
      <circle cx="7.2" cy="9.2" r="0.9" fill="#fff4b8" />
      <circle cx="25.2" cy="8.6" r="0.7" fill="#fff4b8" />
      <circle cx="16" cy="5.2" r="0.8" fill="#fff7d1" />
      <defs>
        <linearGradient
          :id="goldId"
          x1="16"
          y1="7"
          x2="16"
          y2="21"
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color="#ffe28a" />
          <stop offset="0.55" stop-color="#f4c542" />
          <stop offset="1" stop-color="#e0a93a" />
        </linearGradient>
        <linearGradient
          :id="bandId"
          x1="16"
          y1="19"
          x2="16"
          y2="23"
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color="#ffd86b" />
          <stop offset="1" stop-color="#e8b24a" />
        </linearGradient>
      </defs>
    </svg>
  </span>
</template>

<style lang="scss" scoped>
.cute-crown {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  line-height: 0;
  vertical-align: middle;

  /* 正方形，避免在圓形 pip 裡看起來偏一邊 */
  &--sm {
    width: 0.7rem;
    height: 0.7rem;
  }

  &--md {
    width: 1.05rem;
    height: 1.05rem;
  }

  &--lg {
    width: 1.4rem;
    height: 1.4rem;
  }

  &--bounce {
    animation: cute-crown-bounce 1s ease-in-out infinite;
  }
}

.cute-crown__svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* 不做往下偏的 drop-shadow，否則小尺寸會覺得沒置中 */
  filter: drop-shadow(0 0 0.5px rgba(92, 77, 130, 0.18));
}

@keyframes cute-crown-bounce {
  0%,
  100% {
    transform: translateY(0) rotate(-4deg);
  }

  50% {
    transform: translateY(-2px) rotate(4deg);
  }
}
</style>
