<script setup lang="ts">
import type { VolleyballEventKind } from '@/minigames/volleyball/volleyball';

withDefaults(
  defineProps<{
    kind: VolleyballEventKind | 'goal';
    size?: 'sm' | 'md';
  }>(),
  {
    size: 'md',
  },
);
</script>

<template>
  <span
    class="vb-event-icon"
    :class="[`vb-event-icon--${kind}`, `vb-event-icon--${size}`]"
    aria-hidden="true"
  >
    <!-- 擊球：小拳頭／墊擊弧 -->
    <svg
      v-if="kind === 'bump'"
      viewBox="0 0 32 32"
      class="vb-event-icon__svg"
    >
      <circle
        cx="16"
        cy="16"
        r="13"
        class="vb-event-icon__fill"
      />
      <path
        d="M9 18c2-5 5-7 7-7s5 2 7 7"
        class="vb-event-icon__stroke"
      />
      <circle
        cx="16"
        cy="11"
        r="3.2"
        class="vb-event-icon__accent"
      />
    </svg>

    <!-- 托球／舉球：雙手向上 -->
    <svg
      v-else-if="kind === 'set'"
      viewBox="0 0 32 32"
      class="vb-event-icon__svg"
    >
      <circle
        cx="16"
        cy="16"
        r="13"
        class="vb-event-icon__fill"
      />
      <path
        d="M10 20v-5c0-2 1.5-3.5 3.5-3.5S17 13 17 15v2"
        class="vb-event-icon__stroke"
      />
      <path
        d="M22 20v-5c0-2-1.5-3.5-3.5-3.5S15 13 15 15v2"
        class="vb-event-icon__stroke"
      />
      <circle
        cx="16"
        cy="9"
        r="2.4"
        class="vb-event-icon__accent"
      />
    </svg>

    <!-- 殺球：下劈閃電 -->
    <svg
      v-else-if="kind === 'spike' || kind === 'spike-kill'"
      viewBox="0 0 32 32"
      class="vb-event-icon__svg"
    >
      <circle
        cx="16"
        cy="16"
        r="13"
        class="vb-event-icon__fill"
      />
      <path
        d="M18 7 11 17h5l-2 8 9-12h-5l2-6z"
        class="vb-event-icon__accent"
      />
    </svg>

    <!-- 發球 -->
    <svg
      v-else-if="kind === 'serve'"
      viewBox="0 0 32 32"
      class="vb-event-icon__svg"
    >
      <circle
        cx="16"
        cy="16"
        r="13"
        class="vb-event-icon__fill"
      />
      <circle
        cx="13"
        cy="16"
        r="4"
        class="vb-event-icon__accent"
      />
      <path
        d="M18 12h7M18 16h8M18 20h6"
        class="vb-event-icon__stroke"
      />
    </svg>

    <!-- 落地球進球 -->
    <svg
      v-else-if="kind === 'ground-goal' || kind === 'goal'"
      viewBox="0 0 32 32"
      class="vb-event-icon__svg"
    >
      <circle
        cx="16"
        cy="16"
        r="13"
        class="vb-event-icon__fill"
      />
      <ellipse
        cx="16"
        cy="20"
        rx="8"
        ry="3"
        class="vb-event-icon__stroke"
      />
      <circle
        cx="16"
        cy="12"
        r="4.5"
        class="vb-event-icon__accent"
      />
    </svg>

    <!-- 出界 -->
    <svg
      v-else
      viewBox="0 0 32 32"
      class="vb-event-icon__svg"
    >
      <circle
        cx="16"
        cy="16"
        r="13"
        class="vb-event-icon__fill"
      />
      <path
        d="M10 10 22 22M22 10 10 22"
        class="vb-event-icon__accent"
      />
    </svg>
  </span>
</template>

<style lang="scss" scoped>
.vb-event-icon {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;

  &--sm {
    width: 1.25rem;
    height: 1.25rem;
  }

  &--md {
    width: 1.75rem;
    height: 1.75rem;
  }
}

.vb-event-icon__svg {
  width: 100%;
  height: 100%;
  display: block;
}

.vb-event-icon__fill {
  fill: color-mix(in srgb, var(--vb-icon-tone, var(--color-accent)) 22%, white);
  stroke: color-mix(in srgb, var(--vb-icon-tone, var(--color-accent)) 55%, white);
  stroke-width: 1.5;
}

.vb-event-icon__stroke {
  fill: none;
  stroke: var(--color-text-heading);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.vb-event-icon__accent {
  fill: var(--vb-icon-tone, var(--color-accent));
  stroke: var(--color-on-accent);
  stroke-width: 1;
}

.vb-event-icon--bump {
  --vb-icon-tone: var(--color-player-4);
}

.vb-event-icon--set {
  --vb-icon-tone: var(--color-player-3);
}

.vb-event-icon--spike,
.vb-event-icon--spike-kill {
  --vb-icon-tone: var(--color-warning);
}

.vb-event-icon--serve {
  --vb-icon-tone: var(--color-accent);
}

.vb-event-icon--ground-goal,
.vb-event-icon--goal {
  --vb-icon-tone: var(--color-success);
}

.vb-event-icon--out,
.vb-event-icon--net-out {
  --vb-icon-tone: var(--color-player-1);
}
</style>
