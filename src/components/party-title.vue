<script setup lang="ts">
import { homeCopy } from '@/locales/zh-TW/home';
</script>

<template>
  <header class="party-title flex flex-col items-center gap-sm text-center">
    <h1 class="party-title__brand flex flex-col items-center gap-xs">
      <span class="party-title__english font-game">{{ homeCopy.brandEnglish }}</span>
      <span class="party-title__chinese">{{ homeCopy.brandChinese }}</span>
    </h1>
    <p class="party-title__subtitle text-md text-muted">{{ homeCopy.subtitle }}</p>
  </header>
</template>

<style lang="scss" scoped>
.party-title__brand {
  margin: 0;
  line-height: var(--line-height-tight);
}

/* 瑪利歐派對貼紙字：白／紫字 + 紫邊，對齊淡紫背景 */
.party-title__english {
  font-size: calc(var(--font-size-3xl) * 1.55);
  font-weight: var(--font-weight-normal);
  letter-spacing: 0.06em;
  color: var(--color-on-accent);
  transform: rotate(-3deg);
  animation: party-title-jelly 3.2s infinite;
  transform-origin: 50% 100%;
  text-shadow:
    calc(var(--space-xs) * -1) calc(var(--space-xs) * -1) 0 var(--color-accent-hover),
    var(--space-xs) calc(var(--space-xs) * -1) 0 var(--color-accent-hover),
    calc(var(--space-xs) * -1) var(--space-xs) 0 var(--color-accent-hover),
    var(--space-xs) var(--space-xs) 0 var(--color-accent-hover),
    calc(var(--space-xs) * -1) 0 0 var(--color-accent-hover),
    var(--space-xs) 0 0 var(--color-accent-hover),
    0 calc(var(--space-xs) * -1) 0 var(--color-accent-hover),
    0 var(--space-xs) 0 var(--color-accent-hover),
    0 var(--space-sm) 0 color-mix(in srgb, var(--color-text-heading) 40%, transparent);
}

.party-title__chinese {
  font-size: calc(var(--font-size-3xl) * 1.15);
  font-weight: 900;
  letter-spacing: 0.12em;
  color: var(--color-accent-hover);
  transform: rotate(2deg);
  text-shadow:
    -3px -3px 0 var(--color-on-accent),
    3px -3px 0 var(--color-on-accent),
    -3px 3px 0 var(--color-on-accent),
    3px 3px 0 var(--color-on-accent),
    -3px 0 0 var(--color-on-accent),
    3px 0 0 var(--color-on-accent),
    0 -3px 0 var(--color-on-accent),
    0 3px 0 var(--color-on-accent),
    0 var(--space-xs) 0 color-mix(in srgb, var(--color-text-heading) 30%, transparent);
}

.party-title__subtitle {
  max-width: 20rem;
}

@keyframes party-title-jelly {
  0%,
  70%,
  100% {
    transform: rotate(-3deg) scale(1);
  }

  75% {
    transform: rotate(-3deg) scale(1.1, 0.9);
  }

  80% {
    transform: rotate(-3deg) scale(0.94, 1.06);
  }

  85% {
    transform: rotate(-3deg) scale(1.04, 0.96);
  }

  90% {
    transform: rotate(-3deg) scale(0.98, 1.02);
  }

  95% {
    transform: rotate(-3deg) scale(1.01, 0.99);
  }
}
</style>
