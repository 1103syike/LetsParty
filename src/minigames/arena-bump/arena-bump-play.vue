<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

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
  }];
}>();

const partyStore = usePartyStore();

/** 一律用 KeyboardEvent.code，不受輸入法／大小寫影響 */
const heldCodes = new Set<string>();
const defendHeld = ref(false);
let jumpQueued = false;
let chargeQueued = false;
let pumpRafId = 0;

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

const showStatusChip = computed(() => {
  if (showCrownCeremony.value) {
    return false;
  }

  return props.snapshot.isSpawnGrace
    || !props.snapshot.localAlive
    || props.snapshot.localDefending;
});

const statusLabel = computed(() => {
  if (props.snapshot.isSpawnGrace) {
    return arenaBumpCopy.graceHint;
  }

  if (!props.snapshot.localAlive) {
    return arenaBumpCopy.youFell;
  }

  if (props.snapshot.localDefending) {
    return arenaBumpCopy.statusDefend;
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

function readSteer(): { x: number; y: number } {
  let x = 0;
  let y = 0;

  if (heldCodes.has('KeyA') || heldCodes.has('ArrowLeft')) {
    x -= 1;
  }

  if (heldCodes.has('KeyD') || heldCodes.has('ArrowRight')) {
    x += 1;
  }

  if (heldCodes.has('KeyW') || heldCodes.has('ArrowUp')) {
    y += 1;
  }

  if (heldCodes.has('KeyS') || heldCodes.has('ArrowDown')) {
    y -= 1;
  }

  const mag = Math.hypot(x, y);

  if (mag > 1) {
    x /= mag;
    y /= mag;
  }

  return { x, y };
}

function emitControl(jump: boolean, charge: boolean): void {
  if (!props.snapshot.localAlive || props.snapshot.phase !== 'playing') {
    emit('arena', {
      x: 0,
      y: 0,
      jump: false,
      charge: false,
      defend: false,
    });
    return;
  }

  const steer = readSteer();
  emit('arena', {
    x: steer.x,
    y: steer.y,
    jump,
    charge,
    defend: defendHeld.value,
  });
}

function pumpControls(): void {
  const shouldJump = jumpQueued;
  const shouldCharge = chargeQueued;
  jumpQueued = false;
  chargeQueued = false;
  emitControl(shouldJump, shouldCharge);
  pumpRafId = window.requestAnimationFrame(pumpControls);
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

  if (code === 'KeyX') {
    event.preventDefault();

    if (props.snapshot.localAlive && props.snapshot.localChargeReady) {
      chargeQueued = true;
    }

    return;
  }

  if (code === 'KeyZ') {
    event.preventDefault();
    defendHeld.value = true;
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

  if (code === 'KeyZ') {
    defendHeld.value = false;
    return;
  }

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
  emit('arena', {
    x: 0,
    y: 0,
    jump: false,
    charge: false,
    defend: false,
  });
});
</script>

<template>
  <Teleport to="body">
    <section
      class="arena-bump-play"
      :class="{ 'arena-bump-play--crown-ceremony': showCrownCeremony }"
    >
      <ArenaBumpScene :snapshot="snapshot" />

      <!-- 跟猜拳同一套右上記分板 -->
      <aside
        v-if="!showCrownCeremony"
        class="arena-hud"
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
              <span class="arena-hud__slot font-game">{{ playerSlotLabel(row.slot) }}</span>
            </div>

            <div class="arena-hud__body">
              <span class="arena-hud__name">
                {{ row.participant.displayName }}
                <span
                  v-if="row.participant.id === localParticipantId"
                  class="arena-hud__you"
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
          <span class="arena-hud__timer-label">
            {{ arenaBumpCopy.timerAliveLabel }} {{ snapshot.aliveCount }}
          </span>
          <span class="arena-hud__timer-value font-game">{{ snapshot.secondsLeft }}</span>
        </div>
      </aside>

      <p
        v-if="showStatusChip"
        class="arena-bump-play__status font-game"
        :class="{
          'arena-bump-play__status--grace': snapshot.isSpawnGrace,
          'arena-bump-play__status--fell': !snapshot.localAlive && !snapshot.isSpawnGrace,
          'arena-bump-play__status--defend': snapshot.localDefending,
        }"
      >
        {{ statusLabel }}
      </p>

      <div
        v-if="snapshot.localAlive && !showCrownCeremony"
        class="arena-bump-play__skills"
      >
        <span class="arena-bump-play__skill font-game">
          {{ arenaBumpCopy.skillJump }}
        </span>
        <span
          class="arena-bump-play__skill font-game"
          :class="{ 'arena-bump-play__skill--ready': snapshot.localChargeReady }"
        >
          {{ arenaBumpCopy.skillCharge }}
        </span>
        <span
          class="arena-bump-play__skill font-game"
          :class="{ 'arena-bump-play__skill--on': snapshot.localDefending }"
        >
          {{ arenaBumpCopy.skillDefend }}
        </span>
      </div>

      <p
        v-if="snapshot.localAlive && !showCrownCeremony"
        class="arena-bump-play__hint font-game"
      >
        {{ arenaBumpCopy.hintMove }}
      </p>
      <p
        v-else-if="!showCrownCeremony && !snapshot.winnerId"
        class="arena-bump-play__hint arena-bump-play__hint--spectate font-game"
      >
        {{ arenaBumpCopy.spectateHint }}
      </p>

      <div
        v-if="showCrownCeremony"
        class="crown-ceremony"
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
        class="arena-bump-play__winner font-game"
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
  background: #b8dce8;

  &--crown-ceremony {
    background: linear-gradient(180deg, rgba(88, 76, 118, 0.92), rgba(46, 38, 64, 0.96));
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
  width: min(18rem, 72vw);
  height: min(18rem, 72vw);
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--color-warning) 42%, transparent) 0%,
    color-mix(in srgb, var(--color-warning) 12%, transparent) 42%,
    transparent 72%
  );
  animation: crown-ceremony-burst 1.1s ease-in-out infinite;
}

.crown-ceremony__kicker {
  position: relative;
  margin: 0;
  font-size: var(--font-size-lg);
  letter-spacing: 0.12em;
  color: #f5f0e8;
  animation: crown-ceremony-pop 0.55s cubic-bezier(0.22, 1.08, 0.36, 1) backwards;
}

.crown-ceremony__message {
  position: relative;
  margin: 0;
  padding: 0 var(--space-md);
  font-size: var(--font-size-2xl);
  line-height: var(--line-height-tight);
  text-align: center;
  color: var(--color-warning);
  text-shadow: 0 var(--space-xs) 0 rgba(26, 21, 36, 0.35);
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
    transform: translateY(var(--space-md)) scale(0.88);
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
    transform: scale(1.04);
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

/* 瑪利歐派對風：大頭像 + 右對齊皇冠（對齊猜拳 rps-hud） */
.arena-hud {
  position: absolute;
  top: calc(var(--space-md) + env(safe-area-inset-top));
  right: calc(var(--space-md) + env(safe-area-inset-right));
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-xs);
  width: min(13.5rem, 48vw);
  pointer-events: none;
}

.arena-hud__round {
  align-self: flex-end;
  padding: var(--space-xs) var(--space-sm);
  border: 2px solid color-mix(in srgb, var(--color-border) 70%, white);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-surface) 94%, white);
  font-size: var(--font-size-xs);
  letter-spacing: 0.04em;
  color: var(--color-text);
  box-shadow: 2px 2px 0 color-mix(in srgb, var(--color-border) 40%, transparent);
}

.arena-hud__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
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
  border: 3px solid var(--hud-tone);
  border-radius: var(--radius-md);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--hud-tone) 34%, white) 0%,
    color-mix(in srgb, var(--color-surface) 70%, white) 55%,
    white 100%
  );
  box-shadow: 3px 3px 0 color-mix(in srgb, var(--hud-tone) 42%, transparent);

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
    box-shadow:
      3px 3px 0 color-mix(in srgb, var(--hud-tone) 42%, transparent),
      0 0 0 2px color-mix(in srgb, var(--color-warning) 60%, white);
  }

  &--local {
    outline: 2px solid color-mix(in srgb, var(--color-accent) 60%, white);
    outline-offset: 1px;
  }

  &--fallen {
    opacity: 0.48;
    filter: grayscale(0.35);
  }
}

.arena-hud__portrait-wrap {
  position: relative;
  width: 3.5rem;
  height: 3.5rem;
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

.arena-hud__slot {
  position: absolute;
  left: 0;
  bottom: 0;
  z-index: 1;
  display: grid;
  place-items: center;
  min-width: 1.35rem;
  padding: 0 var(--space-xs);
  border: 2px solid var(--color-on-accent);
  border-radius: var(--radius-sm);
  background: var(--hud-tone);
  font-size: var(--font-size-xs);
  line-height: 1.15;
  color: var(--color-on-accent);
  box-shadow: 1px 1px 0 color-mix(in srgb, var(--hud-tone) 45%, transparent);
  transform: translate(-20%, 20%);
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
  margin-left: 2px;
  padding: 0 var(--space-xs);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-accent) 18%, transparent);
  font-size: var(--font-size-xs);
  color: var(--color-accent);
  vertical-align: middle;
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
  text-shadow: 1px 1px 0 color-mix(in srgb, var(--color-warning) 40%, white);
}

.arena-hud__timer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  min-height: 2.5rem;
  padding: 0 var(--space-sm);
  border: 3px solid color-mix(in srgb, var(--color-accent) 40%, white);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-accent) 12%, white);

  &--urgent {
    border-color: color-mix(in srgb, var(--color-accent) 70%, white);
    background: color-mix(in srgb, var(--color-accent) 22%, white);
  }
}

.arena-hud__timer-label {
  font-size: var(--font-size-xs);
  color: var(--color-text-heading);
}

.arena-hud__timer-value {
  font-size: var(--font-size-xl);
  line-height: 1;
  color: var(--color-text-heading);
}

.arena-bump-play__status {
  position: absolute;
  top: calc(var(--space-md) + env(safe-area-inset-top));
  left: calc(var(--space-md) + env(safe-area-inset-left));
  z-index: 3;
  max-width: min(40vw, 10rem);
  margin: 0;
  padding: var(--space-sm) var(--space-md);
  border: 3px solid rgba(255, 255, 255, 0.92);
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 3px 3px 0 rgba(92, 77, 130, 0.12);
  color: var(--color-text-heading);
  font-size: clamp(var(--font-size-sm), 3.6vw, var(--font-size-lg));
  line-height: 1;
  letter-spacing: 0.04em;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;

  &--grace {
    border-color: color-mix(in srgb, var(--color-success) 45%, white);
    background: color-mix(in srgb, var(--color-success) 18%, white);
  }

  &--fell {
    border-color: color-mix(in srgb, var(--color-accent) 40%, white);
    background: color-mix(in srgb, var(--color-accent) 78%, black);
    color: var(--color-on-accent);
  }

  &--defend {
    border-color: color-mix(in srgb, var(--color-player-3) 50%, white);
    background: color-mix(in srgb, var(--color-player-3) 22%, white);
  }
}

.arena-bump-play__skills {
  position: absolute;
  top: calc(var(--space-xl) + var(--space-lg) + env(safe-area-inset-top));
  left: 50%;
  z-index: 3;
  display: flex;
  gap: var(--space-sm);
  transform: translateX(-50%);
  pointer-events: none;
}

.arena-bump-play__skill {
  padding: var(--space-xs) var(--space-sm);
  border: 2px solid rgba(255, 255, 255, 0.85);
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.72);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  line-height: 1;
  opacity: 0.72;

  &--ready {
    border-color: color-mix(in srgb, var(--color-warning) 55%, white);
    background: color-mix(in srgb, var(--color-warning) 22%, white);
    color: var(--color-text-heading);
    opacity: 1;
  }

  &--on {
    border-color: color-mix(in srgb, var(--color-player-3) 55%, white);
    background: color-mix(in srgb, var(--color-player-3) 24%, white);
    color: var(--color-text-heading);
    opacity: 1;
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
  gap: var(--space-xs);
  padding: var(--space-md) var(--space-lg);
  border: 3px solid rgba(255, 255, 255, 0.95);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 6px 0 rgba(92, 77, 130, 0.14);
  transform: translate(-50%, -50%);
  pointer-events: none;
  animation: arena-bump-winner-in 0.4s cubic-bezier(0.22, 1.12, 0.36, 1);
}

.arena-bump-play__winner-kicker {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  letter-spacing: 0.08em;
}

.arena-bump-play__winner-name {
  color: var(--color-text-heading);
  font-size: var(--font-size-xl);
  text-align: center;
}

@keyframes arena-bump-winner-in {
  from {
    opacity: 0;
    transform: translate(-50%, -40%) scale(0.92);
  }

  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

.arena-bump-play__hint {
  position: absolute;
  bottom: calc(var(--space-lg) + env(safe-area-inset-bottom));
  left: 50%;
  z-index: 3;
  margin: 0;
  padding: var(--space-xs) var(--space-md);
  border: 2px solid rgba(255, 255, 255, 0.85);
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 2px 2px 0 rgba(92, 77, 130, 0.1);
  color: var(--color-text-heading);
  font-size: var(--font-size-sm);
  line-height: 1.2;
  text-align: center;
  transform: translateX(-50%);
  pointer-events: none;

  &--spectate {
    border-color: color-mix(in srgb, var(--color-accent) 35%, white);
    background: color-mix(in srgb, var(--color-accent) 16%, white);
  }
}
</style>
