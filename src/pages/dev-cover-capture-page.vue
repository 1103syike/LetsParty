<script setup lang="ts">
/**
 * 開發用：真實場景截成 loading 輪播圖（文案在 loading UI，不燒進圖）
 * /dev/cover-capture/:gameId/:slideIndex
 */
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import { useRoute } from 'vue-router';

import { ARENA_BUMP_ID } from '@/minigames/arena-bump/arena-bump-id';
import { ArenaBumpGame, type ArenaBumpSnapshot } from '@/minigames/arena-bump/arena-bump';
import ArenaBumpScene from '@/minigames/arena-bump/arena-bump-scene.vue';
import { ROCK_PAPER_SCISSORS_ID } from '@/minigames/rock-paper-scissors';
import {
  RockPaperScissorsGame,
  type RockPaperScissorsSnapshot,
} from '@/minigames/rock-paper-scissors/rock-paper-scissors';
import RockPaperScissorsScene from '@/minigames/rock-paper-scissors/rock-paper-scissors-scene.vue';
import { VolleyballGame, type VolleyballSnapshot } from '@/minigames/volleyball/volleyball';
import { VOLLEYBALL_ID } from '@/minigames/volleyball/volleyball-id';
import VolleyballScene from '@/minigames/volleyball/volleyball-scene.vue';
import { usePartyStore } from '@/stores/party-store';
import type { AnimalId } from '@/types/animal';
import type { Participant } from '@/types/party';
import type { RpsChoice } from '@/types/player-input';

declare global {
  interface Window {
    __COVER_CAPTURE__?: {
      ready: boolean;
      gameId: string;
      slideIndex: number;
    };
  }
}

const COVER_ANIMALS: AnimalId[] = ['pig', 'cat', 'raccoon', 'chicken'];
const CHOICES: RpsChoice[] = ['rock', 'paper', 'scissors', 'rock'];

const route = useRoute();
const partyStore = usePartyStore();

const gameId = computed(() => String(route.params.gameId ?? ''));
const slideIndex = computed(() => {
  const raw = Number(route.params.slideIndex ?? 0);
  return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
});

const rpsSnapshot = shallowRef<RockPaperScissorsSnapshot | null>(null);
const arenaSnapshot = shallowRef<ArenaBumpSnapshot | null>(null);
const volleyballSnapshot = shallowRef<VolleyballSnapshot | null>(null);
const statusText = ref('準備場景…');

let settleTimerId: number | null = null;

function buildParticipants(): Participant[] {
  const colors = ['player-1', 'player-2', 'player-3', 'player-4'] as const;

  return COVER_ANIMALS.map((animalId, index) => ({
    id: index === 0 ? 'host-local' : `cpu-${index}`,
    displayName: index === 0 ? 'Host' : `CPU${index}`,
    kind: index === 0 ? 'human' : 'cpu',
    color: colors[index],
    animalId,
    crownCount: index === 0 ? 2 : 1,
  }));
}

function seedParty(participants: Participant[]): void {
  partyStore.$patch({
    roomId: 'cover-capture',
    isHost: true,
    localParticipantId: participants[0]!.id,
    participants,
  });
}

function emptyRpsResults(ids: string[]): Record<string, 'win' | 'lose' | 'tie' | null> {
  const results: Record<string, 'win' | 'lose' | 'tie' | null> = {};

  for (const id of ids) {
    results[id] = null;
  }

  return results;
}

function prepareRps(participants: Participant[], slide: number): void {
  const ids = participants.map((participant) => participant.id);
  const game = new RockPaperScissorsGame(ids);
  game.start();

  const tickCount = 20 + (slide % 4) * 18;

  for (let step = 0; step < tickCount; step += 1) {
    game.onTick(50);
  }

  // 多數 slide：漫遊 + 唬爛對話框
  if (slide <= 7) {
    for (let index = 0; index < ids.length; index += 1) {
      if (slide >= 4 || index < 3) {
        game.onPlayerInput(ids[index]!, {
          type: 'rps-claim',
          choice: CHOICES[(index + slide) % CHOICES.length]!,
        });
      }
    }

    if (slide >= 4) {
      for (let index = 0; index < ids.length; index += 1) {
        game.onPlayerInput(ids[index]!, {
          type: 'rps',
          choice: CHOICES[(index + 1) % CHOICES.length]!,
        });
      }
    }

    rpsSnapshot.value = game.getSnapshot(ids[0]!);
    return;
  }

  // 分鏡／揭曉／皇冠：直接組 snapshot（避免等漫遊倒數）
  const choices: Record<string, RpsChoice | null> = {};
  const claims: Record<string, RpsChoice | null> = {};

  for (let index = 0; index < ids.length; index += 1) {
    choices[ids[index]!] = CHOICES[index % CHOICES.length]!;
    claims[ids[index]!] = null;
  }

  if (slide === 8) {
    rpsSnapshot.value = {
      phase: 'focus',
      roamingSecondsLeft: 0,
      choices,
      claims,
      results: emptyRpsResults(ids),
      showResults: false,
      isSplitView: true,
      isCrownCeremony: false,
      crownWinnerIds: [],
      crownAwardDurationMs: 3200,
    };
    return;
  }

  if (slide === 9 || slide === 10) {
    const results = emptyRpsResults(ids);
    results[ids[0]!] = 'win';
    results[ids[1]!] = 'lose';
    results[ids[2]!] = 'lose';
    results[ids[3]!] = 'tie';

    rpsSnapshot.value = {
      phase: 'reveal',
      roamingSecondsLeft: 0,
      choices,
      claims,
      results,
      showResults: true,
      isSplitView: true,
      isCrownCeremony: false,
      crownWinnerIds: [ids[0]!],
      crownAwardDurationMs: 3200,
    };
    return;
  }

  rpsSnapshot.value = {
    phase: 'crownAward',
    roamingSecondsLeft: 0,
    choices,
    claims,
    results: {
      [ids[0]!]: 'win',
      [ids[1]!]: 'lose',
      [ids[2]!]: 'lose',
      [ids[3]!]: 'lose',
    },
    showResults: true,
    isSplitView: false,
    isCrownCeremony: true,
    crownWinnerIds: [ids[0]!],
    crownAwardDurationMs: 3200,
  };
}

function cloneArenaFighters(base: ArenaBumpSnapshot): ArenaBumpSnapshot['fighters'] {
  return base.fighters.map((fighter) => ({ ...fighter }));
}

function prepareArena(participants: Participant[], slide: number): void {
  const localId = participants[0]!.id;
  const game = new ArenaBumpGame(participants, localId);
  game.start();

  // 先跑到 playing，再依 slide 改 snapshot 對齊教學
  const ticks = slide <= 1 ? 30 + slide * 25 : 140 + (slide % 3) * 20;

  for (let step = 0; step < ticks; step += 1) {
    game.onTick(50);
  }

  const base = game.getGameSnapshot();
  const fighters = cloneArenaFighters(base);
  const winnerId = fighters[0]?.id ?? localId;

  if (slide === 0) {
    arenaSnapshot.value = {
      ...base,
      phase: 'countdown',
      countdownSecondsLeft: 3,
      showCountdownGo: false,
      secondsLeft: 60,
      aliveCount: fighters.length,
      fighters,
      localAlive: true,
      isCrownCeremony: false,
      winnerId: null,
      crownWinnerIds: [],
    };
    return;
  }

  if (slide === 1) {
    arenaSnapshot.value = {
      ...base,
      phase: 'playing',
      countdownSecondsLeft: 0,
      showCountdownGo: true,
      secondsLeft: 60,
      aliveCount: fighters.length,
      fighters,
      localAlive: true,
      isCrownCeremony: false,
      winnerId: null,
      crownWinnerIds: [],
    };
    return;
  }

  // 2–3：移動／跳躍
  if (slide === 2 || slide === 3) {
    fighters.forEach((fighter, index) => {
      fighter.x = Math.cos((index / fighters.length) * Math.PI * 2) * (1.2 + slide * 0.2);
      fighter.z = Math.sin((index / fighters.length) * Math.PI * 2) * (1.2 + slide * 0.2);
      fighter.vx = Math.cos(index) * 2.2;
      fighter.vz = Math.sin(index) * 2.2;
      fighter.isJumping = slide === 3 && index % 2 === 0;
      fighter.isCharging = false;
      fighter.alive = true;
    });

    arenaSnapshot.value = {
      ...base,
      phase: 'playing',
      showCountdownGo: false,
      fighters,
      aliveCount: fighters.length,
      localAlive: true,
      isCrownCeremony: false,
      winnerId: null,
      crownWinnerIds: [],
    };
    return;
  }

  // 4–5：蓄力踢／空中踢
  if (slide === 4 || slide === 5) {
    fighters.forEach((fighter, index) => {
      fighter.alive = true;
      fighter.isCharging = index === 0 || index === 2;
      fighter.chargeReady = fighter.isCharging;
      fighter.isJumping = slide === 5 && index === 0;
      fighter.x = index === 0 ? 0.4 : -0.8 + index * 0.55;
      fighter.z = index === 0 ? 0.2 : 0.6 - index * 0.35;
    });

    arenaSnapshot.value = {
      ...base,
      phase: 'playing',
      showCountdownGo: false,
      fighters,
      aliveCount: fighters.length,
      localChargeReady: true,
      localChargeCooldownSeconds: 0,
      localAlive: true,
      isCrownCeremony: false,
      winnerId: null,
      crownWinnerIds: [],
      hitSerial: base.hitSerial + 1,
      hits: [
        {
          x: 0.2,
          z: 0.1,
          kind: 'charge',
          attackerId: fighters[0]!.id,
          victimId: fighters[1]!.id,
        },
      ],
    };
    return;
  }

  // 6–7：被踢飛／貼邊
  if (slide === 6 || slide === 7) {
    fighters.forEach((fighter, index) => {
      fighter.alive = true;
      fighter.isCharging = false;
      fighter.isJumping = false;

      if (slide === 6 && index === 1) {
        fighter.x = 2.6;
        fighter.z = 0.4;
        fighter.vx = 9;
        fighter.vz = 2;
      } else if (slide === 7) {
        fighter.x = 2.1 + (index % 2) * 0.15;
        fighter.z = -0.3 + index * 0.2;
      } else {
        fighter.x = -0.6 + index * 0.4;
        fighter.z = 0.3 - index * 0.15;
      }
    });

    arenaSnapshot.value = {
      ...base,
      phase: 'playing',
      showCountdownGo: false,
      fighters,
      aliveCount: fighters.length,
      localAlive: true,
      isCrownCeremony: false,
      winnerId: null,
      crownWinnerIds: [],
    };
    return;
  }

  // 8：互撞擠位
  if (slide === 8) {
    fighters.forEach((fighter, index) => {
      fighter.alive = true;
      fighter.x = (index % 2 === 0 ? -0.35 : 0.35) + index * 0.05;
      fighter.z = (index < 2 ? -0.2 : 0.25);
      fighter.vx = index % 2 === 0 ? 1.5 : -1.5;
      fighter.vz = 0.4;
    });

    arenaSnapshot.value = {
      ...base,
      phase: 'playing',
      showCountdownGo: false,
      fighters,
      aliveCount: fighters.length,
      localAlive: true,
      isCrownCeremony: false,
      winnerId: null,
      crownWinnerIds: [],
      hitSerial: base.hitSerial + 2,
      hits: [
        {
          x: 0,
          z: 0,
          kind: 'bump',
          attackerId: fighters[0]!.id,
          victimId: fighters[2]!.id,
        },
      ],
    };
    return;
  }

  // 9：出局觀戰
  if (slide === 9) {
    fighters.forEach((fighter, index) => {
      fighter.alive = index !== 0;
      fighter.fallOrder = index === 0 ? 1 : 0;
      fighter.x = index === 0 ? 3.4 : Math.cos(index) * 1.1;
      fighter.z = index === 0 ? 0.2 : Math.sin(index) * 1.1;
    });

    arenaSnapshot.value = {
      ...base,
      phase: 'playing',
      showCountdownGo: false,
      fighters,
      aliveCount: fighters.filter((fighter) => fighter.alive).length,
      localAlive: false,
      isCrownCeremony: false,
      winnerId: null,
      crownWinnerIds: [],
    };
    return;
  }

  // 10：只剩一人
  if (slide === 10) {
    fighters.forEach((fighter, index) => {
      fighter.alive = index === 0;
      fighter.fallOrder = index === 0 ? 0 : index;
      fighter.x = index === 0 ? 0.2 : 3.2 + index * 0.2;
      fighter.z = index === 0 ? 0 : index * 0.15;
    });

    arenaSnapshot.value = {
      ...base,
      phase: 'playing',
      showCountdownGo: false,
      fighters,
      aliveCount: 1,
      localAlive: true,
      winnerId: winnerId,
      isCrownCeremony: false,
      crownWinnerIds: [],
    };
    return;
  }

  // 11：頒冠
  fighters.forEach((fighter, index) => {
    fighter.alive = index === 0;
    fighter.fallOrder = index === 0 ? 0 : index;
    fighter.x = index === 0 ? 0 : 3 + index * 0.15;
    fighter.z = 0;
  });

  arenaSnapshot.value = {
    ...base,
    phase: 'crownAward',
    showCountdownGo: false,
    fighters,
    aliveCount: 1,
    localAlive: true,
    winnerId,
    isCrownCeremony: true,
    crownWinnerIds: [winnerId],
  };
}

function prepareVolleyball(participants: Participant[], slide: number): void {
  const localId = participants[0]!.id;
  const game = new VolleyballGame(participants, localId);
  game.start();

  const ticks = 50 + slide * 22;

  for (let step = 0; step < ticks; step += 1) {
    game.onTick(50);
  }

  const base = game.getGameSnapshot();
  const players = base.players.map((player) => ({ ...player }));
  const teamAIds = [...base.teamAIds];
  const teamBIds = [...base.teamBIds];
  const localTeamId = base.localTeamId ?? 'a';
  const crownIds = localTeamId === 'a' ? teamAIds : teamBIds;

  // 0–1：開場站位／分隊
  if (slide <= 1) {
    volleyballSnapshot.value = {
      ...base,
      phase: 'serve',
      scoreA: 0,
      scoreB: 0,
      players,
      ball: { x: 0, y: 1.4, z: localTeamId === 'a' ? -2.2 : 2.2 },
      predictedLand: { x: 0.4, z: localTeamId === 'a' ? -1.6 : 1.6 },
      ballOwnerId: localId,
      hitTiming: 0.35,
      isCrownCeremony: false,
      crownWinnerIds: [],
      scoreFxKind: null,
      scoringTeam: null,
    };
    return;
  }

  // 2–3：移動／跳躍接球
  if (slide === 2 || slide === 3) {
    players.forEach((player, index) => {
      player.isJumping = slide === 3 && player.id === localId;
      player.y = player.isJumping ? 1.1 : 0;
      player.x = (index % 2 === 0 ? -1.1 : 1.1) + (player.teamId === 'a' ? 0 : 0.1);
      player.z = player.teamId === 'a' ? -2.1 + (index % 2) * 0.4 : 2.1 - (index % 2) * 0.4;
    });

    volleyballSnapshot.value = {
      ...base,
      phase: 'rally',
      scoreA: 1,
      scoreB: 1,
      players,
      ball: { x: 0.2, y: slide === 3 ? 2.4 : 1.6, z: -1.4 },
      predictedLand: { x: 0.3, z: -1.8 },
      ballOwnerId: localId,
      hitTiming: 0.7,
      isCrownCeremony: false,
      crownWinnerIds: [],
    };
    return;
  }

  // 4–5：擊球／殺球（對方場）
  if (slide === 4 || slide === 5) {
    volleyballSnapshot.value = {
      ...base,
      phase: 'rally',
      scoreA: 2,
      scoreB: 1,
      players,
      ball: { x: 0.6, y: slide === 5 ? 2.8 : 1.8, z: 1.5 },
      predictedLand: { x: 0.8, z: 2.1 },
      ballOwnerId: teamBIds[0] ?? null,
      hitTiming: slide === 5 ? 0.92 : 0.55,
      lastHit: {
        playerId: localId,
        kind: slide === 5 ? 'spike' : 'bump',
      },
      hitSerial: base.hitSerial + 1,
      isCrownCeremony: false,
      crownWinnerIds: [],
    };
    return;
  }

  // 6–7：舉球給隊友
  if (slide === 6 || slide === 7) {
    volleyballSnapshot.value = {
      ...base,
      phase: 'rally',
      scoreA: 2,
      scoreB: 2,
      players,
      ball: { x: -0.4, y: 2.2, z: -1.2 },
      predictedLand: { x: -0.2, z: -1.7 },
      ballOwnerId: teamAIds.find((id) => id !== localId) ?? localId,
      hitTiming: 0.8,
      lastHit: {
        playerId: localId,
        kind: 'set',
      },
      hitSerial: base.hitSerial + 2,
      touchesLeft: 2,
      isCrownCeremony: false,
      crownWinnerIds: [],
    };
    return;
  }

  // 8–9：落點提示／球權
  if (slide === 8 || slide === 9) {
    volleyballSnapshot.value = {
      ...base,
      phase: 'rally',
      scoreA: 3,
      scoreB: 3,
      players,
      ball: { x: 0.1, y: 2, z: slide === 8 ? 1.8 : -1.6 },
      predictedLand: {
        x: slide === 8 ? 0.9 : -0.6,
        z: slide === 8 ? 2 : -1.9,
      },
      ballOwnerId: slide === 9 ? localId : (teamBIds[0] ?? null),
      hitTiming: 0.88,
      isCrownCeremony: false,
      crownWinnerIds: [],
    };
    return;
  }

  // 10：接近 5 分
  if (slide === 10) {
    volleyballSnapshot.value = {
      ...base,
      phase: 'pointPause',
      scoreA: 4,
      scoreB: 3,
      players,
      ball: { x: 0, y: 0.4, z: 2.2 },
      predictedLand: null,
      ballOwnerId: null,
      hitTiming: 0,
      scoreFxSerial: base.scoreFxSerial + 1,
      scoreFxKind: 'normal',
      scoringTeam: 'a',
      isCrownCeremony: false,
      crownWinnerIds: [],
    };
    return;
  }

  // 11：頒冠
  volleyballSnapshot.value = {
    ...base,
    phase: 'crownAward',
    scoreA: localTeamId === 'a' ? 5 : 3,
    scoreB: localTeamId === 'b' ? 5 : 3,
    players,
    ball: { x: 0, y: 0.5, z: 0 },
    predictedLand: null,
    ballOwnerId: null,
    hitTiming: 0,
    isCrownCeremony: true,
    crownWinnerIds: crownIds,
    scoreFxKind: null,
    scoringTeam: null,
  };
}

onMounted(() => {
  window.__COVER_CAPTURE__ = {
    ready: false,
    gameId: gameId.value,
    slideIndex: slideIndex.value,
  };

  const participants = buildParticipants();
  seedParty(participants);

  if (gameId.value === ROCK_PAPER_SCISSORS_ID) {
    prepareRps(participants, slideIndex.value);
  } else if (gameId.value === ARENA_BUMP_ID) {
    prepareArena(participants, slideIndex.value);
  } else if (gameId.value === VOLLEYBALL_ID) {
    prepareVolleyball(participants, slideIndex.value);
  } else {
    statusText.value = `未知遊戲：${gameId.value}`;
    return;
  }

  statusText.value = '場景載入中…';

  settleTimerId = window.setTimeout(() => {
    statusText.value = 'ready';
    window.__COVER_CAPTURE__ = {
      ready: true,
      gameId: gameId.value,
      slideIndex: slideIndex.value,
    };
  }, 3200);
});

onUnmounted(() => {
  if (settleTimerId !== null) {
    window.clearTimeout(settleTimerId);
  }

  delete window.__COVER_CAPTURE__;
});
</script>

<template>
  <main
    class="cover-capture"
    data-cover-root
  >
    <p
      v-if="statusText !== 'ready'"
      class="cover-capture__status"
    >
      {{ statusText }} · {{ gameId }} · #{{ slideIndex }}
    </p>

    <RockPaperScissorsScene
      v-if="gameId === 'rock-paper-scissors' && rpsSnapshot"
      :snapshot="rpsSnapshot"
      :participants="partyStore.participants"
      :local-participant-id="partyStore.localParticipantId"
    />

    <ArenaBumpScene
      v-else-if="gameId === 'arena-bump' && arenaSnapshot"
      :snapshot="arenaSnapshot"
    />

    <VolleyballScene
      v-else-if="gameId === 'volleyball' && volleyballSnapshot"
      :snapshot="volleyballSnapshot"
    />
  </main>
</template>

<style lang="scss" scoped>
.cover-capture {
  position: fixed;
  inset: 0;
  margin: 0;
  background: #000;
}

.cover-capture__status {
  position: fixed;
  top: var(--space-sm);
  left: var(--space-sm);
  z-index: 5;
  margin: 0;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: var(--font-size-xs);
  pointer-events: none;
}

:deep(canvas) {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  display: block;
}
</style>
