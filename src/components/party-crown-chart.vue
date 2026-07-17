<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

import AnimalAvatarIcon from '@/components/animal-avatar-icon.vue';
import { partyCopy } from '@/locales/zh-TW/party';
import { getCrownHistoryRoundCount } from '@/party/scoring/crown-history';
import type { CrownHistory } from '@/party/scoring/crown-history';
import type { Participant } from '@/types/party';

const props = defineProps<{
  participants: Participant[];
  crownHistory: CrownHistory;
}>();

const CHART_WIDTH = 340;
const CHART_HEIGHT = 196;
const PADDING = { top: 22, right: 36, bottom: 30, left: 28 };
/** 一格（一回合）畫完要多久，瑪利歐派對感 */
const SEGMENT_DURATION_MS = 580;
const STACK_GAP_Y = 16;
const STACK_GAP_X = 10;

interface ChartTip {
  participant: Participant;
  x: number;
  y: number;
  crowns: number;
}

const animProgress = ref(0);
let rafId: number | null = null;
let animStartedAt = 0;

const roundCount = computed(() => getCrownHistoryRoundCount(props.crownHistory));

const maxCrowns = computed(() => {
  let peak = 1;

  for (const participant of props.participants) {
    for (const value of timelineFor(participant.id)) {
      peak = Math.max(peak, value);
    }
  }

  return peak;
});

const xLabels = computed(() => {
  const labels: number[] = [];

  for (let round = 0; round <= roundCount.value; round += 1) {
    labels.push(round);
  }

  return labels;
});

/** 帶錯開後的線尾大頭照位置 */
const tipMarkers = computed(() => {
  const rawTips = props.participants.map((participant) => tipFor(participant));
  return applyStackOffsets(rawTips);
});

function playerColor(color: Participant['color']): string {
  return `var(--color-${color})`;
}

function timelineFor(participantId: string): number[] {
  return props.crownHistory[participantId] ?? [0];
}

function pointX(roundIndex: number): number {
  if (roundCount.value === 0) {
    return PADDING.left;
  }

  const innerWidth = CHART_WIDTH - PADDING.left - PADDING.right;

  return PADDING.left + (roundIndex / roundCount.value) * innerWidth;
}

function pointY(value: number): number {
  const innerHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const ratio = maxCrowns.value === 0 ? 0 : value / maxCrowns.value;

  return PADDING.top + innerHeight - ratio * innerHeight;
}

function easeInOutCubic(t: number): number {
  if (t < 0.5) {
    return 4 * t * t * t;
  }

  return 1 - ((-2 * t + 2) ** 3) / 2;
}

function tipFor(participant: Participant): ChartTip {
  const timeline = timelineFor(participant.id);
  const maxRound = Math.max(0, timeline.length - 1);
  const progress = Math.min(animProgress.value, maxRound);
  const fromRound = Math.floor(progress);
  const segmentT = easeInOutCubic(progress - fromRound);

  if (fromRound >= maxRound) {
    const crowns = timeline[maxRound] ?? 0;

    return {
      participant,
      x: pointX(maxRound),
      y: pointY(crowns),
      crowns,
    };
  }

  const fromValue = timeline[fromRound] ?? 0;
  const toValue = timeline[fromRound + 1] ?? fromValue;
  const crowns = fromValue + (toValue - fromValue) * segmentT;
  const x0 = pointX(fromRound);
  const x1 = pointX(fromRound + 1);

  return {
    participant,
    x: x0 + (x1 - x0) * segmentT,
    y: pointY(crowns),
    crowns,
  };
}

/** 同高度線尾錯開，避免大頭照疊成一團 */
function applyStackOffsets(tips: ChartTip[]): ChartTip[] {
  const buckets = new Map<string, ChartTip[]>();

  for (const tip of tips) {
    const key = `${Math.round(tip.y / 6)}_${Math.round(tip.x / 8)}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(tip);
    buckets.set(key, bucket);
  }

  const result: ChartTip[] = [];

  for (const bucket of buckets.values()) {
    bucket.sort((left, right) => left.participant.id.localeCompare(right.participant.id));
    const mid = (bucket.length - 1) / 2;

    bucket.forEach((tip, index) => {
      const stack = index - mid;
      result.push({
        ...tip,
        x: tip.x + stack * STACK_GAP_X,
        y: tip.y + stack * STACK_GAP_Y,
      });
    });
  }

  return result.sort((left, right) => left.participant.id.localeCompare(right.participant.id));
}

function polylinePoints(participantId: string): string {
  const timeline = timelineFor(participantId);
  const maxRound = Math.max(0, timeline.length - 1);
  const progress = Math.min(animProgress.value, maxRound);
  const fromRound = Math.floor(progress);
  const segmentT = easeInOutCubic(progress - fromRound);
  const points: string[] = [];

  for (let round = 0; round <= fromRound; round += 1) {
    points.push(`${pointX(round)},${pointY(timeline[round] ?? 0)}`);
  }

  if (fromRound < maxRound) {
    const fromValue = timeline[fromRound] ?? 0;
    const toValue = timeline[fromRound + 1] ?? fromValue;
    const crowns = fromValue + (toValue - fromValue) * segmentT;
    const x0 = pointX(fromRound);
    const x1 = pointX(fromRound + 1);
    const tipX = x0 + (x1 - x0) * segmentT;
    const tipY = pointY(crowns);
    points.push(`${tipX},${tipY}`);
  }

  return points.join(' ');
}

function visibleDots(participantId: string): Array<{ roundIndex: number; value: number }> {
  const timeline = timelineFor(participantId);
  const maxRound = Math.max(0, timeline.length - 1);
  const revealed = Math.min(Math.floor(animProgress.value), maxRound);
  const dots: Array<{ roundIndex: number; value: number }> = [];

  for (let round = 0; round <= revealed; round += 1) {
    dots.push({ roundIndex: round, value: timeline[round] ?? 0 });
  }

  return dots;
}

function roundLabel(round: number): string {
  return partyCopy.chartRoundLabel.replace('{round}', String(round));
}

function avatarStyle(tip: ChartTip): Record<string, string> {
  return {
    left: `${(tip.x / CHART_WIDTH) * 100}%`,
    top: `${(tip.y / CHART_HEIGHT) * 100}%`,
    borderColor: playerColor(tip.participant.color),
  };
}

function stopAnimation(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function startAnimation(): void {
  stopAnimation();
  animProgress.value = 0;
  animStartedAt = performance.now();

  const tick = (now: number): void => {
    const elapsed = now - animStartedAt;
    const next = Math.min(roundCount.value, elapsed / SEGMENT_DURATION_MS);
    animProgress.value = next;

    if (next < roundCount.value) {
      rafId = requestAnimationFrame(tick);
      return;
    }

    animProgress.value = roundCount.value;
    rafId = null;
  };

  rafId = requestAnimationFrame(tick);
}

onMounted(() => {
  startAnimation();
});

onUnmounted(() => {
  stopAnimation();
});

watch(
  () => props.participants.map((participant) => {
    const timeline = props.crownHistory[participant.id] ?? [0];
    return `${participant.id}:${timeline.join(',')}`;
  }).join('|'),
  () => {
    startAnimation();
  },
);
</script>

<template>
  <section class="party-crown-chart flex flex-col gap-sm">
    <h3 class="party-crown-chart__title text-md font-bold text-center">
      {{ partyCopy.crownChartTitle }}
    </h3>

    <div class="party-crown-chart__stage">
      <svg
        class="party-crown-chart__svg"
        :viewBox="`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`"
        role="img"
        :aria-label="partyCopy.crownChartTitle"
      >
        <line
          :x1="PADDING.left"
          :y1="CHART_HEIGHT - PADDING.bottom"
          :x2="CHART_WIDTH - PADDING.right"
          :y2="CHART_HEIGHT - PADDING.bottom"
          class="party-crown-chart__axis"
        />
        <line
          :x1="PADDING.left"
          :y1="PADDING.top"
          :x2="PADDING.left"
          :y2="CHART_HEIGHT - PADDING.bottom"
          class="party-crown-chart__axis"
        />

        <g v-for="round in xLabels" :key="`grid-${round}`">
          <line
            :x1="pointX(round)"
            :y1="PADDING.top"
            :x2="pointX(round)"
            :y2="CHART_HEIGHT - PADDING.bottom"
            class="party-crown-chart__grid"
          />
          <text
            :x="pointX(round)"
            :y="CHART_HEIGHT - PADDING.bottom + 18"
            class="party-crown-chart__tick"
            text-anchor="middle"
          >
            {{ roundLabel(round) }}
          </text>
        </g>

        <polyline
          v-for="participant in participants"
          :key="participant.id"
          :points="polylinePoints(participant.id)"
          class="party-crown-chart__line"
          :style="{ stroke: playerColor(participant.color) }"
        />

        <template v-for="participant in participants" :key="`${participant.id}-dots`">
          <circle
            v-for="dot in visibleDots(participant.id)"
            :key="`${participant.id}-${dot.roundIndex}`"
            :cx="pointX(dot.roundIndex)"
            :cy="pointY(dot.value)"
            r="3.5"
            class="party-crown-chart__dot"
            :style="{ fill: playerColor(participant.color) }"
          />
        </template>
      </svg>

      <div class="party-crown-chart__avatars" aria-hidden="true">
        <div
          v-for="tip in tipMarkers"
          :key="tip.participant.id"
          class="party-crown-chart__avatar"
          :style="avatarStyle(tip)"
        >
          <AnimalAvatarIcon
            :animal-id="tip.participant.animalId"
            size="sm"
          />
        </div>
      </div>
    </div>

    <ul class="party-crown-chart__legend">
      <li
        v-for="participant in participants"
        :key="participant.id"
        class="party-crown-chart__legend-item"
      >
        <span
          class="party-crown-chart__legend-dot"
          :style="{ background: playerColor(participant.color) }"
        />
        <span class="party-crown-chart__legend-name">{{ participant.displayName }}</span>
      </li>
    </ul>
  </section>
</template>

<style lang="scss" scoped>
.party-crown-chart {
  width: 100%;
}

.party-crown-chart__title {
  margin: 0;
  color: var(--color-text-heading);
}

.party-crown-chart__stage {
  position: relative;
  width: 100%;
}

.party-crown-chart__svg {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.45);
}

.party-crown-chart__axis {
  stroke: var(--color-border);
  stroke-width: 1;
}

.party-crown-chart__grid {
  stroke: rgba(155, 127, 212, 0.12);
  stroke-width: 1;
  stroke-dasharray: 3 4;
}

.party-crown-chart__tick {
  fill: var(--color-text-muted);
  font-size: 10px;
}

.party-crown-chart__line {
  fill: none;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.party-crown-chart__dot {
  stroke: rgba(255, 255, 255, 0.85);
  stroke-width: 1;
}

.party-crown-chart__avatars {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.party-crown-chart__avatar {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 3px solid;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 2px 0 rgba(92, 77, 130, 0.14);
  transform: translate(-50%, -50%);
}

.party-crown-chart__legend {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-xs);
  list-style: none;
  margin: 0;
  padding: 0;
}

.party-crown-chart__legend-item {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  min-width: 0;
}

.party-crown-chart__legend-dot {
  flex-shrink: 0;
  width: var(--space-sm);
  height: var(--space-sm);
  border-radius: 50%;
}

.party-crown-chart__legend-name {
  overflow: hidden;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
