<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

import SpeechBubble from '@/components/speech-bubble.vue';
import { usePartyChat } from '@/composables/use-party-chat';
import { usePartyStore } from '@/stores/party-store';
import type { PlayerColor } from '@/types/party';

interface BubblePlacement {
  id: string;
  text: string;
  left: number;
  top: number;
  color: string;
}

const COLOR_VAR: Record<PlayerColor, string> = {
  'player-1': 'var(--color-player-1)',
  'player-2': 'var(--color-player-2)',
  'player-3': 'var(--color-player-3)',
  'player-4': 'var(--color-player-4)',
};

const partyStore = usePartyStore();
const chat = usePartyChat();

const placements = ref<BubblePlacement[]>([]);
let rafId: number | null = null;

const bubbles = computed(() => chat.activeBubbles.value);

function colorForParticipant(participantId: string): string {
  const participant = partyStore.participants.find((entry) => entry.id === participantId);
  return participant ? COLOR_VAR[participant.color] : 'var(--color-accent)';
}

function updatePlacements(): void {
  const next: BubblePlacement[] = [];
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  bubbles.value.forEach((message, index) => {
    const anchor = document.querySelector<HTMLElement>(
      `[data-chat-anchor="${message.participantId}"]`,
    );

    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      next.push({
        id: message.id,
        text: message.text,
        left: rect.left + rect.width / 2,
        top: Math.max(16, rect.top - 8),
        color: colorForParticipant(message.participantId),
      });
      return;
    }

    // loading 等沒有錨點：依座位順序排在上方
    const seatIndex = Math.max(
      0,
      partyStore.participants.findIndex((entry) => entry.id === message.participantId),
    );
    const total = Math.max(1, partyStore.participants.length);
    const slot = (seatIndex + 0.5) / total;
    next.push({
      id: message.id,
      text: message.text,
      left: viewportW * (0.18 + slot * 0.64),
      top: Math.min(viewportH * 0.18, 120 + index * 8),
      color: colorForParticipant(message.participantId),
    });
  });

  placements.value = next;
}

function tick(): void {
  updatePlacements();
  rafId = window.requestAnimationFrame(tick);
}

watch(
  bubbles,
  async () => {
    await nextTick();
    updatePlacements();
  },
  { deep: true },
);

onMounted(() => {
  updatePlacements();
  rafId = window.requestAnimationFrame(tick);
});

onUnmounted(() => {
  if (rafId !== null) {
    window.cancelAnimationFrame(rafId);
  }
});
</script>

<template>
  <Teleport to="body">
    <div class="room-speech-overlay" aria-hidden="true">
      <div
        v-for="bubble in placements"
        :key="bubble.id"
        class="room-speech-overlay__item"
        :style="{
          left: `${bubble.left}px`,
          top: `${bubble.top}px`,
        }"
      >
        <SpeechBubble
          :text="bubble.text"
          :accent-color="bubble.color"
        />
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.room-speech-overlay {
  position: fixed;
  inset: 0;
  z-index: 230;
  pointer-events: none;
  overflow: hidden;
}

.room-speech-overlay__item {
  position: absolute;
  transform: translate(-50%, -100%);
}
</style>
