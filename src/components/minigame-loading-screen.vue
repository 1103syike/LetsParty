<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

import ActionButton from '@/components/action-button.vue';
import { partyCopy } from '@/locales/zh-TW/party';
import { getMiniGameLoadingContent } from '@/party/minigame-loading/minigame-loading';

const props = defineProps<{
  gameId: string | null;
  roundLabel: string;
  isSuddenDeath: boolean;
}>();

const emit = defineEmits<{
  start: [];
}>();

/** 載入稍長一點，多輪到幾張教學圖 */
const LOAD_DURATION_MS = 10000;
const SLIDE_INTERVAL_MS = 2200;

const content = computed(() => getMiniGameLoadingContent(props.gameId));

const progress = ref(0);
const slideIndex = ref(0);
const isReady = computed(() => progress.value >= 100);

let loadRafId: number | null = null;
let slideIntervalId: number | null = null;
let loadStartedAt = 0;

const currentSlide = computed(() => {
  const slides = content.value.slides;

  if (slides.length === 0) {
    return null;
  }

  return slides[slideIndex.value % slides.length]!;
});

const progressLabel = computed(() =>
  isReady.value ? partyCopy.loadingReady : partyCopy.loadingLabel,
);

const slideCounter = computed(() => {
  const total = content.value.slides.length;

  if (total === 0) {
    return '';
  }

  return `${(slideIndex.value % total) + 1} / ${total}`;
});

function stopLoadLoop(): void {
  if (loadRafId !== null) {
    window.cancelAnimationFrame(loadRafId);
    loadRafId = null;
  }
}

function stopSlideLoop(): void {
  if (slideIntervalId !== null) {
    window.clearInterval(slideIntervalId);
    slideIntervalId = null;
  }
}

function tickLoad(now: number): void {
  const elapsed = now - loadStartedAt;
  const next = Math.min(100, Math.round((elapsed / LOAD_DURATION_MS) * 100));
  progress.value = next;

  if (next < 100) {
    loadRafId = window.requestAnimationFrame(tickLoad);
    return;
  }

  loadRafId = null;
}

function advanceSlide(): void {
  const total = content.value.slides.length;

  if (total <= 1) {
    return;
  }

  slideIndex.value = (slideIndex.value + 1) % total;
}

function startLoading(): void {
  stopLoadLoop();
  stopSlideLoop();
  progress.value = 0;
  slideIndex.value = 0;
  loadStartedAt = performance.now();
  loadRafId = window.requestAnimationFrame(tickLoad);
  slideIntervalId = window.setInterval(advanceSlide, SLIDE_INTERVAL_MS);
}

function handleStart(): void {
  if (!isReady.value) {
    return;
  }

  emit('start');
}

watch(
  () => props.gameId,
  () => {
    startLoading();
  },
);

onMounted(() => {
  startLoading();
});

onUnmounted(() => {
  stopLoadLoop();
  stopSlideLoop();
});
</script>

<template>
  <Teleport to="body">
    <section
      class="minigame-loading"
      :aria-label="content.name"
    >
      <Transition
        name="minigame-loading-fade"
        mode="out-in"
      >
        <img
          v-if="currentSlide"
          :key="currentSlide.imageSrc"
          class="minigame-loading__cover"
          :src="currentSlide.imageSrc"
          :alt="currentSlide.tip"
        />
      </Transition>

      <div class="minigame-loading__veil" aria-hidden="true" />
      <div class="minigame-loading__confetti" aria-hidden="true">
        <span
          v-for="dot in 12"
          :key="dot"
          class="minigame-loading__dot"
          :class="`minigame-loading__dot--${dot}`"
        />
      </div>

      <header class="minigame-loading__top flex flex-col items-center gap-sm">
        <span class="minigame-loading__round font-game">{{ roundLabel }}</span>
        <span
          v-if="isSuddenDeath"
          class="minigame-loading__sudden font-game"
        >
          {{ partyCopy.suddenDeathTitle }}
        </span>
      </header>

      <div class="minigame-loading__bottom flex flex-col gap-md">
        <div class="minigame-loading__copy flex flex-col gap-sm items-center text-center">
          <p class="minigame-loading__kicker font-game">{{ partyCopy.nextGameLabel }}</p>
          <h2 class="minigame-loading__title font-game">{{ content.name }}</h2>
          <p class="minigame-loading__intro text-sm font-bold">{{ content.intro }}</p>
        </div>

        <div
          class="minigame-loading__tip flex flex-col gap-sm text-center"
          aria-live="polite"
        >
          <div class="minigame-loading__tip-head flex items-center justify-between">
            <span class="minigame-loading__tip-badge font-game">
              {{ partyCopy.loadingTipLabel }}
            </span>
            <span class="minigame-loading__tip-count font-game">
              {{ slideCounter }}
            </span>
          </div>
          <p
            :key="`${gameId}-${slideIndex}`"
            class="minigame-loading__tip-text text-md font-bold"
          >
            {{ currentSlide?.tip }}
          </p>
        </div>

        <div class="minigame-loading__progress flex flex-col gap-sm">
          <div class="minigame-loading__progress-head flex items-center justify-between">
            <span class="minigame-loading__progress-label font-game">{{ progressLabel }}</span>
            <span class="minigame-loading__percent font-game">{{ progress }}%</span>
          </div>
          <div
            class="minigame-loading__bar"
            role="progressbar"
            :aria-valuenow="progress"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <span
              class="minigame-loading__bar-fill"
              :class="{ 'minigame-loading__bar-fill--ready': isReady }"
              :style="{ width: `${progress}%` }"
            />
          </div>
        </div>

        <ActionButton
          variant="hero"
          :disabled="!isReady"
          @click="handleStart"
        >
          {{ partyCopy.loadingStartGame }}
        </ActionButton>
      </div>
    </section>
  </Teleport>
</template>

<style lang="scss" scoped>
.minigame-loading {
  position: fixed;
  inset: 0;
  z-index: 210;
  overflow: hidden;
  background: var(--color-bg);
}

.minigame-loading__cover {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

.minigame-loading-fade-enter-active,
.minigame-loading-fade-leave-active {
  transition: opacity 0.4s ease, transform 0.4s ease;
}

.minigame-loading-fade-enter-from {
  opacity: 0;
  transform: scale(1.04);
}

.minigame-loading-fade-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

.minigame-loading__veil {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(
      ellipse 90% 55% at 50% 0%,
      color-mix(in srgb, var(--color-accent) 35%, transparent) 0%,
      transparent 55%
    ),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-text-heading) 18%, transparent) 0%,
      transparent 34%,
      color-mix(in srgb, var(--color-text-heading) 42%, transparent) 62%,
      color-mix(in srgb, var(--color-text-heading) 82%, transparent) 100%
    );
  pointer-events: none;
}

.minigame-loading__confetti {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}

.minigame-loading__dot {
  position: absolute;
  width: var(--space-sm);
  height: var(--space-sm);
  border-radius: var(--radius-full);
  opacity: 0.85;
  animation: minigame-loading-float 3.6s ease-in-out infinite;

  &--1 {
    top: 12%;
    left: 8%;
    background: var(--color-player-1);
  }

  &--2 {
    top: 18%;
    right: 10%;
    width: var(--space-md);
    height: var(--space-md);
    background: var(--color-player-3);
    animation-delay: -0.4s;
  }

  &--3 {
    top: 28%;
    left: 16%;
    background: var(--color-warning);
    animation-delay: -1.1s;
  }

  &--4 {
    top: 22%;
    right: 22%;
    background: var(--color-player-4);
    animation-delay: -1.8s;
  }

  &--5 {
    top: 40%;
    left: 6%;
    width: var(--space-xs);
    height: var(--space-xs);
    background: var(--color-player-2);
    animation-delay: -0.8s;
  }

  &--6 {
    top: 36%;
    right: 7%;
    background: var(--color-player-1);
    animation-delay: -2.2s;
  }

  &--7 {
    bottom: 42%;
    left: 12%;
    background: var(--color-player-3);
    animation-delay: -1.5s;
  }

  &--8 {
    bottom: 48%;
    right: 14%;
    width: var(--space-md);
    height: var(--space-md);
    background: var(--color-warning);
    animation-delay: -0.2s;
  }

  &--9 {
    bottom: 34%;
    left: 4%;
    background: var(--color-player-4);
    animation-delay: -2.6s;
  }

  &--10 {
    bottom: 38%;
    right: 5%;
    background: var(--color-accent);
    animation-delay: -1.3s;
  }

  &--11 {
    top: 48%;
    left: 20%;
    width: var(--space-xs);
    height: var(--space-xs);
    background: var(--color-on-accent);
    animation-delay: -2s;
  }

  &--12 {
    top: 52%;
    right: 18%;
    background: var(--color-player-2);
    animation-delay: -0.6s;
  }
}

.minigame-loading__top {
  position: absolute;
  top: calc(var(--space-md) + env(safe-area-inset-top));
  left: 0;
  right: 0;
  z-index: 2;
}

.minigame-loading__round {
  padding: var(--space-sm) var(--space-lg);
  border: 4px solid var(--color-on-accent);
  border-radius: var(--radius-full);
  background: linear-gradient(
    135deg,
    var(--color-accent) 0%,
    var(--color-accent-hover) 100%
  );
  color: var(--color-on-accent);
  font-size: var(--font-size-md);
  letter-spacing: 0.08em;
  transform: rotate(-3deg);
  box-shadow:
    0 var(--space-xs) 0 color-mix(in srgb, var(--color-text-heading) 35%, transparent),
    var(--shadow-party-btn);
  animation: minigame-loading-badge-bounce 2.4s ease-in-out infinite;
}

.minigame-loading__sudden {
  padding: var(--space-xs) var(--space-md);
  border: 3px solid var(--color-on-accent);
  border-radius: var(--radius-full);
  background: var(--color-player-1);
  color: var(--color-on-accent);
  font-size: var(--font-size-sm);
  letter-spacing: 0.08em;
  transform: rotate(2deg);
  box-shadow: 0 var(--space-xs) 0 color-mix(in srgb, var(--color-text-heading) 30%, transparent);
}

.minigame-loading__bottom {
  position: absolute;
  left: 50%;
  bottom: 0;
  z-index: 2;
  width: min(100%, 30rem);
  padding: var(--space-md) var(--space-md) calc(var(--space-lg) + env(safe-area-inset-bottom));
  transform: translateX(-50%);
}

.minigame-loading__kicker {
  margin: 0;
  padding: var(--space-xs) var(--space-md);
  border: 3px solid var(--color-on-accent);
  border-radius: var(--radius-full);
  background: var(--color-warning);
  color: var(--color-text-heading);
  font-size: var(--font-size-sm);
  letter-spacing: 0.1em;
  transform: rotate(-2deg);
  box-shadow: 0 var(--space-xs) 0 color-mix(in srgb, var(--color-text-heading) 28%, transparent);
}

.minigame-loading__title {
  margin: 0;
  font-size: calc(var(--font-size-3xl) * 1.15);
  letter-spacing: 0.08em;
  line-height: var(--line-height-tight);
  color: var(--color-on-accent);
  transform: rotate(-2deg);
  transform-origin: 50% 100%;
  animation: minigame-loading-title-jelly 2.8s infinite;
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

.minigame-loading__intro {
  margin: 0;
  max-width: 26rem;
  padding: var(--space-sm) var(--space-md);
  border: 3px solid color-mix(in srgb, var(--color-on-accent) 70%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-surface-solid) 82%, transparent);
  color: var(--color-text-heading);
  line-height: var(--line-height-normal);
  backdrop-filter: blur(6px);
  box-shadow: 0 var(--space-xs) 0 color-mix(in srgb, var(--color-text-heading) 22%, transparent);
}

.minigame-loading__tip {
  position: relative;
  min-height: 5.75rem;
  padding: var(--space-md);
  border: 4px solid var(--color-on-accent);
  border-radius: var(--radius-lg);
  background: linear-gradient(
    160deg,
    var(--color-surface-solid) 0%,
    color-mix(in srgb, var(--color-bg) 70%, var(--color-on-accent)) 100%
  );
  box-shadow:
    0 var(--space-sm) 0 color-mix(in srgb, var(--color-accent-hover) 55%, transparent),
    var(--shadow-party-btn);
  transform: rotate(0.5deg);
}

.minigame-loading__tip-badge {
  display: inline-block;
  padding: var(--space-xs) var(--space-sm);
  border: 3px solid var(--color-on-accent);
  border-radius: var(--radius-full);
  background: var(--color-player-3);
  color: var(--color-on-accent);
  font-size: var(--font-size-xs);
  letter-spacing: 0.06em;
  transform: rotate(-4deg);
  box-shadow: 0 var(--space-xs) 0 color-mix(in srgb, var(--color-text-heading) 25%, transparent);
}

.minigame-loading__tip-count {
  color: var(--color-accent-hover);
  font-size: var(--font-size-sm);
  letter-spacing: 0.04em;
  text-shadow: 0 1px 0 var(--color-on-accent);
}

.minigame-loading__tip-text {
  margin: 0;
  color: var(--color-text-heading);
  line-height: var(--line-height-normal);
  animation: minigame-loading-tip-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.minigame-loading__progress-label,
.minigame-loading__percent {
  color: var(--color-on-accent);
  font-size: var(--font-size-sm);
  letter-spacing: 0.06em;
  text-shadow:
    -2px -2px 0 var(--color-accent-hover),
    2px -2px 0 var(--color-accent-hover),
    -2px 2px 0 var(--color-accent-hover),
    2px 2px 0 var(--color-accent-hover);
}

.minigame-loading__bar {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: var(--space-lg);
  border: 4px solid var(--color-on-accent);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-text-heading) 55%, transparent);
  box-shadow: inset 0 var(--space-xs) 0 color-mix(in srgb, var(--color-text-heading) 35%, transparent);
}

.minigame-loading__bar-fill {
  display: block;
  position: relative;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    var(--color-player-1) 0%,
    var(--color-warning) 35%,
    var(--color-player-4) 70%,
    var(--color-player-3) 100%
  );
  transition: width 0.08s linear;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      120deg,
      transparent 0%,
      color-mix(in srgb, var(--color-on-accent) 45%, transparent) 45%,
      transparent 70%
    );
    background-size: 200% 100%;
    animation: minigame-loading-shine 1.4s linear infinite;
  }

  &--ready {
    animation: minigame-loading-ready-pulse 0.8s ease-in-out infinite;
  }
}

@keyframes minigame-loading-float {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }

  50% {
    transform: translateY(calc(var(--space-sm) * -1)) rotate(12deg);
  }
}

@keyframes minigame-loading-badge-bounce {
  0%,
  100% {
    transform: rotate(-3deg) translateY(0);
  }

  50% {
    transform: rotate(-3deg) translateY(calc(var(--space-xs) * -1));
  }
}

@keyframes minigame-loading-title-jelly {
  0%,
  70%,
  100% {
    transform: rotate(-2deg) scale(1);
  }

  75% {
    transform: rotate(-2deg) scale(1.08, 0.92);
  }

  80% {
    transform: rotate(-2deg) scale(0.94, 1.06);
  }

  85% {
    transform: rotate(-2deg) scale(1.03, 0.97);
  }
}

@keyframes minigame-loading-tip-pop {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(var(--space-sm));
  }

  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes minigame-loading-shine {
  from {
    background-position: 200% 0;
  }

  to {
    background-position: -200% 0;
  }
}

@keyframes minigame-loading-ready-pulse {
  0%,
  100% {
    filter: brightness(1);
  }

  50% {
    filter: brightness(1.12);
  }
}
</style>
