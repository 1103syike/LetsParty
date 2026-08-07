<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

import AnimalModelPreview from '@/components/animal-model-preview.vue';
import { partyCopy } from '@/locales/zh-TW/party';
import {
  crownsAt,
  getCrownHistoryRoundCount,
  type CrownHistory,
} from '@/party/scoring/crown-history';
import type { Participant } from '@/types/party';

const props = defineProps<{
  participants: Participant[];
  crownHistory: CrownHistory;
}>();

const CHART_WIDTH = 340;
const CHART_HEIGHT = 200;
const PADDING = { top: 18, right: 16, bottom: 32, left: 32 };
/** 逐局畫出一格 */
const REVEAL_MS = 480;

const revealedRound = ref(0);
let revealTimer: number | null = null;

const roundCount = computed(() => getCrownHistoryRoundCount(props.crownHistory));

const maxCrowns = computed(() => {
  let peak = 1;

  for (const participant of props.participants) {
    const timeline = props.crownHistory[participant.id] ?? [0];

    for (let round = 0; round <= roundCount.value; round += 1) {
      peak = Math.max(peak, crownsAt(timeline, round));
    }
  }

  return peak;
});

const plotLeft = PADDING.left;
const plotRight = CHART_WIDTH - PADDING.right;
const plotTop = PADDING.top;
const plotBottom = CHART_HEIGHT - PADDING.bottom;
const plotWidth = plotRight - plotLeft;
const plotHeight = plotBottom - plotTop;

const yTicks = computed(() => {
  const ticks: number[] = [];
  const max = maxCrowns.value;

  for (let value = 0; value <= max; value += 1) {
    ticks.push(value);
  }

  return ticks;
});

const xLabels = computed(() => {
  const labels: number[] = [];

  for (let round = 0; round <= roundCount.value; round += 1) {
    labels.push(round);
  }

  return labels;
});

/** 圖例：最終皇冠多→少 */
const legendRows = computed(() => {
  return [...props.participants]
    .map((participant, seatIndex) => {
      const timeline = props.crownHistory[participant.id] ?? [0];
      const finalCrowns = crownsAt(timeline, timeline.length - 1);

      return { participant, seatIndex, finalCrowns };
    })
    .sort((a, b) => {
      if (b.finalCrowns !== a.finalCrowns) {
        return b.finalCrowns - a.finalCrowns;
      }

      return a.seatIndex - b.seatIndex;
    });
});

const series = computed(() => {
  return props.participants.map((participant) => {
    const timeline = props.crownHistory[participant.id] ?? [0];
    const points: Array<{ round: number; crowns: number; x: number; y: number }> = [];

    for (let round = 0; round <= roundCount.value; round += 1) {
      const crowns = crownsAt(timeline, round);
      points.push({
        round,
        crowns,
        x: xAt(round),
        y: yAt(crowns),
      });
    }

    return {
      id: participant.id,
      color: participant.color,
      points,
    };
  });
});

function xAt(round: number): number {
  if (roundCount.value <= 0) {
    return plotLeft + plotWidth / 2;
  }

  return plotLeft + (round / roundCount.value) * plotWidth;
}

function yAt(crowns: number): number {
  const max = maxCrowns.value;

  if (max <= 0) {
    return plotBottom;
  }

  return plotBottom - (crowns / max) * plotHeight;
}

function playerStroke(color: Participant['color']): string {
  return `var(--color-${color})`;
}

function roundLabel(round: number): string {
  return partyCopy.chartRoundLabel.replace('{round}', String(round));
}

function crownLabel(count: number): string {
  return partyCopy.crownCount.replace('{count}', String(count));
}

/** 畫到目前 reveal 進度的折線字串 */
function polylinePoints(points: Array<{ round: number; x: number; y: number }>): string {
  const visible = points.filter((point) => point.round <= revealedRound.value);

  if (visible.length === 0) {
    return '';
  }

  return visible.map((point) => `${point.x},${point.y}`).join(' ');
}

function startReveal(): void {
  stopReveal();
  revealedRound.value = 0;

  if (roundCount.value <= 0) {
    return;
  }

  revealTimer = window.setInterval(() => {
    if (revealedRound.value >= roundCount.value) {
      stopReveal();
      return;
    }

    revealedRound.value += 1;
  }, REVEAL_MS);
}

function stopReveal(): void {
  if (revealTimer != null) {
    window.clearInterval(revealTimer);
    revealTimer = null;
  }
}

onMounted(() => {
  startReveal();
});

onUnmounted(() => {
  stopReveal();
});
</script>

<template>
  <section
    class="crown-chart flex flex-col gap-md pad-md"
    :aria-label="partyCopy.crownChartTitle"
  >
    <h3 class="crown-chart__title font-game text-lg text-center">
      {{ partyCopy.crownChartTitle }}
    </h3>

    <svg
      class="crown-chart__svg full-width"
      :viewBox="`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`"
      role="img"
      :aria-label="partyCopy.crownChartTitle"
    >
      <!-- Y 格線 -->
      <g
        v-for="tick in yTicks"
        :key="`y-${tick}`"
      >
        <line
          class="crown-chart__grid"
          :x1="plotLeft"
          :y1="yAt(tick)"
          :x2="plotRight"
          :y2="yAt(tick)"
        />
        <text
          class="crown-chart__axis-text"
          :x="plotLeft - 8"
          :y="yAt(tick) + 4"
          text-anchor="end"
        >
          {{ tick }}
        </text>
      </g>

      <!-- X 軸標籤 -->
      <text
        v-for="round in xLabels"
        :key="`x-${round}`"
        class="crown-chart__axis-text"
        :class="{ 'crown-chart__axis-text--on': round <= revealedRound }"
        :x="xAt(round)"
        :y="CHART_HEIGHT - 8"
        text-anchor="middle"
      >
        {{ roundLabel(round) }}
      </text>

      <!-- 折線（每人一色；頭像不貼線尖，避免同分互撞） -->
      <g
        v-for="line in series"
        :key="line.id"
      >
        <polyline
          v-if="polylinePoints(line.points)"
          class="crown-chart__line"
          fill="none"
          :stroke="playerStroke(line.color)"
          :points="polylinePoints(line.points)"
        />
        <circle
          v-for="point in line.points.filter((entry) => entry.round <= revealedRound)"
          :key="`${line.id}-${point.round}`"
          class="crown-chart__dot"
          :cx="point.x"
          :cy="point.y"
          r="4.5"
          :fill="playerStroke(line.color)"
        />
      </g>
    </svg>

    <ul class="crown-chart__legend">
      <li
        v-for="row in legendRows"
        :key="row.participant.id"
        class="crown-chart__legend-item flex items-center gap-sm"
      >
        <span
          class="crown-chart__swatch"
          :style="{ background: playerStroke(row.participant.color) }"
        />
        <div class="crown-chart__legend-avatar">
          <AnimalModelPreview
            :animal-id="row.participant.animalId"
            :player-color="row.participant.color"
            compact
          />
        </div>
        <span class="text-sm font-bold crown-chart__legend-name">
          {{ row.participant.displayName }}
        </span>
        <span class="text-xs text-muted">{{ crownLabel(row.finalCrowns) }}</span>
      </li>
    </ul>
  </section>
</template>

<style lang="scss" scoped>
.crown-chart {
  width: 100%;
  border: 3px solid color-mix(in srgb, var(--color-accent) 30%, white);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-surface-solid) 94%, white);
}

.crown-chart__title {
  margin: 0;
  color: var(--color-text-heading);
}

.crown-chart__svg {
  display: block;
  height: auto;
  max-height: 220px;
}

.crown-chart__grid {
  stroke: var(--color-border);
  stroke-width: 1;
}

.crown-chart__axis-text {
  fill: var(--color-text-muted);
  font-size: var(--font-size-xs);
  opacity: 0.55;
}

.crown-chart__axis-text--on {
  fill: var(--color-text);
  opacity: 1;
  font-weight: var(--font-weight-bold);
}

.crown-chart__line {
  stroke-width: 3.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.crown-chart__dot {
  stroke: var(--color-on-accent);
  stroke-width: 1.5;
}

.crown-chart__legend {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.crown-chart__legend-item {
  min-width: 0;
}

.crown-chart__swatch {
  width: 0.75rem;
  height: 0.75rem;
  flex-shrink: 0;
  border-radius: var(--radius-full);
}

.crown-chart__legend-avatar {
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border-radius: var(--radius-full);
  overflow: hidden;
  background: var(--color-surface);
}

.crown-chart__legend-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
</style>
