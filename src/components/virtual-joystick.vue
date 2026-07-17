<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';

const emit = defineEmits<{
  change: [value: { x: number; y: number }];
}>();

const rootRef = ref<HTMLElement | null>(null);
const knobX = ref(0);
const knobY = ref(0);
const activePointerId = ref<number | null>(null);

const MAX_OFFSET = 36;

function emitZero(): void {
  knobX.value = 0;
  knobY.value = 0;
  emit('change', { x: 0, y: 0 });
}

function updateFromClient(clientX: number, clientY: number): void {
  const root = rootRef.value;

  if (!root) {
    return;
  }

  const rect = root.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  let dx = clientX - centerX;
  let dy = clientY - centerY;
  const mag = Math.hypot(dx, dy);

  if (mag > MAX_OFFSET) {
    dx = (dx / mag) * MAX_OFFSET;
    dy = (dy / mag) * MAX_OFFSET;
  }

  knobX.value = dx;
  knobY.value = dy;
  // 螢幕 y 向下 → 3D/遊戲前進為 -y 映射到 input.y（前方）
  emit('change', {
    x: dx / MAX_OFFSET,
    y: -dy / MAX_OFFSET,
  });
}

function onPointerDown(event: PointerEvent): void {
  if (activePointerId.value !== null) {
    return;
  }

  activePointerId.value = event.pointerId;
  rootRef.value?.setPointerCapture(event.pointerId);
  updateFromClient(event.clientX, event.clientY);
}

function onPointerMove(event: PointerEvent): void {
  if (event.pointerId !== activePointerId.value) {
    return;
  }

  updateFromClient(event.clientX, event.clientY);
}

function onPointerUp(event: PointerEvent): void {
  if (event.pointerId !== activePointerId.value) {
    return;
  }

  activePointerId.value = null;
  emitZero();
}

onBeforeUnmount(() => {
  emitZero();
});
</script>

<template>
  <div
    ref="rootRef"
    class="virtual-joystick"
    @pointerdown.prevent="onPointerDown"
    @pointermove.prevent="onPointerMove"
    @pointerup.prevent="onPointerUp"
    @pointercancel.prevent="onPointerUp"
  >
    <span
      class="virtual-joystick__knob"
      :style="{
        transform: `translate(${knobX}px, ${knobY}px)`,
      }"
    />
  </div>
</template>

<style lang="scss" scoped>
.virtual-joystick {
  position: relative;
  width: 7.5rem;
  height: 7.5rem;
  border: 3px solid color-mix(in srgb, var(--color-border) 70%, white);
  border-radius: 50%;
  background: color-mix(in srgb, var(--color-surface-solid) 78%, white);
  box-shadow: 3px 3px 0 rgba(92, 77, 130, 0.12);
  touch-action: none;
  user-select: none;
}

.virtual-joystick__knob {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 2.75rem;
  height: 2.75rem;
  margin: -1.375rem 0 0 -1.375rem;
  border: 2px solid rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  background: linear-gradient(145deg, var(--color-accent) 0%, var(--color-accent-hover) 100%);
  box-shadow: 2px 2px 0 rgba(92, 77, 130, 0.18);
  pointer-events: none;
}
</style>
