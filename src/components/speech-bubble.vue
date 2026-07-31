<script setup lang="ts">
defineProps<{
  text: string;
  accentColor?: string;
}>();
</script>

<template>
  <div
    class="speech-bubble"
    :style="accentColor ? { '--speech-accent': accentColor } : undefined"
  >
    <p class="speech-bubble__text">{{ text }}</p>
    <span class="speech-bubble__tail" aria-hidden="true" />
  </div>
</template>

<style lang="scss" scoped>
.speech-bubble {
  --speech-accent: var(--color-accent);

  position: relative;
  max-width: 10rem;
  padding: var(--space-xs) var(--space-sm);
  border: 3px solid var(--speech-accent);
  border-radius: var(--radius-md);
  background: var(--color-surface-solid);
  box-shadow: var(--shadow-party-btn);
  animation: speech-bubble-pop 0.28s cubic-bezier(0.34, 1.45, 0.64, 1);
  pointer-events: none;
}

.speech-bubble__text {
  margin: 0;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
  color: var(--color-text-heading);
  word-break: break-word;
  text-align: center;
}

.speech-bubble__tail {
  position: absolute;
  left: 50%;
  bottom: calc(var(--space-xs) * -1);
  width: var(--space-sm);
  height: var(--space-sm);
  border-right: 3px solid var(--speech-accent);
  border-bottom: 3px solid var(--speech-accent);
  background: var(--color-surface-solid);
  transform: translateX(-50%) rotate(45deg);
}

@keyframes speech-bubble-pop {
  from {
    opacity: 0;
    transform: translateY(var(--space-sm)) scale(0.86);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
