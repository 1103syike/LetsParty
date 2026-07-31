<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { partyAudio } from '@/common/audio/party-audio';
import AnimalModelPreview from '@/components/animal-model-preview.vue';
import CuteCrownIcon from '@/components/cute-crown-icon.vue';
import TeamRevealOverlay from '@/components/team-reveal-overlay.vue';
import { partyCopy } from '@/locales/zh-TW/party';
import BouncyBombScene from '@/minigames/bouncy-bomb/bouncy-bomb-scene.vue';
import type { BouncyBombSnapshot } from '@/minigames/bouncy-bomb/bouncy-bomb';
import { BOMB_COOLDOWN_MS } from '@/minigames/bouncy-bomb/bouncy-bomb-tuning';
import { bouncyBombCopy } from '@/minigames/bouncy-bomb/locales/zh-TW';
import { sortParticipantsByCrown } from '@/party/scoring/crown';
import { usePartyStore } from '@/stores/party-store';

const props = defineProps<{
  snapshot: BouncyBombSnapshot;
  roundIndex: number;
}>();

const emit = defineEmits<{
  bouncyBomb: [value: {
    x: number;
    y: number;
    jump: boolean;
    throwBomb: boolean;
    aimX?: number | null;
    aimZ?: number | null;
  }];
}>();

const partyStore = usePartyStore();

const heldCodes = new Set<string>();
let jumpQueued = false;
let throwQueued = false;
let aimPoint: { x: number; z: number } | null = null;
let pumpRafId = 0;
let lastThrowSerial = 0;
let lastBlastSerial = 0;
let lastHitSerial = 0;
let killFeedClearTimer = 0;

const killFeed = ref<{
  id: number;
  text: string;
  eliminated: boolean;
}[]>([]);

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

const showCrownCeremony = computed(() => props.snapshot.isCrownCeremony);

const showTeamReveal = computed(() => props.snapshot.phase === 'teamReveal');

const showRespawnWatch = computed(() => props.snapshot.localRespawnActive);

const respawnSeconds = computed(() =>
  Math.max(1, Math.ceil(props.snapshot.localRespawnMsLeft / 1000)),
);

const localAmmoReady = computed(() =>
  Math.max(0, props.snapshot.localBombsMax - props.snapshot.localBombsInFlight),
);

const localCooldownRatio = computed(() =>
  Math.min(1, props.snapshot.localCooldownMs / BOMB_COOLDOWN_MS),
);

const localOnLastLife = computed(() => {
  const local = props.snapshot.players.find(
    (player) => player.id === props.snapshot.localPlayerId,
  );
  return Boolean(local?.alive && local.lives === 1);
});

const teamRevealCopy = {
  title: bouncyBombCopy.teamRevealTitle,
  teamA: bouncyBombCopy.teamA,
  teamB: bouncyBombCopy.teamB,
  vs: bouncyBombCopy.teamRevealVs,
  go: bouncyBombCopy.teamRevealGo,
  localPlayerTag: bouncyBombCopy.localPlayerTag,
};

const roundLabel = computed(() =>
  partyCopy.roundLabel.replace('{round}', String(props.roundIndex)),
);

const leaderId = computed(() => {
  const ranked = sortParticipantsByCrown(partyStore.participants);
  return ranked[0] && ranked[0].crownCount > 0 ? ranked[0].id : null;
});

const hudPlayers = computed(() => {
  const livesById = new Map(
    props.snapshot.players.map((player) => [player.id, player]),
  );

  return partyStore.participants.map((participant, index) => {
    const state = livesById.get(participant.id);

    return {
      participant,
      slot: index + 1,
      isLeader: participant.id === leaderId.value,
      lives: state?.lives ?? 0,
      alive: state?.alive ?? false,
      teamId: state?.teamId ?? 'a',
      isLastLife: Boolean(state?.alive && state.lives === 1),
    };
  });
});

watch(
  () => props.snapshot.throwSerial,
  (serial) => {
    if (!serial || serial === lastThrowSerial) {
      return;
    }

    lastThrowSerial = serial;
    partyAudio.playSfx('bombThrow');
  },
);

watch(
  () => props.snapshot.blastSerial,
  (serial) => {
    if (!serial || serial === lastBlastSerial) {
      return;
    }

    lastBlastSerial = serial;
    partyAudio.playSfx('bombExplode');

    const blast = props.snapshot.blast;

    if (!blast || blast.hits.length === 0) {
      return;
    }

    const attacker = partyStore.participants.find(
      (participant) => participant.id === blast.attackerId,
    );
    const attackerName = attacker?.displayName ?? '???';
    const lines = blast.hits.map((hit) => {
      const victim = partyStore.participants.find(
        (participant) => participant.id === hit.victimId,
      );
      const victimName = victim?.displayName ?? '???';
      const template = hit.eliminated
        ? bouncyBombCopy.killEliminate
        : bouncyBombCopy.killHit;

      return {
        id: serial * 10 + hit.victimId.length + (hit.eliminated ? 1 : 0),
        text: template
          .replace('{attacker}', attackerName)
          .replace('{victim}', victimName),
        eliminated: hit.eliminated,
      };
    });

    killFeed.value = [...lines, ...killFeed.value].slice(0, 4);
    window.clearTimeout(killFeedClearTimer);
    killFeedClearTimer = window.setTimeout(() => {
      killFeed.value = [];
    }, 2800);
  },
);

watch(
  () => props.snapshot.hitSerial,
  (serial) => {
    if (!serial || serial === lastHitSerial) {
      return;
    }

    lastHitSerial = serial;
    partyAudio.playSfx('impact');
  },
);

watch(
  () => props.snapshot.localRespawnActive,
  (active, wasActive) => {
    if (wasActive && !active) {
      partyAudio.playSfx('respawn');
    }
  },
);

function steerFromKeys(): { x: number; y: number } {
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

  const len = Math.hypot(x, y);

  if (len > 1) {
    x /= len;
    y /= len;
  }

  return { x, y };
}

function pumpInput(): void {
  if (
    props.snapshot.phase !== 'playing'
    || props.snapshot.localRespawnActive
  ) {
    jumpQueued = false;
    throwQueued = false;
    pumpRafId = window.requestAnimationFrame(pumpInput);
    return;
  }

  const steer = steerFromKeys();
  const jump = jumpQueued;
  const throwBomb = throwQueued;
  jumpQueued = false;
  throwQueued = false;

  emit('bouncyBomb', {
    x: steer.x,
    y: steer.y,
    jump,
    throwBomb,
    aimX: aimPoint?.x ?? null,
    aimZ: aimPoint?.z ?? null,
  });

  pumpRafId = window.requestAnimationFrame(pumpInput);
}

function onKeyDown(event: KeyboardEvent): void {
  if (STEER_CODES.has(event.code)) {
    heldCodes.add(event.code);
    event.preventDefault();
    return;
  }

  if (event.code === 'Space' && !event.repeat) {
    jumpQueued = true;
    event.preventDefault();
  }
}

function onKeyUp(event: KeyboardEvent): void {
  heldCodes.delete(event.code);
}

function onCourtAim(point: { x: number; z: number }): void {
  aimPoint = point;
}

function onCourtClick(point: { x: number; z: number }): void {
  aimPoint = point;
  throwQueued = true;
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  pumpRafId = window.requestAnimationFrame(pumpInput);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.cancelAnimationFrame(pumpRafId);
  window.clearTimeout(killFeedClearTimer);
  heldCodes.clear();
});
</script>

<template>
  <section class="bb-play">
    <BouncyBombScene
      :snapshot="snapshot"
      @court-aim="onCourtAim"
      @court-click="onCourtClick"
    />

    <TeamRevealOverlay
      v-if="showTeamReveal"
      :team-a-ids="snapshot.teamAIds"
      :team-b-ids="snapshot.teamBIds"
      :show-go="snapshot.showTeamRevealGo"
      :local-participant-id="localParticipantId"
      :copy="teamRevealCopy"
    />

    <div
      v-if="showRespawnWatch"
      class="bb-respawn-watch game-chrome"
      aria-live="polite"
    >
      <div class="bb-respawn-watch__vignette" />
      <div class="bb-respawn-watch__panel">
        <p class="bb-respawn-watch__hint font-game">
          {{ bouncyBombCopy.respawnWatchHint }}
        </p>
        <p class="bb-respawn-watch__title font-game">
          {{ bouncyBombCopy.respawnTitle }}
        </p>
        <p class="bb-respawn-watch__count font-game">
          {{ respawnSeconds }}
        </p>
      </div>
    </div>

    <div
      v-if="killFeed.length > 0"
      class="bb-kill-feed game-chrome"
      aria-live="polite"
    >
      <p
        v-for="line in killFeed"
        :key="line.id"
        class="bb-kill-feed__line font-game"
        :class="{ 'bb-kill-feed__line--elim': line.eliminated }"
      >
        {{ line.text }}
      </p>
    </div>

    <div
      v-if="!showCrownCeremony && !showTeamReveal"
      class="bb-hud game-chrome"
    >
      <p class="bb-hud__round font-game">
        {{ roundLabel }}
      </p>
      <ul class="bb-hud__list">
        <li
          v-for="row in hudPlayers"
          :key="row.participant.id"
          class="bb-hud__card"
          :data-chat-anchor="row.participant.id"
          :class="{
            'bb-hud__card--local': row.participant.id === localParticipantId,
            'bb-hud__card--dead': !row.alive,
            'bb-hud__card--red': row.teamId === 'a',
            'bb-hud__card--blue': row.teamId === 'b',
            'bb-hud__card--last': row.isLastLife,
          }"
        >
          <div class="bb-hud__portrait">
            <AnimalModelPreview
              compact
              :animal-id="row.participant.animalId"
              :player-color="row.participant.color"
            />
          </div>
          <div class="bb-hud__meta">
            <span class="bb-hud__name font-game">
              {{ row.participant.displayName }}
              <CuteCrownIcon
                v-if="row.isLeader"
                class="bb-hud__crown"
              />
            </span>
            <span
              v-if="row.alive"
              class="bb-hud__lives font-game"
              :class="{ 'bb-hud__lives--last': row.isLastLife }"
            >
              {{ bouncyBombCopy.livesLabel }} {{ row.lives }}
              <template v-if="row.isLastLife">
                · {{ bouncyBombCopy.lastLifeTag }}
              </template>
            </span>
            <span
              v-else
              class="bb-hud__lives bb-hud__lives--dead font-game"
            >
              {{ bouncyBombCopy.eliminatedTag }}
            </span>
          </div>
        </li>
      </ul>
    </div>

    <aside
      v-if="!showCrownCeremony && !showTeamReveal"
      class="bb-controls game-chrome"
    >
      <p class="bb-controls__title font-game">
        {{ bouncyBombCopy.controlsTitle }}
      </p>
      <div
        v-if="!showRespawnWatch"
        class="bb-ammo"
      >
        <p class="bb-ammo__label font-game">
          {{ bouncyBombCopy.bombsLabel }}
          {{ localAmmoReady }} / {{ snapshot.localBombsMax }}
        </p>
        <div class="bb-ammo__track">
          <div
            class="bb-ammo__fill"
            :style="{ transform: `scaleX(${1 - localCooldownRatio})` }"
          />
        </div>
      </div>
      <ul class="bb-controls__list">
        <li>{{ bouncyBombCopy.skillMove }}</li>
        <li>{{ bouncyBombCopy.skillJump }}</li>
        <li>{{ bouncyBombCopy.skillThrow }}</li>
        <li>{{ bouncyBombCopy.skillAim }}</li>
      </ul>
    </aside>

    <div
      v-if="localOnLastLife && !showCrownCeremony && !showTeamReveal && !showRespawnWatch"
      class="bb-last-life game-chrome"
      aria-live="polite"
    >
      <p class="bb-last-life__text font-game">
        {{ bouncyBombCopy.lastLifeTag }}
      </p>
    </div>

    <div
      v-if="showCrownCeremony"
      class="bb-crown-banner game-chrome"
      aria-live="polite"
    >
      <p class="bb-crown-banner__title font-game">
        {{ bouncyBombCopy.crownCeremonyTitle }}
      </p>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.bb-play {
  position: fixed;
  inset: 0;
  z-index: 200;
  overflow: hidden;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--color-text-heading) 55%, #1a1428) 0%,
    color-mix(in srgb, var(--color-accent) 35%, #2a2040) 45%,
    color-mix(in srgb, var(--color-bg) 40%, #1a1428) 100%
  );
}

.bb-play :deep(.bb-scene-root) {
  position: absolute;
  inset: 0;
  z-index: 1;
}

.bb-play :deep(.bb-scene) {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  outline: none;
  touch-action: none;
}

.bb-respawn-watch {
  position: absolute;
  inset: 0;
  z-index: 16;
  pointer-events: none;
}

.bb-respawn-watch__vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at center,
    transparent 42%,
    color-mix(in srgb, var(--color-text-heading) 22%, transparent) 100%
  );
}

.bb-respawn-watch__panel {
  position: absolute;
  left: 50%;
  bottom: calc(var(--space-xl) + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  transform: translateX(-50%);
}

.bb-respawn-watch__hint {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-on-accent);
  -webkit-text-stroke: 1px var(--color-text-heading);
  paint-order: stroke fill;
}

.bb-respawn-watch__title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-on-accent);
  -webkit-text-stroke: 2px var(--color-text-heading);
  paint-order: stroke fill;
}

.bb-respawn-watch__count {
  margin: 0;
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-warning);
  -webkit-text-stroke: 3px var(--color-text-heading);
  paint-order: stroke fill;
  animation: bb-respawn-pulse 0.9s ease-in-out infinite;
}

@keyframes bb-respawn-pulse {
  0%,
  100% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.08);
  }
}

.bb-kill-feed {
  position: absolute;
  top: calc(var(--space-xl) + env(safe-area-inset-top));
  left: 50%;
  z-index: 14;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  transform: translateX(-50%);
  pointer-events: none;
}

.bb-kill-feed__line {
  margin: 0;
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-surface-solid) 92%, transparent);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
  -webkit-text-stroke: 1px var(--color-on-accent);
  paint-order: stroke fill;
  animation: bb-kill-pop 0.35s cubic-bezier(0.22, 1.4, 0.36, 1) both;

  &--elim {
    color: var(--color-accent);
    font-size: var(--font-size-xl);
  }
}

@keyframes bb-kill-pop {
  0% {
    opacity: 0;
    transform: scale(0.7) translateY(var(--space-sm));
  }

  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.bb-hud {
  position: absolute;
  top: calc(var(--space-sm) + env(safe-area-inset-top));
  left: var(--space-md);
  z-index: 6;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  pointer-events: none;
}

.bb-hud__round {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
}

.bb-hud__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

.bb-hud__card {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  min-width: 11rem;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-md);
  border: 3px solid var(--color-border);
  background: var(--color-surface-solid);

  &--local {
    outline: 3px solid var(--color-accent);
  }

  &--red {
    border-color: var(--color-player-1);
  }

  &--blue {
    border-color: var(--color-player-3);
  }

  &--dead {
    opacity: 0.55;
  }

  &--last {
    box-shadow: 0 0 0 2px var(--color-warning);
  }
}

.bb-hud__portrait {
  width: 2.5rem;
  height: 2.5rem;
  flex-shrink: 0;
}

.bb-hud__meta {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.bb-hud__name {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
}

.bb-hud__crown {
  width: 1rem;
  height: 1rem;
}

.bb-hud__lives {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  color: var(--color-accent);

  &--dead {
    color: var(--color-text-muted);
  }

  &--last {
    color: var(--color-warning);
  }
}

.bb-controls {
  position: absolute;
  right: var(--space-md);
  bottom: calc(var(--space-md) + env(safe-area-inset-bottom));
  z-index: 6;
  min-width: 11rem;
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  background: var(--color-surface-solid);
  pointer-events: none;
}

.bb-controls__title {
  margin: 0 0 var(--space-xs);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
}

.bb-ammo {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-bottom: var(--space-sm);
}

.bb-ammo__label {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
}

.bb-ammo__track {
  width: 100%;
  height: var(--space-sm);
  overflow: hidden;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-border) 70%, transparent);
}

.bb-ammo__fill {
  width: 100%;
  height: 100%;
  transform-origin: left center;
  background: var(--color-accent);
  transition: transform 0.08s linear;
}

.bb-controls__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-size: var(--font-size-xs);
  color: var(--color-text);
}

.bb-last-life {
  position: absolute;
  top: calc(var(--space-xl) + env(safe-area-inset-top));
  right: var(--space-md);
  z-index: 10;
  pointer-events: none;
}

.bb-last-life__text {
  margin: 0;
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-surface-solid) 92%, transparent);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-warning);
  -webkit-text-stroke: 1px var(--color-text-heading);
  paint-order: stroke fill;
  animation: bb-respawn-pulse 1.1s ease-in-out infinite;
}

.bb-crown-banner {
  position: absolute;
  top: 20%;
  left: 50%;
  z-index: 12;
  transform: translateX(-50%);
  pointer-events: none;
}

.bb-crown-banner__title {
  margin: 0;
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-warning);
  -webkit-text-stroke: 2px var(--color-text-heading);
  paint-order: stroke fill;
}
</style>
