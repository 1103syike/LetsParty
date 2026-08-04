<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { partyAudio } from '@/common/audio/party-audio';
import AnimalModelPreview from '@/components/animal-model-preview.vue';
import TeamRevealOverlay from '@/components/team-reveal-overlay.vue';
import { partyCopy } from '@/locales/zh-TW/party';
import BouncyBombScene from '@/minigames/bouncy-bomb/bouncy-bomb-scene.vue';
import type { BouncyBombSnapshot } from '@/minigames/bouncy-bomb/bouncy-bomb';
import {
  BB_LIVES,
  BOMB_COOLDOWN_MS,
} from '@/minigames/bouncy-bomb/bouncy-bomb-tuning';
import { bouncyBombCopy } from '@/minigames/bouncy-bomb/locales/zh-TW';
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
let lastKillFxSerial = 0;
let lastScoreFxSerial = 0;
let killFeedClearTimer = 0;
let killFxHideTimer = 0;
let scoreFxHideTimer = 0;

const killFeed = ref<{
  id: number;
  attackerName: string;
  attackerTeamId: 'a' | 'b';
  victimName: string;
  victimTeamId: 'a' | 'b';
  verb: string;
  eliminated: boolean;
}[]>([]);

const killFxVisible = ref(false);
const killFxText = ref('');
const killFxTeamId = ref<'a' | 'b'>('a');

const scoreFxVisible = ref(false);
const scoreFxText = ref('');
const scoreFxTeamId = ref<'a' | 'b'>('a');
const scoreFxBoardA = ref(0);
const scoreFxBoardB = ref(0);

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

/** 搶三燈號：亮幾顆＝目前得分 */
const scoreLampsA = computed(() =>
  Array.from(
    { length: props.snapshot.scoreToWin },
    (_, index) => index < props.snapshot.scoreA,
  ),
);

const scoreLampsB = computed(() =>
  Array.from(
    { length: props.snapshot.scoreToWin },
    (_, index) => index < props.snapshot.scoreB,
  ),
);

const hudPlayers = computed(() => {
  const stateById = new Map(
    props.snapshot.players.map((player) => [player.id, player]),
  );
  const mvpId = props.snapshot.mvpPlayerId;
  const svpId = props.snapshot.svpPlayerId;

  const rows = partyStore.participants.map((participant, index) => {
    const state = stateById.get(participant.id);
    const kills = state?.kills ?? 0;
    const deaths = state?.deaths ?? 0;
    const lives = state?.lives ?? 0;

    return {
      participant,
      orderIndex: index,
      lives,
      lifeSlots: Array.from({ length: BB_LIVES }, (_, slot) => slot < lives),
      kills,
      deaths,
      kdLabel: bouncyBombCopy.kdLabel
        .replace('{kills}', String(kills))
        .replace('{deaths}', String(deaths)),
      alive: state?.alive ?? false,
      teamId: state?.teamId ?? ('a' as const),
      isLastLife: Boolean(state?.alive && lives === 1),
      isMvp: participant.id === mvpId,
      isSvp: participant.id === svpId,
    };
  });

  // 殺多死少排前面（與 MVP 規則一致）
  rows.sort((a, b) => {
    if (b.kills !== a.kills) {
      return b.kills - a.kills;
    }

    if (a.deaths !== b.deaths) {
      return a.deaths - b.deaths;
    }

    return a.orderIndex - b.orderIndex;
  });

  return rows.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
});

const mvpShowcase = computed(() => {
  const mvpId = props.snapshot.mvpPlayerId;

  if (!mvpId) {
    return null;
  }

  const row = hudPlayers.value.find((entry) => entry.participant.id === mvpId);
  return row ?? null;
});

const svpShowcase = computed(() => {
  const svpId = props.snapshot.svpPlayerId;

  if (!svpId) {
    return null;
  }

  const row = hudPlayers.value.find((entry) => entry.participant.id === svpId);
  return row ?? null;
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

      return {
        id: serial * 10 + hit.victimId.length + (hit.eliminated ? 1 : 0),
        attackerName,
        attackerTeamId: blast.attackerTeamId,
        victimName,
        victimTeamId: hit.victimTeamId,
        verb: hit.eliminated
          ? bouncyBombCopy.killFeedVerbElim
          : bouncyBombCopy.killFeedVerbHit,
        eliminated: hit.eliminated,
      };
    });

    killFeed.value = [...lines, ...killFeed.value].slice(0, 3);
    window.clearTimeout(killFeedClearTimer);
    killFeedClearTimer = window.setTimeout(() => {
      killFeed.value = [];
    }, 2800);
  },
);

watch(
  () => props.snapshot.killFxSerial,
  (serial) => {
    if (!serial || serial === lastKillFxSerial) {
      return;
    }

    lastKillFxSerial = serial;
    const fx = props.snapshot.killFx;

    // 只顯示自己的擊殺特效，避免四人場一起噴太亂
    if (!fx || fx.attackerId !== props.snapshot.localPlayerId) {
      return;
    }

    killFxText.value = bouncyBombCopy.killFxText.replace(
      '{count}',
      String(fx.killCount),
    );
    killFxTeamId.value = fx.attackerTeamId;
    killFxVisible.value = true;
    window.clearTimeout(killFxHideTimer);
    killFxHideTimer = window.setTimeout(() => {
      killFxVisible.value = false;
    }, 1400);
  },
);

watch(
  () => props.snapshot.scoreFxSerial,
  (serial) => {
    if (!serial || serial === lastScoreFxSerial) {
      return;
    }

    lastScoreFxSerial = serial;
    const teamId = props.snapshot.scoringTeamId;

    if (!teamId) {
      return;
    }

    const teamName = teamId === 'a'
      ? bouncyBombCopy.teamA
      : bouncyBombCopy.teamB;
    scoreFxText.value = bouncyBombCopy.scoreFxText.replace('{team}', teamName);
    scoreFxTeamId.value = teamId;
    scoreFxBoardA.value = props.snapshot.scoreA;
    scoreFxBoardB.value = props.snapshot.scoreB;
    scoreFxVisible.value = true;
    window.clearTimeout(scoreFxHideTimer);
    scoreFxHideTimer = window.setTimeout(() => {
      scoreFxVisible.value = false;
    }, 1800);
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
    aimPoint = null;
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
  window.clearTimeout(killFxHideTimer);
  window.clearTimeout(scoreFxHideTimer);
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
      v-if="!showCrownCeremony && !showTeamReveal"
      class="bb-topbar game-chrome"
    >
      <p class="bb-topbar__round font-game">
        {{ roundLabel }}
      </p>
      <div
        class="bb-topbar__score"
        :aria-label="`${bouncyBombCopy.scoreboardLabel} ${snapshot.scoreA} : ${snapshot.scoreB}`"
      >
        <span class="bb-topbar__side bb-topbar__side--red font-game">
          {{ bouncyBombCopy.teamA }}
        </span>
        <span
          class="bb-topbar__lamps bb-topbar__lamps--red"
          aria-hidden="true"
        >
          <span
            v-for="(lit, index) in scoreLampsA"
            :key="`a-${index}`"
            class="bb-topbar__lamp"
            :class="{ 'bb-topbar__lamp--on': lit }"
          />
        </span>
        <span class="bb-topbar__vs font-game">VS</span>
        <span
          class="bb-topbar__lamps bb-topbar__lamps--blue"
          aria-hidden="true"
        >
          <span
            v-for="(lit, index) in scoreLampsB"
            :key="`b-${index}`"
            class="bb-topbar__lamp"
            :class="{ 'bb-topbar__lamp--on': lit }"
          />
        </span>
        <span class="bb-topbar__side bb-topbar__side--blue font-game">
          {{ bouncyBombCopy.teamB }}
        </span>
      </div>
    </div>

    <aside
      v-if="!showCrownCeremony && !showTeamReveal"
      class="bb-board game-chrome"
      :aria-label="bouncyBombCopy.rankBoardTitle"
    >
      <header class="bb-board__head">
        <p class="bb-board__title font-game">
          {{ bouncyBombCopy.rankBoardTitle }}
        </p>
        <p class="bb-board__legend font-game">
          <span class="bb-board__legend-mvp">{{ bouncyBombCopy.mvpBadge }}</span>
          <span class="bb-board__legend-svp">{{ bouncyBombCopy.svpBadge }}</span>
        </p>
      </header>
      <ol class="bb-board__list">
        <li
          v-for="row in hudPlayers"
          :key="row.participant.id"
          class="bb-board__row"
          :data-chat-anchor="row.participant.id"
          :class="{
            'bb-board__row--local': row.participant.id === localParticipantId,
            'bb-board__row--dead': !row.alive,
            'bb-board__row--red': row.teamId === 'a',
            'bb-board__row--blue': row.teamId === 'b',
            'bb-board__row--mvp': row.isMvp,
            'bb-board__row--svp': row.isSvp && !row.isMvp,
          }"
        >
          <span class="bb-board__rank font-game">{{ row.rank }}</span>
          <div class="bb-board__portrait">
            <AnimalModelPreview
              compact
              :animal-id="row.participant.animalId"
              :player-color="row.participant.color"
            />
          </div>
          <div class="bb-board__meta">
            <div class="bb-board__name-row">
              <span class="bb-board__name font-game">
                {{ row.participant.displayName }}
              </span>
              <span
                v-if="row.isMvp"
                class="bb-board__badge bb-board__badge--mvp font-game"
              >{{ bouncyBombCopy.mvpBadge }}</span>
              <span
                v-else-if="row.isSvp"
                class="bb-board__badge bb-board__badge--svp font-game"
              >{{ bouncyBombCopy.svpBadge }}</span>
            </div>
            <div class="bb-board__stats font-game">
              <span class="bb-board__kd">{{ row.kdLabel }}</span>
              <span
                class="bb-board__lives"
                :class="{ 'bb-board__lives--last': row.isLastLife }"
                :aria-label="`${bouncyBombCopy.livesLabel} ${row.lives}`"
              >
                <span
                  v-for="(filled, lifeIndex) in row.lifeSlots"
                  :key="lifeIndex"
                  class="bb-board__pip"
                  :class="{ 'bb-board__pip--on': filled }"
                />
              </span>
            </div>
          </div>
        </li>
      </ol>
    </aside>

    <div
      v-if="killFeed.length > 0 && !showCrownCeremony"
      class="bb-kill-feed game-chrome"
      aria-live="polite"
    >
      <p
        v-for="line in killFeed"
        :key="line.id"
        class="bb-kill-feed__line font-game"
        :class="{ 'bb-kill-feed__line--elim': line.eliminated }"
      >
        <span
          class="bb-kill-feed__name"
          :class="line.attackerTeamId === 'a'
            ? 'bb-kill-feed__name--red'
            : 'bb-kill-feed__name--blue'"
        >{{ line.attackerName }}</span>
        <span class="bb-kill-feed__verb">{{ line.verb }}</span>
        <span
          class="bb-kill-feed__name"
          :class="line.victimTeamId === 'a'
            ? 'bb-kill-feed__name--red'
            : 'bb-kill-feed__name--blue'"
        >{{ line.victimName }}</span>
      </p>
    </div>

    <div
      v-if="killFxVisible && !showCrownCeremony"
      class="bb-kill-fx game-chrome"
      :class="killFxTeamId === 'a' ? 'bb-kill-fx--red' : 'bb-kill-fx--blue'"
      aria-live="polite"
    >
      <p class="bb-kill-fx__text font-game">
        {{ killFxText }}
      </p>
    </div>

    <div
      v-if="scoreFxVisible && !showCrownCeremony"
      class="bb-score-fx game-chrome"
      :class="scoreFxTeamId === 'a' ? 'bb-score-fx--red' : 'bb-score-fx--blue'"
      aria-live="polite"
    >
      <p class="bb-score-fx__text font-game">
        {{ scoreFxText }}
      </p>
      <p class="bb-score-fx__board font-game">
        <span class="bb-score-fx__num bb-score-fx__num--red">{{ scoreFxBoardA }}</span>
        <span class="bb-score-fx__colon">:</span>
        <span class="bb-score-fx__num bb-score-fx__num--blue">{{ scoreFxBoardB }}</span>
      </p>
    </div>

    <aside
      v-if="!showCrownCeremony && !showTeamReveal && !showRespawnWatch"
      class="bb-controls game-chrome"
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
      <p class="bb-controls__hint font-game">
        {{ bouncyBombCopy.skillMove }} · {{ bouncyBombCopy.skillJump }} · {{ bouncyBombCopy.skillThrow }}
      </p>
    </aside>

    <!-- 文案靠上緣，中間留給 3D 頒冠，避免挡住結算 -->
    <div
      v-if="showCrownCeremony"
      class="bb-award game-chrome"
      aria-live="polite"
    >
      <p class="bb-award__title font-game">
        {{ bouncyBombCopy.crownCeremonyTitle }}
      </p>
      <div class="bb-award__row">
        <div
          v-if="mvpShowcase"
          class="bb-award__chip bb-award__chip--mvp"
          :class="mvpShowcase.teamId === 'a' ? 'bb-award__chip--red' : 'bb-award__chip--blue'"
        >
          <span class="bb-award__chip-tag font-game">{{ bouncyBombCopy.mvpBadge }}</span>
          <span class="bb-award__chip-name font-game">
            {{ mvpShowcase.participant.displayName }}
          </span>
          <span class="bb-award__chip-kd font-game">
            {{
              bouncyBombCopy.mvpFxKd
                .replace('{kills}', String(mvpShowcase.kills))
                .replace('{deaths}', String(mvpShowcase.deaths))
            }}
          </span>
        </div>
        <div
          v-if="svpShowcase"
          class="bb-award__chip bb-award__chip--svp"
          :class="svpShowcase.teamId === 'a' ? 'bb-award__chip--red' : 'bb-award__chip--blue'"
        >
          <span class="bb-award__chip-tag font-game">{{ bouncyBombCopy.svpBadge }}</span>
          <span class="bb-award__chip-name font-game">
            {{ svpShowcase.participant.displayName }}
          </span>
          <span class="bb-award__chip-kd font-game">{{ svpShowcase.kdLabel }}</span>
        </div>
      </div>
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

.bb-topbar {
  position: absolute;
  top: calc(var(--space-sm) + env(safe-area-inset-top));
  left: 50%;
  z-index: 8;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  transform: translateX(-50%);
  pointer-events: none;
}

.bb-topbar__round {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  line-height: 1;
  color: var(--color-text-heading);
}

.bb-topbar__score {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  min-height: calc(var(--space-xl) + var(--space-xs));
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-surface-solid) 90%, transparent);
}

.bb-topbar__side,
.bb-topbar__vs {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  line-height: 1;
  font-weight: var(--font-weight-bold);
}

.bb-topbar__side {
  font-size: var(--font-size-md);

  &--red {
    color: var(--color-player-1);
  }

  &--blue {
    color: var(--color-player-3);
  }
}

.bb-topbar__lamps {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  height: var(--space-md);
}

.bb-topbar__lamp {
  flex-shrink: 0;
  box-sizing: border-box;
  width: var(--space-md);
  height: var(--space-md);
  border-radius: var(--radius-full);
  border: 2px solid var(--color-border);
  background: color-mix(in srgb, var(--color-border) 55%, transparent);
  transition: background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;

  .bb-topbar__lamps--red &--on {
    border-color: var(--color-player-1);
    background: var(--color-player-1);
    box-shadow: 0 0 var(--space-sm) color-mix(in srgb, var(--color-player-1) 70%, transparent);
  }

  .bb-topbar__lamps--blue &--on {
    border-color: var(--color-player-3);
    background: var(--color-player-3);
    box-shadow: 0 0 var(--space-sm) color-mix(in srgb, var(--color-player-3) 70%, transparent);
  }
}

.bb-topbar__vs {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.bb-board {
  position: absolute;
  top: calc(var(--space-sm) + env(safe-area-inset-top));
  left: var(--space-md);
  z-index: 6;
  width: 15rem;
  padding: var(--space-sm);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-surface-solid) 92%, transparent);
  pointer-events: none;
}

.bb-board__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  margin-bottom: var(--space-sm);
}

.bb-board__title {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  line-height: 1;
  color: var(--color-text-heading);
}

.bb-board__legend {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  margin: 0;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  line-height: 1;
}

.bb-board__legend-mvp {
  color: var(--color-warning);
}

.bb-board__legend-svp {
  color: var(--color-player-2);
}

.bb-board__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

.bb-board__row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  min-height: calc(var(--space-xl) + var(--space-md));
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg) 35%, transparent);

  &--red {
    border-left-color: var(--color-player-1);
  }

  &--blue {
    border-left-color: var(--color-player-3);
  }

  &--local {
    background: color-mix(in srgb, var(--color-accent) 18%, transparent);
  }

  &--dead {
    opacity: 0.55;
  }

  &--mvp {
    box-shadow: inset 0 0 0 1px var(--color-warning);
  }

  &--svp {
    box-shadow: inset 0 0 0 1px var(--color-player-2);
  }
}

.bb-board__rank {
  flex-shrink: 0;
  width: var(--space-md);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  line-height: 1;
  color: var(--color-text-muted);
  text-align: center;
}

.bb-board__portrait {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  overflow: hidden;
  border-radius: var(--radius-md);

  /* compact 預設高度比格子高，強制塞進頭像格 */
  :deep(.animal-preview__canvas) {
    width: 100%;
    height: 100%;
  }
}

.bb-board__meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-xs);
}

.bb-board__name-row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  min-width: 0;
}

.bb-board__name {
  overflow: hidden;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  line-height: 1;
  color: var(--color-text-heading);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bb-board__badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 0 var(--space-xs);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  line-height: 1.2;

  &--mvp {
    color: var(--color-text-heading);
    background: var(--color-warning);
  }

  &--svp {
    color: var(--color-on-accent);
    background: var(--color-player-2);
  }
}

.bb-board__stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-xs);
}

.bb-board__kd {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  line-height: 1;
  color: var(--color-on-accent);
}

.bb-board__lives {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);

  &--last .bb-board__pip--on {
    background: var(--color-warning);
  }
}

.bb-board__pip {
  flex-shrink: 0;
  width: var(--space-xs);
  height: var(--space-xs);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-border) 80%, transparent);

  &--on {
    background: var(--color-accent);
  }
}

.bb-kill-feed {
  position: absolute;
  top: calc(var(--space-sm) + env(safe-area-inset-top));
  right: var(--space-md);
  z-index: 14;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-xs);
  max-width: min(18rem, 42vw);
  pointer-events: none;
}

.bb-kill-feed__line {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: var(--space-xs);
  margin: 0;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-surface-solid) 88%, transparent);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  line-height: 1;
  color: var(--color-text-heading);
  white-space: nowrap;
  animation: bb-kill-pop 0.3s cubic-bezier(0.22, 1.4, 0.36, 1) both;

  &--elim {
    font-size: var(--font-size-md);
  }
}

.bb-kill-feed__name {
  &--red {
    color: var(--color-player-1);
  }

  &--blue {
    color: var(--color-player-3);
  }
}

.bb-kill-feed__verb {
  color: var(--color-text-muted);
}

@keyframes bb-kill-pop {
  0% {
    opacity: 0;
    transform: translateX(var(--space-sm));
  }

  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

.bb-kill-fx {
  position: absolute;
  top: 30%;
  left: 50%;
  z-index: 15;
  transform: translateX(-50%);
  pointer-events: none;
}

.bb-kill-fx__text {
  margin: 0;
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  -webkit-text-stroke: 2px var(--color-text-heading);
  paint-order: stroke fill;
  animation: bb-kill-fx-pop 0.9s cubic-bezier(0.22, 1.4, 0.36, 1) both;

  .bb-kill-fx--red & {
    color: var(--color-player-1);
  }

  .bb-kill-fx--blue & {
    color: var(--color-player-3);
  }
}

@keyframes bb-kill-fx-pop {
  0% {
    opacity: 0;
    transform: scale(0.55) translateY(var(--space-md));
  }

  35% {
    opacity: 1;
    transform: scale(1.12) translateY(0);
  }

  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.bb-score-fx {
  position: absolute;
  top: 40%;
  left: 50%;
  z-index: 15;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  transform: translateX(-50%);
  pointer-events: none;
}

.bb-score-fx__text {
  margin: 0;
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  -webkit-text-stroke: 2px var(--color-text-heading);
  paint-order: stroke fill;
  animation: bb-kill-fx-pop 1s cubic-bezier(0.22, 1.4, 0.36, 1) both;

  .bb-score-fx--red & {
    color: var(--color-player-1);
  }

  .bb-score-fx--blue & {
    color: var(--color-player-3);
  }
}

.bb-score-fx__board {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  -webkit-text-stroke: 2px var(--color-text-heading);
  paint-order: stroke fill;
}

.bb-score-fx__num {
  &--red {
    color: var(--color-player-1);
  }

  &--blue {
    color: var(--color-player-3);
  }
}

.bb-score-fx__colon {
  color: var(--color-text-heading);
}

.bb-controls {
  position: absolute;
  right: var(--space-md);
  bottom: calc(var(--space-md) + env(safe-area-inset-bottom));
  z-index: 6;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-width: 10rem;
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-surface-solid) 90%, transparent);
  pointer-events: none;
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

.bb-controls__hint {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.bb-award {
  position: absolute;
  top: calc(var(--space-md) + env(safe-area-inset-top));
  left: 50%;
  z-index: 18;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  width: min(36rem, calc(100% - var(--space-xl)));
  transform: translateX(-50%);
  pointer-events: none;
}

.bb-award__title {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  line-height: 1;
  color: var(--color-warning);
  -webkit-text-stroke: 2px var(--color-text-heading);
  paint-order: stroke fill;
  animation: bb-kill-fx-pop 0.8s cubic-bezier(0.22, 1.4, 0.36, 1) both;
}

.bb-award__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
}

.bb-award__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-surface-solid) 92%, transparent);
  animation: bb-kill-pop 0.55s cubic-bezier(0.22, 1.4, 0.36, 1) both;

  &--mvp {
    border: 2px solid var(--color-warning);
  }

  &--svp {
    border: 2px solid var(--color-player-2);
    animation-delay: 0.12s;
  }

  &--red .bb-award__chip-name {
    color: var(--color-player-1);
  }

  &--blue .bb-award__chip-name {
    color: var(--color-player-3);
  }
}

.bb-award__chip-tag {
  flex-shrink: 0;
  padding: 0 var(--space-xs);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  line-height: 1.2;

  .bb-award__chip--mvp & {
    color: var(--color-text-heading);
    background: var(--color-warning);
  }

  .bb-award__chip--svp & {
    color: var(--color-on-accent);
    background: var(--color-player-2);
  }
}

.bb-award__chip-name,
.bb-award__chip-kd {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  line-height: 1;
  color: var(--color-text-heading);
}

.bb-award__chip-kd {
  color: var(--color-text-muted);
}
</style>
