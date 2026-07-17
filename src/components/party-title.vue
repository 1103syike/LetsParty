<script setup lang="ts">
import { homeCopy } from '@/locales/zh-TW/home';
</script>

<template>
  <header class="party-title flex flex-col items-center gap-sm text-center">
    <p class="party-title__en font-game text-title text-3xl">CROWN PARTY</p>
    <h1 class="party-title__zh font-game text-title text-2xl">{{ homeCopy.title }}</h1>
    <p class="party-title__subtitle text-md text-muted">{{ homeCopy.subtitle }}</p>
  </header>
</template>

<style lang="scss" scoped>
.party-title__en {
  line-height: var(--line-height-tight);
  animation: jelly-bounce 3.2s infinite;
  transform-origin: 50% 100%;
}

.party-title__zh {
  line-height: var(--line-height-tight);
  animation: joy-bounce 1s infinite;
  transform-origin: 50% 100%;
}

.party-title__subtitle {
  max-width: 20rem;
}

@keyframes jelly-bounce {
  0%,
  70%,
  100% {
    transform: scale(1);
  }

  75% {
    transform: scale(1.12, 0.88);
  }

  80% {
    transform: scale(0.92, 1.08);
  }

  85% {
    transform: scale(1.04, 0.96);
  }

  90% {
    transform: scale(0.98, 1.02);
  }

  95% {
    transform: scale(1.01, 0.99);
  }
}

@keyframes joy-bounce {
  0%,
  100% {
    transform: scale(1);
    animation-timing-function: cubic-bezier(0.895, 0.03, 0.685, 0.22);
  }

  50% {
    transform: scale(1.05, 0.92);
    animation-timing-function: cubic-bezier(0.165, 0.84, 0.44, 1);
  }
}
</style>
