<script setup lang="ts">
import { ref } from 'vue';

withDefaults(
  defineProps<{
    disabled?: boolean;
    variant?: 'default' | 'hero';
  }>(),
  {
    variant: 'default',
  },
);

defineEmits<{
  click: [];
}>();

const isActive = ref(false);
const isHover = ref(false);

function handleMouseDown(): void {
  isActive.value = true;
}

function handleMouseUp(): void {
  isActive.value = false;
}

function handleMouseEnter(): void {
  isHover.value = true;
}

function handleMouseLeave(): void {
  isHover.value = false;
  isActive.value = false;
}
</script>

<template>
  <button
    type="button"
    class="party-btn font-bold"
    :class="{
      'party-btn--hero': variant === 'hero',
      'party-btn--active': isActive,
      'party-btn--hover': isHover,
    }"
    :disabled="disabled"
    @click="$emit('click')"
    @mousedown="handleMouseDown"
    @mouseup="handleMouseUp"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <span class="party-btn__deco party-btn__deco--one" />
    <span class="party-btn__deco party-btn__deco--two" />
    <span class="party-btn__label">
      <slot />
    </span>
  </button>
</template>

<style lang="scss" scoped>
.party-btn {
  position: relative;
  width: 100%;
  padding: var(--space-md) var(--space-lg);
  overflow: hidden;
  border: none;
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-party-btn);
  backdrop-filter: blur(6px);
  color: var(--color-text-heading);
  font-size: var(--font-size-lg);
  transition-duration: 0.2s;
  transition-timing-function: cubic-bezier(0, 1.65, 1, 1.65);
  user-select: none;

  &--hero {
    min-height: 96px;
    font-size: var(--font-size-xl);
  }

  &--hover {
    color: var(--color-accent-hover);
  }

  &--active {
    transform: scale(0.98) rotate(-1deg);
    transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  &:disabled {
    opacity: 0.55;
    pointer-events: none;
  }
}

.party-btn__label {
  position: relative;
  z-index: 1;
}

.party-btn__deco {
  position: absolute;
  border-radius: 50%;
  opacity: 0.55;
  pointer-events: none;

  &--one {
    top: 0;
    left: 0;
    width: 8rem;
    height: 8rem;
    background: var(--color-polygon-1);
    transform: translate(-45%, -55%);
  }

  &--two {
    right: 0;
    bottom: 0;
    width: 6rem;
    height: 6rem;
    background: var(--color-polygon-3);
    clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
    transform: translate(20%, 25%) rotate(-12deg);
  }
}
</style>
