<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { partyAudio } from '@/common/audio/party-audio';
import AnimalModelPreview from '@/components/animal-model-preview.vue';
import CuteCrownIcon from '@/components/cute-crown-icon.vue';
import VolleyballEventIcon from '@/components/volleyball-event-icon.vue';
import { partyCopy } from '@/locales/zh-TW/party';
import { volleyballCopy } from '@/minigames/volleyball/locales/zh-TW';
import type {
  VolleyballPlayerRecord,
  VolleyballSnapshot,
} from '@/minigames/volleyball/volleyball';
import VolleyballScene from '@/minigames/volleyball/volleyball-scene.vue';
import { sortParticipantsByCrown } from '@/party/scoring/crown';
import { usePartyStore } from '@/stores/party-store';
import type { Participant } from '@/types/party';

const props = defineProps<{
  snapshot: VolleyballSnapshot;
  roundIndex: number;
}>();

const emit = defineEmits<{
  volleyball: [value: {
    x: number;
    y: number;
    jump: boolean;
    bump: boolean;
    set: boolean;
    spike: boolean;
    aimX?: number | null;
    aimZ?: number | null;
  }];
}>();

const partyStore = usePartyStore();

const heldCodes = new Set<string>();
let jumpQueued = false;
let bumpQueued = false;
let setQueued = false;
let spikeQueued = false;
let pendingAimX: number | null = null;
let pendingAimZ: number | null = null;
let hoverAimX: number | null = null;
let hoverAimZ: number | null = null;
let pumpRafId = 0;
let scoreFxHideTimer = 0;
let teammateSetHideTimer = 0;

/** 得分特效：依 scoreFxSerial 觸發一次 */
const scoreFxVisible = ref(false);
const scoreFxKind = ref<'normal' | 'spike-kill' | 'out' | 'net-out'>('normal');

const isOutScoreFx = computed(() => (
  scoreFxKind.value === 'out' || scoreFxKind.value === 'net-out'
));
const scoreFxTeam = ref<'a' | 'b'>('a');
const scoreFxOutName = ref('');
/** 觸發當下鎖住比分，動畫期間不被下一分蓋掉 */
const scoreFxBoardA = ref(0);
const scoreFxBoardB = ref(0);
let lastScoreFxSerial = 0;

/** 隊友舉球提示 */
const teammateSetVisible = ref(false);
let lastTeammateSetHitSerial = 0;

/** 殺球出手／神接派對字 */
const partyShoutVisible = ref(false);
const partyShoutKind = ref<'spike' | 'nice'>('spike');
let lastSpikeShoutSerial = 0;
let lastNiceShoutSerial = 0;
let partyShoutHideTimer = 0;

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

const roundLabel = computed(() =>
  partyCopy.roundLabel.replace('{round}', String(props.roundIndex)),
);

const leaderId = computed(() => {
  const ranked = sortParticipantsByCrown(partyStore.participants);
  return ranked[0] && ranked[0].crownCount > 0 ? ranked[0].id : null;
});

const recordsById = computed(() => {
  const map = new Map<string, VolleyballPlayerRecord>();

  for (const record of props.snapshot.playerRecords) {
    map.set(record.playerId, record);
  }

  return map;
});

function buildTeamRows(teamId: 'a' | 'b', ids: string[]) {
  const emptyRecord = (playerId: string): VolleyballPlayerRecord => ({
    playerId,
    serves: 0,
    bumps: 0,
    sets: 0,
    spikes: 0,
    goals: 0,
    spikeGoals: 0,
    groundGoals: 0,
  });

  return ids.flatMap((id, index) => {
    const participant = partyStore.participants.find((entry) => entry.id === id);

    if (!participant) {
      return [];
    }

    return [{
      participant,
      slot: index + 1,
      isLeader: id === leaderId.value,
      teamId,
      record: recordsById.value.get(id) ?? emptyRecord(id),
    }];
  });
}

const teamARows = computed(() => buildTeamRows('a', props.snapshot.teamAIds));
const teamBRows = computed(() => buildTeamRows('b', props.snapshot.teamBIds));

function playerDisplayName(playerId: string | null): string {
  if (!playerId) {
    return '';
  }

  return partyStore.participants.find((participant) => participant.id === playerId)
    ?.displayName
    ?? playerId;
}

const crownCeremonyMessage = computed((): string => {
  const names = props.snapshot.crownWinnerIds
    .map((participantId) =>
      partyStore.participants.find((participant) => participant.id === participantId)?.displayName
      ?? participantId,
    )
    .join('、');

  if (!names) {
    return volleyballCopy.crownCeremonyTitle;
  }

  return volleyballCopy.crownCeremonyWinners.replace('{names}', names);
});

const ballOwnerVisible = computed((): boolean => {
  const ownerId = props.snapshot.ballOwnerId;

  return Boolean(
    ownerId
    && props.snapshot.phase !== 'pointPause'
    && props.snapshot.phase !== 'crownAward'
    && props.snapshot.phase !== 'finished',
  );
});

const ballOwnerIsLocal = computed((): boolean => (
  Boolean(
    props.snapshot.ballOwnerId
    && props.snapshot.ballOwnerId === props.snapshot.localPlayerId,
  )
));

const ballOwnerLabel = computed((): string | null => {
  if (!ballOwnerVisible.value || !props.snapshot.ballOwnerId) {
    return null;
  }

  if (ballOwnerIsLocal.value) {
    return volleyballCopy.ballOwnerYours;
  }

  const name = partyStore.participants.find(
    (participant) => participant.id === props.snapshot.ballOwnerId,
  )?.displayName ?? props.snapshot.ballOwnerId;

  return volleyballCopy.ballOwnerTheirs.replace('{name}', name);
});

const ballOwnerCue = computed((): string => (
  ballOwnerIsLocal.value
    ? volleyballCopy.ballOwnerYoursCue
    : volleyballCopy.ballOwnerTheirsCue
));

const partyShoutTitle = computed((): string => (
  partyShoutKind.value === 'spike'
    ? volleyballCopy.spikeSwingCallout
    : volleyballCopy.niceReceiveCallout
));

const partyShoutCue = computed((): string => (
  partyShoutKind.value === 'spike'
    ? volleyballCopy.spikeSwingCue
    : volleyballCopy.niceReceiveCue
));

const matchPointLabel = computed((): string | null => {
  if (!props.snapshot.matchPointTeam) {
    return null;
  }

  return props.snapshot.matchPointTeam === 'a'
    ? volleyballCopy.matchPointRed
    : volleyballCopy.matchPointBlue;
});

const statusLabel = computed(() => {
  if (props.snapshot.phase === 'serve') {
    return volleyballCopy.serveHint;
  }

  const scoringTeam = props.snapshot.scoringTeam;
  const fxKind = props.snapshot.scoreFxKind;

  if (fxKind === 'out' || fxKind === 'net-out') {
    if (scoringTeam === 'a') {
      return volleyballCopy.redOutScored;
    }

    if (scoringTeam === 'b') {
      return volleyballCopy.blueOutScored;
    }

    return volleyballCopy.outScored;
  }

  const isSpike = fxKind === 'spike-kill';

  if (scoringTeam === 'a') {
    return isSpike ? volleyballCopy.redSpikeScored : volleyballCopy.redScored;
  }

  if (scoringTeam === 'b') {
    return isSpike ? volleyballCopy.blueSpikeScored : volleyballCopy.blueScored;
  }

  return volleyballCopy.rallyHint;
});

const statusTeamClass = computed(() => {
  if (
    props.snapshot.scoreFxKind === 'out'
    || props.snapshot.scoreFxKind === 'net-out'
  ) {
    return 'volleyball-play__status--out';
  }

  if (props.snapshot.scoringTeam === 'a') {
    return 'volleyball-play__status--red';
  }

  if (props.snapshot.scoringTeam === 'b') {
    return 'volleyball-play__status--blue';
  }

  return '';
});

const scoreFxLabel = computed(() => {
  if (scoreFxKind.value === 'net-out') {
    return volleyballCopy.scoreFxNetOutStamp;
  }

  if (scoreFxKind.value === 'out') {
    return volleyballCopy.scoreFxOutStamp;
  }

  if (scoreFxTeam.value === 'a') {
    return scoreFxKind.value === 'spike-kill'
      ? volleyballCopy.scoreFxRedSpike
      : volleyballCopy.scoreFxRed;
  }

  return scoreFxKind.value === 'spike-kill'
    ? volleyballCopy.scoreFxBlueSpike
    : volleyballCopy.scoreFxBlue;
});

/** 出界副標：誰打出去／撞網 */
const scoreFxOutDetail = computed(() => {
  if (!scoreFxOutName.value) {
    return '';
  }

  if (scoreFxKind.value === 'net-out') {
    return volleyballCopy.scoreFxNetOutNamed.replace('{name}', scoreFxOutName.value);
  }

  return volleyballCopy.scoreFxOutNamed.replace('{name}', scoreFxOutName.value);
});

const scoreFxCue = computed(() => {
  if (scoreFxKind.value === 'net-out') {
    return volleyballCopy.scoreFxNetOutCue;
  }

  if (scoreFxKind.value === 'out') {
    return volleyballCopy.scoreFxOutCue;
  }

  return scoreFxKind.value === 'spike-kill'
    ? volleyballCopy.scoreFxSpikeCue
    : volleyballCopy.scoreFxCue;
});

watch(
  () => props.snapshot.scoreFxSerial,
  (serial) => {
    if (
      !serial
      || serial === lastScoreFxSerial
      || !props.snapshot.scoreFxKind
      || !props.snapshot.scoringTeam
    ) {
      return;
    }

    lastScoreFxSerial = serial;
    scoreFxKind.value = props.snapshot.scoreFxKind;
    scoreFxTeam.value = props.snapshot.scoringTeam;
    scoreFxBoardA.value = props.snapshot.scoreA;
    scoreFxBoardB.value = props.snapshot.scoreB;
    scoreFxOutName.value = props.snapshot.outPlayerId
      ? playerDisplayName(props.snapshot.outPlayerId)
      : '';
    scoreFxVisible.value = true;

    if (
      props.snapshot.scoreFxKind === 'out'
      || props.snapshot.scoreFxKind === 'net-out'
    ) {
      partyAudio.playSfx('out');
    }

    window.clearTimeout(scoreFxHideTimer);
    const hideMs = props.snapshot.scoreFxKind === 'spike-kill'
      || props.snapshot.scoreFxKind === 'out'
      || props.snapshot.scoreFxKind === 'net-out'
      ? 1600
      : 1200;
    scoreFxHideTimer = window.setTimeout(() => {
      scoreFxVisible.value = false;
    }, hideMs);
  },
);

function showPartyShout(kind: 'spike' | 'nice', hideMs: number): void {
  partyShoutKind.value = kind;
  partyShoutVisible.value = true;
  window.clearTimeout(partyShoutHideTimer);
  partyShoutHideTimer = window.setTimeout(() => {
    partyShoutVisible.value = false;
  }, hideMs);
}

watch(
  () => props.snapshot.hitSerial,
  (serial, prevSerial) => {
    const hit = props.snapshot.lastHit;

    if (serial && serial !== prevSerial && hit) {
      partyAudio.playSfx(hit.kind === 'spike' ? 'hitBallAlt' : 'hitBall');

      if (hit.kind === 'spike' && serial !== lastSpikeShoutSerial) {
        lastSpikeShoutSerial = serial;
        showPartyShout('spike', 1100);
      }
    }

    const localId = props.snapshot.localPlayerId;
    const localTeamId = props.snapshot.localTeamId;

    if (
      !serial
      || serial === lastTeammateSetHitSerial
      || !hit
      || hit.kind !== 'set'
      || !localId
      || !localTeamId
      || hit.playerId === localId
    ) {
      return;
    }

    const hitter = props.snapshot.players.find((player) => player.id === hit.playerId);

    if (!hitter || hitter.teamId !== localTeamId) {
      return;
    }

    lastTeammateSetHitSerial = serial;
    teammateSetVisible.value = true;
    window.clearTimeout(teammateSetHideTimer);
    teammateSetHideTimer = window.setTimeout(() => {
      teammateSetVisible.value = false;
    }, 1600);
  },
);

watch(
  () => props.snapshot.niceReceiveSerial,
  (serial) => {
    if (!serial || serial === lastNiceShoutSerial) {
      return;
    }

    lastNiceShoutSerial = serial;
    showPartyShout('nice', 1200);
  },
);

function playerSlotLabel(slot: number): string {
  return volleyballCopy.playerSlotLabel.replace('{slot}', String(slot));
}

function hudCardClass(color: Participant['color']): string {
  return `vb-hud__card--${color}`;
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

function emitControl(
  jump: boolean,
  bump: boolean,
  set: boolean,
  spike: boolean,
): void {
  if (props.snapshot.phase === 'crownAward' || props.snapshot.phase === 'finished') {
    emit('volleyball', {
      x: 0,
      y: 0,
      jump: false,
      bump: false,
      set: false,
      spike: false,
      aimX: null,
      aimZ: null,
    });
    return;
  }

  const steer = readSteer();
  const hasHit = bump || set || spike;
  // 出手優先用點擊落點；沒帶則用目前滑鼠指向
  const aimX = hasHit ? (pendingAimX ?? hoverAimX) : hoverAimX;
  const aimZ = hasHit ? (pendingAimZ ?? hoverAimZ) : hoverAimZ;

  emit('volleyball', {
    x: steer.x,
    y: steer.y,
    jump,
    bump,
    set,
    spike,
    aimX,
    aimZ,
  });

  if (hasHit) {
    pendingAimX = null;
    pendingAimZ = null;
  }
}

function pumpControls(): void {
  const jump = jumpQueued;
  const bump = bumpQueued;
  const set = setQueued;
  const spike = spikeQueued;
  jumpQueued = false;
  bumpQueued = false;
  setQueued = false;
  spikeQueued = false;
  emitControl(jump, bump, set, spike);
  pumpRafId = window.requestAnimationFrame(pumpControls);
}

function isOwnCourtSide(z: number): boolean {
  const teamId = props.snapshot.localTeamId;

  if (teamId === 'b') {
    return z > 0.12;
  }

  return z < -0.12;
}

function queueAimedHit(options: {
  bump?: boolean;
  set?: boolean;
  spike?: boolean;
  jump?: boolean;
  aimX: number;
  aimZ: number;
}): void {
  pendingAimX = options.aimX;
  pendingAimZ = options.aimZ;
  bumpQueued = bumpQueued || Boolean(options.bump);
  setQueued = setQueued || Boolean(options.set);
  spikeQueued = spikeQueued || Boolean(options.spike);
  jumpQueued = jumpQueued || Boolean(options.jump);
}

function onCourtAim(point: { x: number; z: number }): void {
  hoverAimX = point.x;
  hoverAimZ = point.z;
}

function onCourtClick(point: { x: number; z: number; button: number }): void {
  if (
    props.snapshot.phase === 'crownAward'
    || props.snapshot.phase === 'finished'
    || props.snapshot.phase === 'pointPause'
  ) {
    return;
  }

  hoverAimX = point.x;
  hoverAimZ = point.z;

  // 右鍵：對方場殺球（含起跳）
  if (point.button === 2) {
    if (isOwnCourtSide(point.z)) {
      return;
    }

    queueAimedHit({
      spike: true,
      jump: true,
      aimX: point.x,
      aimZ: point.z,
    });
    return;
  }

  // 左鍵：己方舉球／對方擊球（立刻出手，不再等雙擊）
  if (point.button !== 0) {
    return;
  }

  if (isOwnCourtSide(point.z)) {
    queueAimedHit({ set: true, aimX: point.x, aimZ: point.z });
    return;
  }

  queueAimedHit({ bump: true, aimX: point.x, aimZ: point.z });
}

function onContextMenu(event: Event): void {
  event.preventDefault();
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.repeat) {
    return;
  }

  const { code } = event;

  if (code === 'Space') {
    event.preventDefault();
    jumpQueued = true;
    return;
  }

  // 擊球改滑鼠點場地：不再吃 Z／X／C
  if (!STEER_CODES.has(code)) {
    return;
  }

  event.preventDefault();
  heldCodes.add(code);
}

function onKeyUp(event: KeyboardEvent): void {
  if (!STEER_CODES.has(event.code)) {
    return;
  }

  heldCodes.delete(event.code);
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
  emit('volleyball', {
    x: 0,
    y: 0,
    jump: false,
    bump: false,
    set: false,
    spike: false,
    aimX: null,
    aimZ: null,
  });
  window.clearTimeout(scoreFxHideTimer);
  window.clearTimeout(teammateSetHideTimer);
  window.clearTimeout(partyShoutHideTimer);
});
</script>

<template>
  <Teleport to="body">
    <section
      class="volleyball-play"
      :class="{ 'volleyball-play--crown-ceremony': showCrownCeremony }"
      @contextmenu="onContextMenu"
    >
      <VolleyballScene
        :snapshot="snapshot"
        @court-aim="onCourtAim"
        @court-click="onCourtClick"
      />

      <!-- 置中比分 -->
      <div
        v-if="!showCrownCeremony"
        class="vb-scoreboard game-chrome"
        :aria-label="volleyballCopy.scoreboardTitle"
      >
        <div class="vb-scoreboard__round font-game">{{ roundLabel }}</div>
        <div
          class="vb-scoreboard__score font-game"
          :class="{
            'vb-scoreboard__score--match-point': Boolean(snapshot.matchPointTeam),
            'vb-scoreboard__score--match-point-red': snapshot.matchPointTeam === 'a',
            'vb-scoreboard__score--match-point-blue': snapshot.matchPointTeam === 'b',
          }"
          aria-live="polite"
        >
          <span class="vb-scoreboard__side vb-scoreboard__side--red">{{ volleyballCopy.teamA }}</span>
          <span class="vb-scoreboard__num">{{ snapshot.scoreA }}</span>
          <span class="vb-scoreboard__colon">:</span>
          <span class="vb-scoreboard__num">{{ snapshot.scoreB }}</span>
          <span class="vb-scoreboard__side vb-scoreboard__side--blue">{{ volleyballCopy.teamB }}</span>
        </div>
        <p
          v-if="matchPointLabel"
          class="vb-scoreboard__match-point font-game"
          :class="snapshot.matchPointTeam === 'a'
            ? 'vb-scoreboard__match-point--red'
            : 'vb-scoreboard__match-point--blue'"
          aria-live="polite"
        >
          <span class="vb-scoreboard__match-point-title">{{ volleyballCopy.matchPointCallout }}</span>
          <span class="vb-scoreboard__match-point-cue">{{ volleyballCopy.matchPointCue }}</span>
          <span class="vb-scoreboard__match-point-side">{{ matchPointLabel }}</span>
        </p>
      </div>

      <!-- 紅方左欄 -->
      <aside
        v-if="!showCrownCeremony"
        class="vb-roster vb-roster--red game-chrome"
        :aria-label="volleyballCopy.teamA"
      >
        <p class="vb-roster__title font-game">{{ volleyballCopy.teamA }}</p>
        <ul class="vb-roster__list">
          <li
            v-for="row in teamARows"
            :key="row.participant.id"
            class="vb-hud__card"
            :class="[
              hudCardClass(row.participant.color),
              {
                'vb-hud__card--leader': row.isLeader,
                'vb-hud__card--local': row.participant.id === localParticipantId,
                'vb-hud__card--ball-owner': row.participant.id === snapshot.ballOwnerId,
              },
            ]"
          >
            <div class="vb-hud__portrait-wrap">
              <div class="vb-hud__portrait">
                <AnimalModelPreview
                  compact
                  :animal-id="row.participant.animalId"
                  :player-color="row.participant.color"
                />
              </div>
              <span class="vb-hud__slot font-game">{{ playerSlotLabel(row.slot) }}</span>
            </div>
            <div class="vb-hud__body">
              <span class="vb-hud__name">
                {{ row.participant.displayName }}
                <span
                  v-if="row.participant.id === localParticipantId"
                  class="vb-hud__you"
                >{{ volleyballCopy.localPlayerTag }}</span>
              </span>
              <div class="vb-hud__stats font-game">
                <span class="vb-hud__stat" :title="volleyballCopy.goalsLabel">
                  <VolleyballEventIcon
                    kind="goal"
                    size="sm"
                  />
                  {{ row.record.goals }}
                </span>
                <span class="vb-hud__stat">
                  <VolleyballEventIcon
                    kind="spike"
                    size="sm"
                  />
                  {{ row.record.spikes }}
                </span>
                <span class="vb-hud__stat">
                  <VolleyballEventIcon
                    kind="bump"
                    size="sm"
                  />
                  {{ row.record.bumps }}
                </span>
              </div>
            </div>
            <div class="vb-hud__crowns">
              <CuteCrownIcon
                size="md"
                :bounce="row.isLeader"
              />
              <span class="vb-hud__crown-count font-game">{{ row.participant.crownCount }}</span>
            </div>
          </li>
        </ul>
      </aside>

      <!-- 藍方右欄 -->
      <aside
        v-if="!showCrownCeremony"
        class="vb-roster vb-roster--blue game-chrome"
        :aria-label="volleyballCopy.teamB"
      >
        <p class="vb-roster__title font-game">{{ volleyballCopy.teamB }}</p>
        <ul class="vb-roster__list">
          <li
            v-for="row in teamBRows"
            :key="row.participant.id"
            class="vb-hud__card"
            :class="[
              hudCardClass(row.participant.color),
              {
                'vb-hud__card--leader': row.isLeader,
                'vb-hud__card--local': row.participant.id === localParticipantId,
                'vb-hud__card--ball-owner': row.participant.id === snapshot.ballOwnerId,
              },
            ]"
          >
            <div class="vb-hud__portrait-wrap">
              <div class="vb-hud__portrait">
                <AnimalModelPreview
                  compact
                  :animal-id="row.participant.animalId"
                  :player-color="row.participant.color"
                />
              </div>
              <span class="vb-hud__slot font-game">{{ playerSlotLabel(row.slot) }}</span>
            </div>
            <div class="vb-hud__body">
              <span class="vb-hud__name">
                {{ row.participant.displayName }}
                <span
                  v-if="row.participant.id === localParticipantId"
                  class="vb-hud__you"
                >{{ volleyballCopy.localPlayerTag }}</span>
              </span>
              <div class="vb-hud__stats font-game">
                <span class="vb-hud__stat" :title="volleyballCopy.goalsLabel">
                  <VolleyballEventIcon
                    kind="goal"
                    size="sm"
                  />
                  {{ row.record.goals }}
                </span>
                <span class="vb-hud__stat">
                  <VolleyballEventIcon
                    kind="spike"
                    size="sm"
                  />
                  {{ row.record.spikes }}
                </span>
                <span class="vb-hud__stat">
                  <VolleyballEventIcon
                    kind="bump"
                    size="sm"
                  />
                  {{ row.record.bumps }}
                </span>
              </div>
            </div>
            <div class="vb-hud__crowns">
              <CuteCrownIcon
                size="md"
                :bounce="row.isLeader"
              />
              <span class="vb-hud__crown-count font-game">{{ row.participant.crownCount }}</span>
            </div>
          </li>
        </ul>
      </aside>

      <div
        v-if="ballOwnerVisible && ballOwnerLabel && !showCrownCeremony && !partyShoutVisible"
        :key="snapshot.ballOwnerId ?? 'none'"
        class="volleyball-play__ball-callout font-game game-chrome"
        :class="ballOwnerIsLocal
          ? 'volleyball-play__ball-callout--yours'
          : 'volleyball-play__ball-callout--theirs'"
        aria-live="polite"
      >
        <span
          class="volleyball-play__ball-callout-star"
          aria-hidden="true"
        >★</span>
        <div class="volleyball-play__ball-callout-body">
          <span class="volleyball-play__ball-callout-title">{{ ballOwnerLabel }}</span>
          <span class="volleyball-play__ball-callout-cue">{{ ballOwnerCue }}</span>
        </div>
        <span
          class="volleyball-play__ball-callout-star volleyball-play__ball-callout-star--flip"
          aria-hidden="true"
        >★</span>
      </div>

      <div
        v-if="partyShoutVisible && !showCrownCeremony"
        class="volleyball-play__party-shout font-game game-chrome"
        :class="partyShoutKind === 'spike'
          ? 'volleyball-play__party-shout--spike'
          : 'volleyball-play__party-shout--nice'"
        aria-live="polite"
      >
        <span
          class="volleyball-play__party-shout-star"
          aria-hidden="true"
        >★</span>
        <div class="volleyball-play__party-shout-body">
          <span class="volleyball-play__party-shout-title">{{ partyShoutTitle }}</span>
          <span class="volleyball-play__party-shout-cue">{{ partyShoutCue }}</span>
        </div>
        <span
          class="volleyball-play__party-shout-star volleyball-play__party-shout-star--flip"
          aria-hidden="true"
        >★</span>
      </div>

      <p
        v-if="!showCrownCeremony"
        class="volleyball-play__status font-game game-chrome"
        :class="statusTeamClass"
      >
        {{ statusLabel }}
      </p>

      <div
        v-if="scoreFxVisible && !showCrownCeremony"
        class="volleyball-play__score-fx font-game game-chrome"
        :class="[
          `volleyball-play__score-fx--${scoreFxKind}`,
          isOutScoreFx
            ? 'volleyball-play__score-fx--out'
            : scoreFxTeam === 'a'
              ? 'volleyball-play__score-fx--red'
              : 'volleyball-play__score-fx--blue',
        ]"
        aria-live="polite"
      >
        <span
          class="volleyball-play__score-fx-star"
          aria-hidden="true"
        >{{ isOutScoreFx ? '✕' : '★' }}</span>
        <div class="volleyball-play__score-fx-body">
          <!-- 出界／撞網：大字當主角，比分退第二線 -->
          <template v-if="isOutScoreFx">
            <span class="volleyball-play__score-fx-label volleyball-play__score-fx-label--out-stamp">
              <VolleyballEventIcon
                kind="out"
                size="md"
              />
              {{ scoreFxLabel }}
            </span>
            <span
              v-if="scoreFxOutDetail"
              class="volleyball-play__score-fx-detail"
            >{{ scoreFxOutDetail }}</span>
            <p class="volleyball-play__score-fx-board volleyball-play__score-fx-board--out">
              <span class="volleyball-play__score-fx-num">{{ scoreFxBoardA }}</span>
              <span class="volleyball-play__score-fx-colon">:</span>
              <span class="volleyball-play__score-fx-num">{{ scoreFxBoardB }}</span>
            </p>
            <span class="volleyball-play__score-fx-cue">{{ scoreFxCue }}</span>
          </template>
          <template v-else>
            <p class="volleyball-play__score-fx-board">
              <span class="volleyball-play__score-fx-num">{{ scoreFxBoardA }}</span>
              <span class="volleyball-play__score-fx-colon">:</span>
              <span class="volleyball-play__score-fx-num">{{ scoreFxBoardB }}</span>
            </p>
            <span class="volleyball-play__score-fx-label">{{ scoreFxLabel }}</span>
            <span class="volleyball-play__score-fx-cue">{{ scoreFxCue }}</span>
          </template>
        </div>
        <span
          class="volleyball-play__score-fx-star volleyball-play__score-fx-star--flip"
          aria-hidden="true"
        >{{ isOutScoreFx ? '✕' : '★' }}</span>
      </div>

      <div
        v-if="teammateSetVisible && !showCrownCeremony"
        class="volleyball-play__teammate-set font-game game-chrome"
        aria-live="polite"
      >
        {{ volleyballCopy.teammateSetCue }}
      </div>

      <aside
        v-if="!showCrownCeremony"
        class="volleyball-play__controls game-chrome"
        aria-label="操作提示"
      >
        <p class="volleyball-play__controls-title font-game">
          {{ volleyballCopy.controlsTitle }}
        </p>
        <ul class="volleyball-play__controls-list font-game">
          <li>{{ volleyballCopy.skillMove }}</li>
          <li>{{ volleyballCopy.skillJump }}</li>
          <li>{{ volleyballCopy.skillBump }}</li>
          <li>{{ volleyballCopy.skillSpike }}</li>
          <li>{{ volleyballCopy.skillSet }}</li>
          <li>{{ volleyballCopy.skillAim }}</li>
        </ul>
      </aside>

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
          {{ volleyballCopy.crownCeremonyTitle }}
        </p>
        <p class="crown-ceremony__message font-game text-title">
          {{ crownCeremonyMessage }}
        </p>
      </div>
    </section>
  </Teleport>
</template>

<style lang="scss" scoped>
.volleyball-play {
  position: fixed;
  inset: 0;
  z-index: 200;
  overflow: hidden;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--color-player-3) 70%, var(--color-text-heading) 12%) 0%,
    color-mix(in srgb, var(--color-bg) 82%, var(--color-accent)) 55%,
    var(--color-bg-end) 100%
  );

  &--crown-ceremony {
    background: linear-gradient(180deg, rgba(88, 76, 118, 0.92), rgba(46, 38, 64, 0.96));
  }
}

.volleyball-play :deep(.volleyball-scene-root) {
  position: absolute;
  inset: 0;
  z-index: 1;
}

.volleyball-play :deep(.volleyball-scene) {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  outline: none;
  touch-action: none;
}

.vb-scoreboard {
  position: absolute;
  top: calc(var(--space-sm) + env(safe-area-inset-top));
  left: 50%;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  transform: translateX(-50%);
  pointer-events: none;
}

.vb-scoreboard__round {
  padding: var(--space-xs) var(--space-md);
  border: 3px solid var(--color-on-accent);
  border-radius: var(--radius-full);
  background: var(--color-accent);
  font-size: var(--font-size-xs);
  color: var(--color-on-accent);
  box-shadow: 3px 3px 0 color-mix(in srgb, var(--color-text-heading) 35%, transparent);
}

.vb-scoreboard__score {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  min-width: min(24rem, 78vw);
  padding: var(--space-sm) var(--space-xl);
  border: 4px solid var(--color-on-accent);
  border-radius: var(--radius-lg);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--color-player-1) 38%, white) 0%,
    var(--color-surface-solid) 45%,
    color-mix(in srgb, var(--color-player-3) 38%, white) 100%
  );
  box-shadow: 0 var(--space-sm) 0 color-mix(in srgb, var(--color-text-heading) 28%, transparent);
  animation: vb-scoreboard-idle 2.4s ease-in-out infinite;

  &--match-point {
    animation: vb-scoreboard-match-point 0.9s ease-in-out infinite;
  }

  &--match-point-red {
    box-shadow:
      0 var(--space-sm) 0 color-mix(in srgb, var(--color-player-1) 45%, transparent),
      0 0 0 3px color-mix(in srgb, var(--color-warning) 55%, white);
  }

  &--match-point-blue {
    box-shadow:
      0 var(--space-sm) 0 color-mix(in srgb, var(--color-player-3) 45%, transparent),
      0 0 0 3px color-mix(in srgb, var(--color-warning) 55%, white);
  }
}

.vb-scoreboard__side {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.1em;
  -webkit-text-stroke: 1px var(--color-on-accent);
  paint-order: stroke fill;

  &--red {
    color: var(--color-player-1);
  }

  &--blue {
    color: var(--color-player-3);
  }
}

.vb-scoreboard__num {
  min-width: 1.2em;
  font-size: var(--font-size-3xl);
  line-height: 1;
  text-align: center;
  color: var(--color-text-heading);
  text-shadow:
    2px 2px 0 color-mix(in srgb, var(--color-warning) 40%, white),
    -1px -1px 0 var(--color-on-accent);
  transform: scale(1.08);
}

.vb-scoreboard__colon {
  font-size: var(--font-size-2xl);
  color: var(--color-text-heading);
}

.vb-scoreboard__match-point {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: var(--space-xs) var(--space-sm);
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.08em;
  pointer-events: none;
  -webkit-text-stroke: 1px var(--color-on-accent);
  paint-order: stroke fill;
  text-shadow:
    2px 2px 0 var(--color-bg),
    -1px -1px 0 var(--color-on-accent),
    1px -1px 0 var(--color-on-accent),
    -1px 1px 0 var(--color-on-accent),
    1px 1px 0 var(--color-on-accent);
  animation: vb-match-point-wobble 1s ease-in-out infinite;

  &--red {
    color: var(--color-player-1);
  }

  &--blue {
    color: var(--color-player-3);
  }
}

.vb-scoreboard__match-point-title {
  font-size: var(--font-size-xl);
}

.vb-scoreboard__match-point-cue {
  font-size: var(--font-size-md);
  color: var(--color-warning);
}

.vb-scoreboard__match-point-side {
  font-size: var(--font-size-sm);
}

.vb-roster {
  position: absolute;
  top: calc(var(--space-xl) + var(--space-lg) + env(safe-area-inset-top));
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  width: min(14rem, 42vw);
  pointer-events: none;

  &--red {
    left: calc(var(--space-md) + env(safe-area-inset-left));
  }

  &--blue {
    right: calc(var(--space-md) + env(safe-area-inset-right));
  }
}

.vb-roster__title {
  margin: 0;
  padding: var(--space-xs) var(--space-sm);
  border: 3px solid var(--color-on-accent);
  border-radius: var(--radius-full);
  font-size: var(--font-size-sm);
  letter-spacing: 0.08em;
  text-align: center;
  color: var(--color-on-accent);

  .vb-roster--red & {
    background: color-mix(in srgb, var(--color-player-1) 82%, black);
    box-shadow: 3px 3px 0 color-mix(in srgb, var(--color-player-1) 40%, transparent);
  }

  .vb-roster--blue & {
    background: color-mix(in srgb, var(--color-player-3) 82%, black);
    box-shadow: 3px 3px 0 color-mix(in srgb, var(--color-player-3) 40%, transparent);
  }
}

.vb-roster__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.vb-hud__card {
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
}

.vb-hud__portrait-wrap {
  position: relative;
  width: 3.5rem;
  height: 3.5rem;
  flex-shrink: 0;
}

.vb-hud__portrait {
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 3px solid color-mix(in srgb, var(--hud-tone) 55%, white);
  border-radius: 50%;
  background: color-mix(in srgb, var(--hud-tone) 14%, white);

  :deep(.animal-preview__canvas) {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: transparent;
  }
}

.vb-hud__slot {
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
  transform: translate(-20%, 20%);
}

.vb-hud__body {
  min-width: 0;
}

.vb-hud__name {
  display: block;
  overflow: hidden;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-heading);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vb-hud__stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  margin-top: var(--space-xs);
}

.vb-hud__stat {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--font-size-xs);
  color: var(--color-text-heading);
}

.vb-hud__you {
  margin-left: 2px;
  padding: 0 var(--space-xs);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-accent) 18%, transparent);
  font-size: var(--font-size-xs);
  color: var(--color-accent);
}

.vb-hud__card--ball-owner {
  outline: 4px solid var(--color-warning);
  outline-offset: 2px;
  box-shadow:
    0 0 0 5px color-mix(in srgb, var(--color-warning) 42%, transparent),
    3px 3px 0 color-mix(in srgb, var(--hud-tone) 42%, transparent);
  animation: vb-ball-owner-pulse 0.85s ease-in-out infinite;
  transform: scale(1.03);
}

.vb-hud__crowns {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  min-width: 2.25rem;
}

.vb-hud__crown-count {
  font-size: var(--font-size-2xl);
  line-height: 1;
  color: var(--color-text-heading);
}

/* 派對風呼叫：無底框、粗描邊字、彈跳星星（見 docs/party-ui-callout.md） */
.volleyball-play__ball-callout {
  position: absolute;
  top: calc(20% + env(safe-area-inset-top) * 0.25);
  left: 50%;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  pointer-events: none;
  transform: translateX(-50%);
  animation: vb-ball-callout-pop 0.7s cubic-bezier(0.22, 1.4, 0.36, 1) both;

  &--yours {
    color: var(--color-accent);

    .volleyball-play__ball-callout-star {
      color: var(--color-warning);
    }
  }

  &--theirs {
    color: var(--color-warning);

    .volleyball-play__ball-callout-star {
      color: var(--color-success);
    }
  }
}

.volleyball-play__ball-callout-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.volleyball-play__ball-callout-title,
.volleyball-play__ball-callout-cue {
  display: block;
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
  text-align: center;
  /* 粗白描邊 + 深色落影，派對字卡感 */
  -webkit-text-stroke: 1px var(--color-on-accent);
  paint-order: stroke fill;
  text-shadow:
    3px 3px 0 var(--color-bg),
    -2px -2px 0 var(--color-on-accent),
    2px -2px 0 var(--color-on-accent),
    -2px 2px 0 var(--color-on-accent),
    2px 2px 0 var(--color-on-accent),
    0 -2px 0 var(--color-on-accent),
    0 2px 0 var(--color-on-accent),
    -2px 0 0 var(--color-on-accent),
    2px 0 0 var(--color-on-accent);
}

.volleyball-play__ball-callout-title {
  font-size: var(--font-size-3xl);
  letter-spacing: 0.06em;
  animation: vb-ball-callout-wobble 1.1s ease-in-out 0.7s infinite;
}

.volleyball-play__ball-callout-cue {
  font-size: var(--font-size-xl);
  letter-spacing: 0.16em;
  animation: vb-ball-callout-cue-bounce 0.85s ease-in-out 0.85s infinite;
}

.volleyball-play__ball-callout-star {
  display: block;
  font-size: var(--font-size-2xl);
  line-height: 1;
  -webkit-text-stroke: 1px var(--color-on-accent);
  text-shadow: 2px 2px 0 var(--color-bg);
  animation: vb-ball-callout-star-spin 1.2s ease-in-out infinite;

  &--flip {
    animation-delay: 0.2s;
    animation-direction: reverse;
  }
}

.volleyball-play__party-shout {
  position: absolute;
  top: calc(24% + env(safe-area-inset-top) * 0.2);
  left: 50%;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  pointer-events: none;
  transform: translateX(-50%);
  animation: vb-party-shout-pop 0.85s cubic-bezier(0.22, 1.45, 0.36, 1) both;

  &--spike {
    color: var(--color-accent);

    .volleyball-play__party-shout-star {
      color: var(--color-warning);
    }
  }

  &--nice {
    color: var(--color-success);

    .volleyball-play__party-shout-star {
      color: var(--color-warning);
    }
  }
}

.volleyball-play__party-shout-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
}

.volleyball-play__party-shout-title,
.volleyball-play__party-shout-cue {
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.08em;
  -webkit-text-stroke: 1px var(--color-on-accent);
  paint-order: stroke fill;
  text-shadow:
    3px 3px 0 var(--color-bg),
    -2px -2px 0 var(--color-on-accent),
    2px -2px 0 var(--color-on-accent),
    -2px 2px 0 var(--color-on-accent),
    2px 2px 0 var(--color-on-accent);
}

.volleyball-play__party-shout-title {
  font-size: var(--font-size-3xl);
  animation: vb-ball-callout-wobble 0.9s ease-in-out 0.55s infinite;
}

.volleyball-play__party-shout-cue {
  font-size: var(--font-size-lg);
  color: var(--color-warning);
  animation: vb-ball-callout-cue-bounce 0.75s ease-in-out 0.65s infinite;
}

.volleyball-play__party-shout-star {
  font-size: var(--font-size-2xl);
  animation: vb-ball-callout-star-spin 0.9s ease-in-out infinite;

  &--flip {
    animation-delay: 0.15s;
    animation-direction: reverse;
  }
}

@keyframes vb-scoreboard-idle {
  0%,
  100% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.015);
  }
}

@keyframes vb-scoreboard-match-point {
  0%,
  100% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.04);
  }
}

@keyframes vb-match-point-wobble {
  0%,
  100% {
    transform: rotate(-1.5deg);
  }

  50% {
    transform: rotate(1.5deg);
  }
}

@keyframes vb-ball-owner-pulse {
  0%,
  100% {
    outline-color: var(--color-warning);
  }

  50% {
    outline-color: color-mix(in srgb, var(--color-warning) 55%, white);
  }
}

@keyframes vb-party-shout-pop {
  0% {
    opacity: 0;
    transform: translate(-50%, -18%) scale(0.4) rotate(-10deg);
  }

  45% {
    opacity: 1;
    transform: translate(-50%, 0) scale(1.18) rotate(3deg);
  }

  100% {
    opacity: 1;
    transform: translate(-50%, 0) scale(1) rotate(0deg);
  }
}

@keyframes vb-ball-callout-pop {
  0% {
    opacity: 0;
    transform: translate(-50%, -20%) scale(0.35) rotate(-12deg);
  }

  55% {
    opacity: 1;
    transform: translate(-50%, 4%) scale(1.18) rotate(4deg);
  }

  78% {
    transform: translate(-50%, -2%) scale(0.94) rotate(-2deg);
  }

  100% {
    opacity: 1;
    transform: translate(-50%, 0) scale(1) rotate(0deg);
  }
}

@keyframes vb-ball-callout-wobble {
  0%,
  100% {
    transform: rotate(-2deg) scale(1);
  }

  50% {
    transform: rotate(2.5deg) scale(1.05);
  }
}

@keyframes vb-ball-callout-cue-bounce {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }

  40% {
    transform: translateY(-4px) scale(1.08);
  }

  70% {
    transform: translateY(2px) scale(0.98);
  }
}

@keyframes vb-ball-callout-star-spin {
  0%,
  100% {
    transform: scale(1) rotate(-8deg);
  }

  50% {
    transform: scale(1.25) rotate(12deg);
  }
}

.volleyball-play__status {
  position: absolute;
  top: calc(var(--space-md) + env(safe-area-inset-top));
  left: calc(var(--space-md) + env(safe-area-inset-left));
  z-index: 3;
  max-width: min(48vw, 12rem);
  margin: 0;
  padding: var(--space-sm) var(--space-md);
  border: 3px solid rgba(255, 255, 255, 0.92);
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.9);
  color: var(--color-text-heading);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  pointer-events: none;

  &--red {
    border-color: var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 18%, white);
    color: var(--color-accent);
  }

  &--blue {
    border-color: var(--color-player-3);
    background: color-mix(in srgb, var(--color-player-3) 18%, white);
    color: var(--color-player-3);
  }

  &--out {
    border-color: var(--color-warning);
    background: color-mix(in srgb, var(--color-warning) 22%, white);
    color: var(--color-warning);
  }
}

/* 隊友舉球：同派對字卡規範（無底框） */
.volleyball-play__teammate-set {
  position: absolute;
  top: 36%;
  left: 50%;
  z-index: 5;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-warning);
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.1em;
  pointer-events: none;
  transform: translate(-50%, -50%);
  -webkit-text-stroke: 1px var(--color-on-accent);
  paint-order: stroke fill;
  text-shadow:
    3px 3px 0 var(--color-bg),
    -2px -2px 0 var(--color-on-accent),
    2px -2px 0 var(--color-on-accent),
    -2px 2px 0 var(--color-on-accent),
    2px 2px 0 var(--color-on-accent);
  animation: vb-teammate-set-pop 1.15s cubic-bezier(0.22, 1.4, 0.36, 1) both;
}

@keyframes vb-teammate-set-pop {
  0% {
    opacity: 0;
    transform: translate(-50%, -30%) scale(0.4) rotate(-8deg);
  }

  45% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.16) rotate(3deg);
  }

  70% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1) rotate(0deg);
  }

  100% {
    opacity: 0;
    transform: translate(-50%, -58%) scale(1.04) rotate(0deg);
  }
}

/* 得分：紅隊紅／藍隊藍 + 大比分彈出（跟「誰的球」紫／黃分開） */
.volleyball-play__score-fx {
  position: absolute;
  top: 36%;
  left: 50%;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  pointer-events: none;
  transform: translate(-50%, -50%);
  animation: vb-score-fx-pop 1.15s cubic-bezier(0.22, 1.4, 0.36, 1) both;

  &--red {
    color: var(--color-player-1);
  }

  &--blue {
    color: var(--color-player-3);
  }

  /* 出界用警告色＋抖動，要比一般得分更搶眼 */
  &--out {
    color: var(--color-warning);
    animation: vb-score-fx-out 1.5s cubic-bezier(0.22, 1.4, 0.36, 1) both;

    .volleyball-play__score-fx-star {
      font-size: var(--font-size-3xl);
      animation: vb-score-fx-out-spin 0.55s steps(2) infinite;
    }
  }

  &--spike-kill {
    animation: vb-score-fx-spike 1.55s cubic-bezier(0.22, 1.5, 0.36, 1) both;

    .volleyball-play__score-fx-board {
      animation-duration: 1.55s;
    }

    .volleyball-play__score-fx-num {
      transform: scale(1.85);
    }

    .volleyball-play__score-fx-label {
      font-size: var(--font-size-3xl);
      letter-spacing: 0.1em;
    }

    .volleyball-play__score-fx-cue {
      font-size: var(--font-size-2xl);
      color: var(--color-warning);
    }

    .volleyball-play__score-fx-star {
      font-size: var(--font-size-3xl);
      color: var(--color-warning);
    }
  }
}

.volleyball-play__score-fx-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
}

.volleyball-play__score-fx-board {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: var(--space-sm);
  margin: 0;
  line-height: 1;
  animation: vb-score-fx-board-pop 1.15s cubic-bezier(0.22, 1.55, 0.36, 1) both;
}

.volleyball-play__score-fx-num,
.volleyball-play__score-fx-colon,
.volleyball-play__score-fx-label,
.volleyball-play__score-fx-cue {
  font-weight: var(--font-weight-bold);
  -webkit-text-stroke: 1px var(--color-on-accent);
  paint-order: stroke fill;
  text-shadow:
    3px 3px 0 var(--color-bg),
    -2px -2px 0 var(--color-on-accent),
    2px -2px 0 var(--color-on-accent),
    -2px 2px 0 var(--color-on-accent),
    2px 2px 0 var(--color-on-accent);
}

.volleyball-play__score-fx-num {
  display: block;
  font-size: var(--font-size-3xl);
  letter-spacing: 0.04em;
  transform: scale(1.55);
  transform-origin: center bottom;
}

.volleyball-play__score-fx-colon {
  display: block;
  font-size: var(--font-size-3xl);
  transform: scale(1.35);
  transform-origin: center bottom;
}

.volleyball-play__score-fx-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  font-size: var(--font-size-2xl);
  letter-spacing: 0.1em;
  line-height: var(--line-height-tight);
  text-align: center;

  &--out-stamp {
    font-size: var(--font-size-3xl);
    letter-spacing: 0.18em;
    animation: vb-score-fx-out-stamp 1.5s cubic-bezier(0.22, 1.55, 0.36, 1) both;
  }
}

.volleyball-play__score-fx-detail {
  display: block;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.08em;
  line-height: var(--line-height-tight);
  text-align: center;
  -webkit-text-stroke: 1px var(--color-on-accent);
  paint-order: stroke fill;
  text-shadow:
    3px 3px 0 var(--color-bg),
    -2px -2px 0 var(--color-on-accent),
    2px -2px 0 var(--color-on-accent),
    -2px 2px 0 var(--color-on-accent),
    2px 2px 0 var(--color-on-accent);
}

.volleyball-play__score-fx-board--out {
  gap: var(--space-xs);

  .volleyball-play__score-fx-num,
  .volleyball-play__score-fx-colon {
    font-size: var(--font-size-2xl);
    transform: scale(1.15);
  }
}

.volleyball-play__score-fx-cue {
  display: block;
  font-size: var(--font-size-lg);
  letter-spacing: 0.14em;
  line-height: var(--line-height-tight);
  text-align: center;
}

.volleyball-play__score-fx-star {
  display: block;
  font-size: var(--font-size-2xl);
  line-height: 1;
  color: inherit;
  -webkit-text-stroke: 1px var(--color-on-accent);
  text-shadow: 2px 2px 0 var(--color-bg);
  animation: vb-ball-callout-star-spin 1.1s ease-in-out infinite;

  &--flip {
    animation-delay: 0.15s;
    animation-direction: reverse;
  }
}

@keyframes vb-score-fx-board-pop {
  0% {
    transform: scale(0.2);
    opacity: 0;
  }

  50% {
    transform: scale(1.2);
    opacity: 1;
  }

  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes vb-score-fx-pop {
  0% {
    opacity: 0;
    transform: translate(-50%, -40%) scale(0.35) rotate(-10deg);
  }

  45% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.2) rotate(4deg);
  }

  70% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1) rotate(0deg);
  }

  100% {
    opacity: 0;
    transform: translate(-50%, -58%) scale(1.06) rotate(0deg);
  }
}

@keyframes vb-score-fx-spike {
  0% {
    opacity: 0;
    transform: translate(-50%, -40%) scale(0.3) rotate(-14deg);
  }

  20% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.32) rotate(5deg);
  }

  45% {
    transform: translate(-50%, -50%) scale(0.96) rotate(-3deg);
  }

  75% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.06) rotate(0deg);
  }

  100% {
    opacity: 0;
    transform: translate(-50%, -62%) scale(1.12) rotate(0deg);
  }
}

@keyframes vb-score-fx-out {
  0% {
    opacity: 0;
    transform: translate(-50%, -42%) scale(0.25) rotate(-18deg);
  }

  18% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.4) rotate(6deg);
  }

  32% {
    transform: translate(calc(-50% - 10px), -50%) scale(1.08) rotate(-4deg);
  }

  46% {
    transform: translate(calc(-50% + 10px), -50%) scale(1.12) rotate(4deg);
  }

  60% {
    transform: translate(calc(-50% - 6px), -50%) scale(1.04) rotate(-2deg);
  }

  78% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.08) rotate(0deg);
  }

  100% {
    opacity: 0;
    transform: translate(-50%, -64%) scale(1.14) rotate(0deg);
  }
}

@keyframes vb-score-fx-out-stamp {
  0% {
    transform: scale(0.2) rotate(-12deg);
    opacity: 0;
  }

  35% {
    transform: scale(1.28) rotate(3deg);
    opacity: 1;
  }

  100% {
    transform: scale(1) rotate(0deg);
    opacity: 1;
  }
}

@keyframes vb-score-fx-out-spin {
  0% {
    transform: scale(1) rotate(-8deg);
  }

  50% {
    transform: scale(1.2) rotate(8deg);
  }

  100% {
    transform: scale(1) rotate(-8deg);
  }
}

.volleyball-play__controls {
  position: absolute;
  bottom: calc(var(--space-md) + env(safe-area-inset-bottom));
  right: calc(var(--space-md) + env(safe-area-inset-right));
  z-index: 3;
  max-width: min(42vw, 11.5rem);
  margin: 0;
  padding: 0;
  pointer-events: none;
}

.volleyball-play__controls-title {
  margin: 0 0 var(--space-xs);
  color: var(--color-accent);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.12em;
  -webkit-text-stroke: 1px var(--color-on-accent);
  paint-order: stroke fill;
  text-shadow: 2px 2px 0 var(--color-bg);
}

.volleyball-play__controls-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--color-text-heading);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-tight);
  text-shadow:
    1px 1px 0 var(--color-on-accent),
    2px 2px 0 var(--color-bg);

  li {
    margin: 0;
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
}

.crown-ceremony__kicker {
  position: relative;
  margin: 0;
  font-size: var(--font-size-lg);
  letter-spacing: 0.12em;
  color: #f5f0e8;
}

.crown-ceremony__message {
  position: relative;
  margin: 0;
  padding: 0 var(--space-md);
  font-size: var(--font-size-2xl);
  line-height: var(--line-height-tight);
  text-align: center;
  color: var(--color-warning);
}
</style>
