<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';

import { partyAudio } from '@/common/audio/party-audio';
import { getBumpCornerSpawn } from '@/common/arena/bump-physics';
import AnimalModelPreview from '@/components/animal-model-preview.vue';
import CuteCrownIcon from '@/components/cute-crown-icon.vue';
import { partyCopy } from '@/locales/zh-TW/party';
import type { ArenaBumpSnapshot } from '@/minigames/arena-bump/arena-bump';
import ArenaBumpScene from '@/minigames/arena-bump/arena-bump-scene.vue';
import { arenaBumpCopy } from '@/minigames/arena-bump/locales/zh-TW';
import { sortParticipantsByCrown } from '@/party/scoring/crown';
import { usePartyStore } from '@/stores/party-store';
import type { Participant } from '@/types/party';

const props = defineProps<{
  snapshot: ArenaBumpSnapshot;
  roundIndex: number;
}>();

const emit = defineEmits<{
  arena: [value: {
    x: number;
    y: number;
    jump: boolean;
    charge: boolean;
    defend: boolean;
    aimX?: number | null;
    aimZ?: number | null;
  }];
}>();

const partyStore = usePartyStore();

/** 一律用 KeyboardEvent.code，不受輸入法／大小寫影響 */
const heldCodes = new Set<string>();
let jumpQueued = false;
let chargeQueued = false;
let chargeAim: { x: number; z: number } | null = null;
let pumpRafId = 0;
let lastHeardHitSerial = 0;

watch(
  () => props.snapshot.hitSerial,
  (serial) => {
    if (!serial || serial === lastHeardHitSerial || props.snapshot.hits.length === 0) {
      return;
    }

    lastHeardHitSerial = serial;
    const hasChargeHit = props.snapshot.hits.some((hit) => hit.kind === 'charge');
    partyAudio.playSfx(hasChargeHit ? 'impactHeavy' : 'impact');
  },
);

const STEER_CODES = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

const localParticipantId = computed(() => partyStore.localParticipantId);

const roundLabel = computed(() =>
  partyCopy.roundLabel.replace('{round}', String(props.roundIndex)),
);

/** 瑪利歐派對風：座位固定 1P–4P，皇冠領先者另外標 */
const hudPlayers = computed(() => {
  const ranked = sortParticipantsByCrown(partyStore.participants);
  const leaderId =
    ranked[0] && ranked[0].crownCount > 0
      ? ranked[0].id
      : null;
  const aliveById = new Map(
    props.snapshot.fighters.map((fighter) => [fighter.id, fighter.alive]),
  );

  return partyStore.participants.map((participant, index) => ({
    participant,
    slot: index + 1,
    isLeader: participant.id === leaderId,
    isAlive: aliveById.get(participant.id) ?? true,
  }));
});

const isTimerUrgent = computed(
  () => props.snapshot.phase === 'playing' && props.snapshot.secondsLeft <= 10,
);

const chargeSkillLabel = computed(() => {
  if (props.snapshot.localChargeReady) {
    return arenaBumpCopy.skillChargeLabel;
  }

  if (props.snapshot.localChargeCooldownSeconds > 0) {
    return arenaBumpCopy.skillChargeCooldownSeconds.replace(
      '{seconds}',
      props.snapshot.localChargeCooldownSeconds.toFixed(2),
    );
  }

  return arenaBumpCopy.skillChargeCooldownShort;
});

const isCountdown = computed(() => props.snapshot.phase === 'countdown');

const showCountdownOverlay = computed(
  () => isCountdown.value || props.snapshot.showCountdownGo,
);

const countdownDisplay = computed(() => {
  if (props.snapshot.showCountdownGo) {
    return arenaBumpCopy.countdownGo;
  }

  return String(props.snapshot.countdownSecondsLeft);
});

const showStatusChip = computed(() => {
  if (showCrownCeremony.value || showCountdownOverlay.value) {
    return false;
  }

  return !props.snapshot.localAlive;
});

const statusLabel = computed(() => {
  if (!props.snapshot.localAlive) {
    return arenaBumpCopy.youFell;
  }

  return arenaBumpCopy.name;
});

const showCrownCeremony = computed(() => props.snapshot.isCrownCeremony);

const crownCeremonyMessage = computed((): string => {
  const winnerId = props.snapshot.crownWinnerIds[0] ?? props.snapshot.winnerId;

  if (!winnerId) {
    return arenaBumpCopy.crownCeremonyTitle;
  }

  const name = partyStore.participants.find((participant) => participant.id === winnerId)
    ?.displayName
    ?? winnerId;

  return arenaBumpCopy.crownCeremonyWinner.replace('{name}', name);
});

const winnerBannerText = computed(() => {
  // 頒冠時改走典禮文案，避免中場再蓋一層「最後倖存」
  if (showCrownCeremony.value) {
    return '';
  }

  const winnerId = props.snapshot.winnerId;

  if (!winnerId || props.snapshot.phase !== 'playing') {
    return '';
  }

  const name = partyStore.participants.find((participant) => participant.id === winnerId)
    ?.displayName
    ?? winnerId;

  return arenaBumpCopy.winnerNamed.replace('{name}', name);
});

function playerSlotLabel(slot: number): string {
  return arenaBumpCopy.playerSlotLabel.replace('{slot}', String(slot));
}

function hudCardClass(color: Participant['color']): string {
  return `arena-hud__card--${color}`;
}

/** 依鎖定鏡頭（本機開局面向）把螢幕前後左右轉成世界 xz */
function readSteer(): { x: number; y: number } {
  let screenX = 0;
  let screenY = 0;

  if (heldCodes.has('KeyA') || heldCodes.has('ArrowLeft')) {
    screenX -= 1;
  }

  if (heldCodes.has('KeyD') || heldCodes.has('ArrowRight')) {
    screenX += 1;
  }

  if (heldCodes.has('KeyW') || heldCodes.has('ArrowUp')) {
    screenY += 1;
  }

  if (heldCodes.has('KeyS') || heldCodes.has('ArrowDown')) {
    screenY -= 1;
  }

  if (screenX === 0 && screenY === 0) {
    return { x: 0, y: 0 };
  }

  const localId = partyStore.localParticipantId;
  const spawnIndex = partyStore.participants.findIndex((participant) => participant.id === localId);
  const spawn = getBumpCornerSpawn(
    spawnIndex >= 0 ? spawnIndex : 0,
    Math.max(partyStore.participants.length, 1),
  );
  // W：朝開局面向（進畫面深處）；D：螢幕右側
  const forwardX = spawn.facingX;
  const forwardZ = spawn.facingZ;
  const rightX = spawn.facingZ;
  const rightZ = -spawn.facingX;

  let x = screenX * rightX + screenY * forwardX;
  let y = screenX * rightZ + screenY * forwardZ;
  const mag = Math.hypot(x, y);

  if (mag > 1) {
    x /= mag;
    y /= mag;
  }

  return { x, y };
}

function emitControl(
  jump: boolean,
  charge: boolean,
  aim: { x: number; z: number } | null,
): void {
  if (!props.snapshot.localAlive || props.snapshot.phase !== 'playing') {
    emit('arena', {
      x: 0,
      y: 0,
      jump: false,
      charge: false,
      defend: false,
      aimX: null,
      aimZ: null,
    });
    return;
  }

  const steer = readSteer();
  emit('arena', {
    x: steer.x,
    y: steer.y,
    jump,
    charge,
    defend: false,
    aimX: charge ? aim?.x ?? null : null,
    aimZ: charge ? aim?.z ?? null : null,
  });
}

function pumpControls(): void {
  const shouldJump = jumpQueued;
  const shouldCharge = chargeQueued;
  const aim = chargeAim;
  jumpQueued = false;
  chargeQueued = false;
  chargeAim = null;
  emitControl(shouldJump, shouldCharge, aim);
  pumpRafId = window.requestAnimationFrame(pumpControls);
}

function onStageClick(point: { x: number; z: number }): void {
  if (
    !props.snapshot.localAlive
    || props.snapshot.phase !== 'playing'
    || !props.snapshot.localChargeReady
  ) {
    return;
  }

  chargeQueued = true;
  chargeAim = point;
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.repeat) {
    return;
  }

  const { code } = event;

  if (code === 'Space') {
    event.preventDefault();

    if (props.snapshot.localAlive) {
      jumpQueued = true;
    }

    return;
  }

  if (!STEER_CODES.has(code)) {
    return;
  }

  event.preventDefault();
  heldCodes.add(code);
}

function onKeyUp(event: KeyboardEvent): void {
  const { code } = event;

  if (!STEER_CODES.has(code)) {
    return;
  }

  heldCodes.delete(code);
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  pumpRafId = window.requestAnimationFrame(pumpControls);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.cancelAnimationFrame(pumpRafId);
  chargeAim = null;
  emit('arena', {
    x: 0,
    y: 0,
    jump: false,
    charge: false,
    defend: false,
    aimX: null,
    aimZ: null,
  });
});
</script>

<template>
  <Teleport to="body">
    <section
      class="arena-bump-play"
      :class="{ 'arena-bump-play--crown-ceremony': showCrownCeremony }"
    >
      <ArenaBumpScene
        :snapshot="snapshot"
        @stage-click="onStageClick"
      />

      <!-- 瑪利歐派對風右上記分板 -->
      <aside
        v-if="!showCrownCeremony"
        class="arena-hud game-chrome"
        :aria-label="arenaBumpCopy.scoreboardTitle"
      >
        <div class="arena-hud__round font-game">{{ roundLabel }}</div>

        <ul class="arena-hud__list">
          <li
            v-for="row in hudPlayers"
            :key="row.participant.id"
            class="arena-hud__card"
            :class="[
              hudCardClass(row.participant.color),
              {
                'arena-hud__card--leader': row.isLeader,
                'arena-hud__card--local': row.participant.id === localParticipantId,
                'arena-hud__card--fallen': !row.isAlive,
              },
            ]"
          >
            <div class="arena-hud__portrait-wrap">
              <div class="arena-hud__portrait">
                <AnimalModelPreview
                  compact
                  :animal-id="row.participant.animalId"
                  :player-color="row.participant.color"
                />
              </div>
              <span
                v-if="!row.isAlive"
                class="arena-hud__fallen-stamp font-game"
              >{{ arenaBumpCopy.resultFallen }}</span>
              <span class="arena-hud__slot font-game">{{ playerSlotLabel(row.slot) }}</span>
            </div>

            <div class="arena-hud__body">
              <span class="arena-hud__name">
                {{ row.participant.displayName }}
                <span
                  v-if="row.participant.id === localParticipantId"
                  class="arena-hud__you font-game"
                >{{ arenaBumpCopy.localPlayerTag }}</span>
              </span>
            </div>

            <div class="arena-hud__crowns">
              <CuteCrownIcon
                size="md"
                :bounce="row.isLeader"
              />
              <span class="arena-hud__crown-count font-game">{{ row.participant.crownCount }}</span>
            </div>
          </li>
        </ul>

        <div
          v-if="snapshot.phase === 'playing'"
          class="arena-hud__timer"
          :class="{ 'arena-hud__timer--urgent': isTimerUrgent }"
        >
          <span class="arena-hud__timer-label font-game">
            {{ arenaBumpCopy.timerAliveLabel }} {{ snapshot.aliveCount }}
          </span>
          <span class="arena-hud__timer-value font-game">{{ snapshot.secondsLeft }}</span>
        </div>
      </aside>

      <div
        v-if="showCountdownOverlay"
        class="arena-bump-play__countdown game-chrome"
        aria-live="assertive"
      >
        <p
          v-if="isCountdown"
          class="arena-bump-play__countdown-label font-game"
        >
          {{ arenaBumpCopy.countdownLabel }}
        </p>
        <p
          :key="countdownDisplay"
          class="arena-bump-play__countdown-value font-game"
          :class="{
            'arena-bump-play__countdown-value--go': snapshot.showCountdownGo,
            'arena-bump-play__countdown-value--urgent': isCountdown && snapshot.countdownSecondsLeft <= 2,
          }"
        >
          {{ countdownDisplay }}
        </p>
      </div>

      <p
        v-if="showStatusChip"
        class="arena-bump-play__status font-game game-chrome"
        :class="{
          'arena-bump-play__status--fell': !snapshot.localAlive,
        }"
      >
        {{ statusLabel }}
      </p>

      <div
        v-if="snapshot.localAlive && !showCrownCeremony && !showCountdownOverlay"
        class="arena-bump-play__skills game-chrome"
      >
        <div class="arena-bump-play__skill arena-bump-play__skill--jump">
          <span class="arena-bump-play__skill-key font-game">{{ arenaBumpCopy.skillJumpKey }}</span>
          <span class="arena-bump-play__skill-label font-game">{{ arenaBumpCopy.skillJumpLabel }}</span>
        </div>
        <div
          class="arena-bump-play__skill arena-bump-play__skill--charge"
          :class="{
            'arena-bump-play__skill--ready': snapshot.localChargeReady,
            'arena-bump-play__skill--cooling': !snapshot.localChargeReady,
          }"
        >
          <span class="arena-bump-play__skill-key font-game">{{ arenaBumpCopy.skillChargeKey }}</span>
          <span
            class="arena-bump-play__skill-label font-game"
            :class="{ 'arena-bump-play__skill-label--countdown': snapshot.localChargeCooldownSeconds > 0 }"
          >
            {{ chargeSkillLabel }}
          </span>
        </div>
      </div>

      <p
        v-if="snapshot.localAlive && !showCrownCeremony && !showCountdownOverlay"
        class="arena-bump-play__hint font-game game-chrome"
      >
        {{ arenaBumpCopy.hintMove }}
      </p>
      <p
        v-else-if="!showCrownCeremony && !snapshot.winnerId && !showCountdownOverlay"
        class="arena-bump-play__hint arena-bump-play__hint--spectate font-game game-chrome"
      >
        {{ arenaBumpCopy.spectateHint }}
      </p>

      <div
        v-if="showCrownCeremony"
        class="crown-ceremony game-chrome"
        aria-live="polite"
      >
        <div
          class="crown-ceremony__burst"
          aria-hidden="true"
        />
        <p class="crown-ceremony__kicker font-game text-title">
          {{ arenaBumpCopy.crownCeremonyTitle }}
        </p>
        <p class="crown-ceremony__message font-game text-title">
          {{ crownCeremonyMessage }}
        </p>
      </div>

      <div
        v-else-if="winnerBannerText"
        class="arena-bump-play__winner font-game game-chrome"
        aria-live="polite"
      >
        <span class="arena-bump-play__winner-kicker">{{ arenaBumpCopy.winnerBanner }}</span>
        <span class="arena-bump-play__winner-name">{{ winnerBannerText }}</span>
      </div>
    </section>
  </Teleport>
</template>

<style lang="scss" scoped>
.arena-bump-play {
  position: fixed;
  inset: 0;
  z-index: 200;
  overflow: hidden;
  /* 3D 天空露出色（與場景一致，非 UI token） */
  background: #7ec8f0;

  &--crown-ceremony {
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-text-heading) 88%, black) 0%,
      color-mix(in srgb, var(--color-text-heading) 96%, black) 100%
    );
  }
}

.crown-ceremony {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-sm);
  padding-top: calc(var(--space-xl) + env(safe-area-inset-top));
  pointer-events: none;
  animation: crown-ceremony-fade 0.45s ease backwards;
}

.crown-ceremony__burst {
  position: absolute;
  top: calc(var(--space-lg) + env(safe-area-inset-top));
  width: min(20rem, 78vw);
  height: min(20rem, 78vw);
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--color-warning) 55%, transparent) 0%,
    color-mix(in srgb, var(--color-warning) 18%, transparent) 42%,
    transparent 72%
  );
  animation: crown-ceremony-burst 1.1s ease-in-out infinite;
}

.crown-ceremony__kicker {
  position: relative;
  margin: 0;
  padding: var(--space-xs) var(--space-md);
  border: 3px solid var(--color-on-accent);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-surface-solid) 92%, white);
  box-shadow: 3px 3px 0 color-mix(in srgb, var(--color-text-heading) 35%, transparent);
  font-size: var(--font-size-lg);
  letter-spacing: 0.14em;
  color: var(--color-text-heading);
  animation: crown-ceremony-pop 0.55s cubic-bezier(0.22, 1.08, 0.36, 1) backwards;
}

.crown-ceremony__message {
  position: relative;
  margin: 0;
  padding: 0 var(--space-md);
  font-size: clamp(var(--font-size-2xl), 7vw, var(--font-size-3xl));
  line-height: var(--line-height-tight);
  text-align: center;
  color: var(--color-warning);
  text-shadow:
    3px 3px 0 color-mix(in srgb, var(--color-text-heading) 55%, black),
    -2px -2px 0 color-mix(in srgb, var(--color-text-heading) 40%, black),
    2px -2px 0 color-mix(in srgb, var(--color-text-heading) 40%, black),
    -2px 2px 0 color-mix(in srgb, var(--color-text-heading) 40%, black);
  animation: crown-ceremony-pop 0.62s cubic-bezier(0.22, 1.08, 0.36, 1) 0.08s backwards;
}

@keyframes crown-ceremony-fade {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes crown-ceremony-pop {
  from {
    opacity: 0;
    transform: translateY(var(--space-md)) scale(0.82);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes crown-ceremony-burst {
  0%,
  100% {
    opacity: 0.72;
    transform: scale(0.96);
  }

  50% {
    opacity: 1;
    transform: scale(1.06);
  }
}

.arena-bump-play :deep(.arena-bump-scene) {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  outline: none;
  touch-action: none;
}

.arena-hud {
  position: absolute;
  top: calc(var(--space-md) + env(safe-area-inset-top));
  right: calc(var(--space-md) + env(safe-area-inset-right));
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-sm);
  width: min(14.5rem, 52vw);
  pointer-events: none;
}

.arena-hud__round {
  align-self: flex-end;
  padding: var(--space-xs) var(--space-sm);
  border: 3px solid color-mix(in srgb, var(--color-border) 55%, white);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-surface-solid) 96%, white);
  font-size: var(--font-size-xs);
  letter-spacing: 0.06em;
  color: var(--color-text-heading);
  box-shadow: 3px 3px 0 color-mix(in srgb, var(--color-text-heading) 22%, transparent);
}

.arena-hud__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.arena-hud__card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm) var(--space-xs) var(--space-xs);
  border: 4px solid var(--hud-tone);
  border-radius: var(--radius-md);
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--hud-tone) 42%, white) 0%,
    color-mix(in srgb, var(--color-surface-solid) 80%, white) 52%,
    white 100%
  );
  box-shadow: 4px 4px 0 color-mix(in srgb, var(--hud-tone) 48%, transparent);

  &--player-1 {
    --hud-tone: var(--color-player-1);
  }

  &--player-2 {
    --hud-tone: var(--color-player-2);
  }

  &--player-3 {
    --hud-tone: var(--color-player-3);
  }

  &--player-4 {
    --hud-tone: var(--color-player-4);
  }

  &--leader {
    animation: arena-hud-leader-pulse 1.2s ease-in-out infinite;
  }

  &--local {
    outline: 3px solid color-mix(in srgb, var(--color-accent) 70%, white);
    outline-offset: 2px;
  }

  &--fallen {
    opacity: 0.72;
    filter: grayscale(0.55);
  }
}

@keyframes arena-hud-leader-pulse {
  0%,
  100% {
    box-shadow:
      4px 4px 0 color-mix(in srgb, var(--hud-tone) 48%, transparent),
      0 0 0 2px color-mix(in srgb, var(--color-warning) 55%, white);
  }

  50% {
    box-shadow:
      4px 4px 0 color-mix(in srgb, var(--hud-tone) 48%, transparent),
      0 0 0 4px color-mix(in srgb, var(--color-warning) 80%, white);
  }
}

.arena-hud__portrait-wrap {
  position: relative;
  width: 3.75rem;
  height: 3.75rem;
  flex-shrink: 0;
}

.arena-hud__portrait {
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 3px solid color-mix(in srgb, var(--hud-tone) 55%, white);
  border-radius: 50%;
  background: color-mix(in srgb, var(--hud-tone) 14%, white);
  box-shadow:
    inset 0 0 0 2px color-mix(in srgb, white 70%, transparent),
    2px 2px 0 color-mix(in srgb, var(--hud-tone) 28%, transparent);

  :deep(.animal-preview__canvas) {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: transparent;
  }
}

.arena-hud__fallen-stamp {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--color-text-heading) 42%, transparent);
  color: var(--color-on-accent);
  font-size: var(--font-size-xs);
  letter-spacing: 0.08em;
  text-shadow: 1px 1px 0 color-mix(in srgb, var(--color-text-heading) 50%, black);
  transform: rotate(-18deg);
  pointer-events: none;
}

.arena-hud__slot {
  position: absolute;
  left: 0;
  bottom: 0;
  z-index: 3;
  display: grid;
  place-items: center;
  min-width: 1.4rem;
  padding: 0 var(--space-xs);
  border: 2px solid var(--color-on-accent);
  border-radius: var(--radius-sm);
  background: var(--hud-tone);
  font-size: var(--font-size-xs);
  line-height: 1.15;
  color: var(--color-on-accent);
  box-shadow: 2px 2px 0 color-mix(in srgb, var(--hud-tone) 45%, transparent);
  transform: translate(-18%, 18%);
}

.arena-hud__body {
  min-width: 0;
}

.arena-hud__name {
  display: block;
  overflow: hidden;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.arena-hud__you {
  margin-left: var(--space-xs);
  padding: 0 var(--space-xs);
  border: 2px solid color-mix(in srgb, var(--color-accent) 55%, white);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-accent) 28%, white);
  font-size: var(--font-size-xs);
  letter-spacing: 0.04em;
  color: var(--color-on-accent);
  vertical-align: middle;
  text-shadow: 1px 1px 0 color-mix(in srgb, var(--color-accent-hover) 55%, transparent);
}

.arena-hud__crowns {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  min-width: 2.25rem;
}

.arena-hud__crown-count {
  font-size: var(--font-size-2xl);
  line-height: 1;
  color: var(--color-text-heading);
  text-shadow: 2px 2px 0 color-mix(in srgb, var(--color-warning) 45%, white);
}

.arena-hud__timer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  border: 4px solid color-mix(in srgb, var(--color-accent) 55%, white);
  border-radius: var(--radius-lg);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--color-accent) 28%, white) 0%,
    color-mix(in srgb, var(--color-surface-solid) 92%, white) 100%
  );
  box-shadow: 4px 4px 0 color-mix(in srgb, var(--color-accent) 40%, transparent);

  &--urgent {
    border-color: color-mix(in srgb, var(--color-warning) 70%, white);
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-warning) 48%, white) 0%,
      color-mix(in srgb, var(--color-surface-solid) 90%, white) 100%
    );
    box-shadow: 4px 4px 0 color-mix(in srgb, var(--color-warning) 45%, transparent);
    animation: arena-timer-shake 0.55s ease-in-out infinite;
  }
}

.arena-hud__timer-label {
  font-size: var(--font-size-xs);
  letter-spacing: 0.08em;
  color: var(--color-text-heading);
}

.arena-hud__timer-value {
  font-size: var(--font-size-3xl);
  line-height: 1;
  color: var(--color-text-heading);
  text-shadow: 2px 2px 0 color-mix(in srgb, var(--color-accent) 35%, white);
  padding-top: 0.08em;

  .arena-hud__timer--urgent & {
    color: color-mix(in srgb, var(--color-warning) 35%, var(--color-text-heading));
    text-shadow: 2px 2px 0 color-mix(in srgb, var(--color-warning) 50%, white);
    animation: arena-timer-pulse 0.55s ease-in-out infinite;
  }
}

@keyframes arena-timer-pulse {
  0%,
  100% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.12);
  }
}

@keyframes arena-timer-shake {
  0%,
  100% {
    transform: rotate(-0.6deg);
  }

  50% {
    transform: rotate(0.6deg);
  }
}

.arena-bump-play__countdown {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  background: color-mix(in srgb, var(--color-text-heading) 18%, transparent);
  pointer-events: none;
}

.arena-bump-play__countdown-label {
  margin: 0;
  padding: var(--space-xs) var(--space-lg);
  border: 3px solid var(--color-on-accent);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-surface-solid) 96%, white);
  box-shadow: 4px 4px 0 color-mix(in srgb, var(--color-text-heading) 28%, transparent);
  color: var(--color-text-heading);
  font-size: var(--font-size-xl);
  line-height: 1;
  letter-spacing: 0.12em;
}

.arena-bump-play__countdown-value {
  margin: 0;
  min-width: 5.5rem;
  padding: var(--space-lg) var(--space-xl);
  border: 5px solid var(--color-on-accent);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-accent) 78%, black);
  box-shadow: 0 var(--space-md) 0 color-mix(in srgb, var(--color-text-heading) 35%, transparent);
  color: var(--color-on-accent);
  font-size: var(--font-size-3xl);
  line-height: 1;
  text-align: center;
  text-shadow:
    4px 4px 0 color-mix(in srgb, var(--color-text-heading) 55%, black),
    -2px -2px 0 color-mix(in srgb, var(--color-text-heading) 35%, black);
  animation: arena-countdown-pop 0.42s cubic-bezier(0.22, 1.35, 0.36, 1);

  &--urgent {
    background: color-mix(in srgb, var(--color-warning) 82%, white);
    color: var(--color-text-heading);
    text-shadow: 3px 3px 0 color-mix(in srgb, var(--color-warning) 40%, black);
  }

  &--go {
    min-width: 10rem;
    background: color-mix(in srgb, var(--color-success) 78%, white);
    color: var(--color-text-heading);
    font-size: clamp(var(--font-size-2xl), 10vw, var(--font-size-3xl));
    text-shadow: 3px 3px 0 color-mix(in srgb, var(--color-success) 40%, black);
    animation: arena-countdown-go 0.48s cubic-bezier(0.22, 1.45, 0.36, 1);
  }
}

@keyframes arena-countdown-pop {
  0% {
    transform: scale(1.55);
    opacity: 0.2;
  }

  70% {
    transform: scale(0.92);
    opacity: 1;
  }

  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes arena-countdown-go {
  0% {
    transform: scaleX(1.45) scaleY(0.72);
    opacity: 0.25;
  }

  65% {
    transform: scaleX(0.94) scaleY(1.08);
    opacity: 1;
  }

  100% {
    transform: scaleX(1) scaleY(1);
    opacity: 1;
  }
}

.arena-bump-play__status {
  position: absolute;
  top: calc(var(--space-md) + env(safe-area-inset-top));
  left: calc(var(--space-md) + env(safe-area-inset-left));
  z-index: 3;
  max-width: min(42vw, 11rem);
  margin: 0;
  padding: var(--space-sm) var(--space-md);
  border: 3px solid var(--color-on-accent);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-surface-solid) 96%, white);
  box-shadow: 3px 3px 0 color-mix(in srgb, var(--color-text-heading) 22%, transparent);
  color: var(--color-text-heading);
  font-size: clamp(var(--font-size-sm), 3.6vw, var(--font-size-lg));
  line-height: 1;
  letter-spacing: 0.04em;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;

  &--fell {
    border-color: color-mix(in srgb, var(--color-accent) 50%, white);
    background: color-mix(in srgb, var(--color-accent) 78%, black);
    color: var(--color-on-accent);
    box-shadow: 3px 3px 0 color-mix(in srgb, var(--color-accent) 40%, transparent);
  }
}

.arena-bump-play__skills {
  position: absolute;
  bottom: calc(var(--space-xl) + var(--space-lg) + env(safe-area-inset-bottom));
  left: 50%;
  z-index: 3;
  display: flex;
  gap: var(--space-md);
  transform: translateX(-50%);
  pointer-events: none;
}

.arena-bump-play__skill {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  min-width: 4.5rem;
  padding: var(--space-sm) var(--space-md);
  border: 3px solid color-mix(in srgb, var(--color-player-3) 55%, white);
  border-radius: var(--radius-md);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--color-player-3) 28%, white) 0%,
    color-mix(in srgb, var(--color-surface-solid) 94%, white) 100%
  );
  box-shadow: 3px 3px 0 color-mix(in srgb, var(--color-player-3) 40%, transparent);
  color: var(--color-text-heading);

  &--jump {
    border-color: color-mix(in srgb, var(--color-player-4) 55%, white);
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-player-4) 30%, white) 0%,
      color-mix(in srgb, var(--color-surface-solid) 94%, white) 100%
    );
    box-shadow: 3px 3px 0 color-mix(in srgb, var(--color-player-4) 40%, transparent);
  }

  &--charge.arena-bump-play__skill--ready {
    border-color: color-mix(in srgb, var(--color-warning) 65%, white);
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--color-warning) 55%, white) 0%,
      color-mix(in srgb, var(--color-surface-solid) 90%, white) 100%
    );
    box-shadow: 3px 3px 0 color-mix(in srgb, var(--color-warning) 48%, transparent);
    animation: arena-skill-ready 0.9s ease-in-out infinite;
  }

  &--charge.arena-bump-play__skill--cooling {
    border-color: color-mix(in srgb, var(--color-text-muted) 45%, white);
    background: color-mix(in srgb, var(--color-surface-solid) 88%, var(--color-text-muted));
    box-shadow: 3px 3px 0 color-mix(in srgb, var(--color-text-muted) 30%, transparent);
    opacity: 0.78;
  }
}

.arena-bump-play__skill-key {
  padding: var(--space-xs) var(--space-sm);
  border: 2px solid color-mix(in srgb, var(--color-text-heading) 22%, white);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-surface-solid) 96%, white);
  font-size: var(--font-size-sm);
  line-height: 1;
  letter-spacing: 0.04em;
  box-shadow: 0 2px 0 color-mix(in srgb, var(--color-text-heading) 18%, transparent);
}

.arena-bump-play__skill-label {
  font-size: var(--font-size-sm);
  line-height: 1;
  letter-spacing: 0.06em;

  &--countdown {
    font-size: var(--font-size-lg);
    letter-spacing: 0.04em;
    color: var(--color-text-muted);
  }
}

@keyframes arena-skill-ready {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }

  50% {
    transform: translateY(calc(var(--space-xs) * -1)) scale(1.04);
  }
}

.arena-bump-play__winner {
  position: absolute;
  top: 42%;
  left: 50%;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  min-width: min(18rem, 78vw);
  padding: var(--space-lg) var(--space-xl);
  border: 4px solid var(--color-on-accent);
  border-radius: var(--radius-lg);
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--color-warning) 35%, white) 0%,
    color-mix(in srgb, var(--color-surface-solid) 96%, white) 55%,
    white 100%
  );
  box-shadow: 0 var(--space-md) 0 color-mix(in srgb, var(--color-text-heading) 28%, transparent);
  transform: translate(-50%, -50%);
  pointer-events: none;
  animation: arena-bump-winner-in 0.48s cubic-bezier(0.22, 1.35, 0.36, 1);
}

.arena-bump-play__winner-kicker {
  padding: var(--space-xs) var(--space-md);
  border: 2px solid color-mix(in srgb, var(--color-warning) 55%, white);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-warning) 28%, white);
  color: var(--color-text-heading);
  font-size: var(--font-size-md);
  letter-spacing: 0.12em;
}

.arena-bump-play__winner-name {
  color: var(--color-text-heading);
  font-size: clamp(var(--font-size-xl), 5.5vw, var(--font-size-2xl));
  text-align: center;
  text-shadow: 2px 2px 0 color-mix(in srgb, var(--color-warning) 40%, white);
}

@keyframes arena-bump-winner-in {
  from {
    opacity: 0;
    transform: translate(-50%, -32%) scale(0.84);
  }

  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

.arena-bump-play__hint {
  position: absolute;
  bottom: calc(var(--space-sm) + env(safe-area-inset-bottom));
  left: 50%;
  z-index: 3;
  max-width: min(92vw, 28rem);
  margin: 0;
  padding: var(--space-xs) var(--space-md);
  border: 3px solid color-mix(in srgb, var(--color-border) 50%, white);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-surface-solid) 94%, white);
  box-shadow: 3px 3px 0 color-mix(in srgb, var(--color-text-heading) 18%, transparent);
  color: var(--color-text-heading);
  font-size: var(--font-size-xs);
  line-height: 1.2;
  letter-spacing: 0.04em;
  text-align: center;
  transform: translateX(-50%);
  pointer-events: none;

  &--spectate {
    border-color: color-mix(in srgb, var(--color-accent) 45%, white);
    background: color-mix(in srgb, var(--color-accent) 22%, white);
    box-shadow: 3px 3px 0 color-mix(in srgb, var(--color-accent) 30%, transparent);
    font-size: var(--font-size-sm);
  }
}
</style>
