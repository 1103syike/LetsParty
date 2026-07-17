<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

interface FloatingPolygon {
  id: number;
  left: string;
  top: string;
  size: string;
  rotate: string;
  opacity: number;
  color: string;
  duration: string;
  shape: 'round' | 'diamond' | 'triangle';
}

const POLYGON_COLORS = [
  'var(--color-polygon-1)',
  'var(--color-polygon-2)',
  'var(--color-polygon-3)',
  'var(--color-polygon-4)',
];

const SHAPES: FloatingPolygon['shape'][] = ['round', 'diamond', 'triangle'];

const INITIAL_QUANTITY = 10;
const MAX_QUANTITY = 40;
const GENERATION_INTERVAL_MS = 600;

let nextId = 0;
const polygons = ref<FloatingPolygon[]>([]);
let intervalId: number | null = null;

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickColor(): string {
  const index = Math.floor(Math.random() * POLYGON_COLORS.length);

  return POLYGON_COLORS[index];
}

function pickShape(): FloatingPolygon['shape'] {
  const index = Math.floor(Math.random() * SHAPES.length);

  return SHAPES[index];
}

function createPolygon(): FloatingPolygon {
  return {
    id: nextId += 1,
    left: `${randomBetween(0, 100)}%`,
    top: `${randomBetween(0, 100)}%`,
    size: `${randomBetween(2, 12)}rem`,
    rotate: `${randomBetween(0, 180)}deg`,
    opacity: randomBetween(0.35, 0.6),
    color: pickColor(),
    duration: `${randomBetween(8, 18)}s`,
    shape: pickShape(),
  };
}

function addPolygon(): void {
  if (polygons.value.length >= MAX_QUANTITY) {
    return;
  }

  polygons.value.push(createPolygon());
}

function removePolygon(id: number): void {
  polygons.value = polygons.value.filter((polygon) => polygon.id !== id);
}

function clipPathForShape(shape: FloatingPolygon['shape']): string {
  if (shape === 'diamond') {
    return 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
  }

  if (shape === 'triangle') {
    return 'polygon(50% 0%, 0% 100%, 100% 100%)';
  }

  return 'circle(50% at 50% 50%)';
}

onMounted(() => {
  for (let index = 0; index < INITIAL_QUANTITY; index += 1) {
    addPolygon();
  }

  intervalId = window.setInterval(addPolygon, GENERATION_INTERVAL_MS);
});

onBeforeUnmount(() => {
  if (intervalId !== null) {
    window.clearInterval(intervalId);
  }
});
</script>

<template>
  <div class="background-polygons" aria-hidden="true">
    <span
      v-for="polygon in polygons"
      :key="polygon.id"
      class="background-polygons__shape"
      :style="{
        left: polygon.left,
        top: polygon.top,
        width: polygon.size,
        height: polygon.size,
        opacity: polygon.opacity,
        backgroundColor: polygon.color,
        transform: `rotate(${polygon.rotate})`,
        animationDuration: polygon.duration,
        clipPath: clipPathForShape(polygon.shape),
      }"
      @animationend="removePolygon(polygon.id)"
    />
  </div>
</template>

<style lang="scss" scoped>
.background-polygons {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.background-polygons__shape {
  position: absolute;
  animation: polygon-float linear forwards;
}

@keyframes polygon-float {
  0% {
    opacity: 0;
    transform: translate(0, 0) rotate(0deg);
  }

  10% {
    opacity: 1;
  }

  90% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: translate(-8rem, 8rem) rotate(12deg);
  }
}
</style>
