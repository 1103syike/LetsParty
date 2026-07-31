import {
  VB_HITBOX_BUMP,
  vbCanHitBall,
  vbHorizontalDistance,
} from '@/minigames/volleyball/volleyball-collision';
import type { PlayerInput } from '@/types/player-input';

function vbCpuCanBump(
  self: VbCpuPlayer,
  ball: VbCpuBall,
): boolean {
  return vbCanHitBall(self, ball, 'bump', { profile: 'cpu' });
}

function vbCpuCanSpike(
  self: VbCpuPlayer,
  ball: VbCpuBall,
): boolean {
  const isJumping = self.y > 0.12;
  return vbCanHitBall(self, ball, 'spike', { isJumping, profile: 'cpu' });
}

export type VbTeamId = 'a' | 'b';
export type VbCpuRole = 'front' | 'back';

/** 與 volleyball.ts 物理出界 pad 對齊：可走出左右邊線 */
export const VB_SIDELINE_OUT_PAD = 1.2;

export interface VbCpuPlayer {
  id: string;
  teamId: VbTeamId;
  role: VbCpuRole;
  x: number;
  y: number;
  z: number;
}

export interface VbCpuBall {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  active: boolean;
}

export interface VbCpuWorld {
  phase: 'teamReveal' | 'serve' | 'rally' | 'pointPause' | 'crownAward' | 'finished';
  possessionTeam: VbTeamId;
  servingTeam: VbTeamId;
  /** 當前該發球的人（沙排輪流） */
  servingPlayerId: string | null;
  touchesUsed: number;
  serveLockMs: number;
  lastToucherId: string | null;
  localPlayerId: string | null;
  /** 預期落點最近、應接這球的人；CPU 只接自己的 */
  ballOwnerId: string | null;
  predictedLand: { x: number; z: number } | null;
  /** 距落地秒數；對手用來決定何時全力追 */
  landTimeSec: number | null;
  /** 對手這次觸球鎖定漏接（整段不按鍵） */
  opponentWillMiss: boolean;
  courtHalfWidth: number;
  courtHalfDepth: number;
  netThickness: number;
  /** CPU 實心觸球距離（與 tryHit 一致） */
  cpuSolidContact: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function teamSideSign(teamId: VbTeamId): number {
  return teamId === 'a' ? -1 : 1;
}

export function vbCpuRoleForSlot(slot: number): VbCpuRole {
  return slot === 0 ? 'back' : 'front';
}

export function vbCpuHomeSpot(
  player: VbCpuPlayer,
  world: VbCpuWorld,
): { x: number; z: number } {
  const side = teamSideSign(player.teamId);
  // 前後排左右拉開，避免開局／待機黏中線
  const leftRight = player.role === 'back' ? -2.6 : 2.6;
  const depth = player.role === 'back'
    ? world.courtHalfDepth * 0.64
    : world.courtHalfDepth * 0.4;

  return {
    x: clamp(leftRight, -world.courtHalfWidth + 1.5, world.courtHalfWidth - 1.5),
    z: side * depth,
  };
}

/** 粗估球落地 xz（忽略撞網，夠給 AI 跑位） */
export function vbPredictBallLand(
  ball: VbCpuBall,
  gravity: number,
  ballRadius: number,
): { x: number; z: number; timeSec: number } {
  if (!ball.active || ball.vy === 0 && ball.y <= ballRadius + 0.05) {
    return { x: ball.x, z: ball.z, timeSec: 0 };
  }

  const disc = ball.vy * ball.vy - 2 * gravity * (ballRadius - ball.y);

  if (disc <= 0 || gravity <= 0) {
    return { x: ball.x, z: ball.z, timeSec: 0.2 };
  }

  const timeSec = Math.max(0.05, (ball.vy + Math.sqrt(disc)) / gravity);

  return {
    x: ball.x + ball.vx * timeSec,
    z: ball.z + ball.vz * timeSec,
    timeSec,
  };
}

/** 到球／落點的較近距離 */
export function vbChaseDistance(
  player: Pick<VbCpuPlayer, 'x' | 'z'>,
  ball: Pick<VbCpuBall, 'x' | 'z'>,
  land: { x: number; z: number },
): number {
  return Math.min(
    vbHorizontalDistance(player, ball),
    vbHorizontalDistance(player, land),
  );
}

const IDLE_INPUT: PlayerInput = {
  type: 'volleyball',
  x: 0,
  y: 0,
  jump: false,
  bump: false,
  set: false,
  spike: false,
};

function clampChaseX(x: number, world: VbCpuWorld): number {
  return clamp(
    x,
    -world.courtHalfWidth - VB_SIDELINE_OUT_PAD,
    world.courtHalfWidth + VB_SIDELINE_OUT_PAD,
  );
}

function clampSupportX(x: number, world: VbCpuWorld): number {
  return clamp(x, -world.courtHalfWidth + 1.2, world.courtHalfWidth - 1.2);
}

function clampOnHalf(
  x: number,
  z: number,
  side: number,
  world: VbCpuWorld,
  allowSidelineOut = false,
): { x: number; z: number } {
  const minOwn = world.netThickness + 0.9;
  return {
    x: allowSidelineOut ? clampChaseX(x, world) : clampSupportX(x, world),
    z: clamp(
      z,
      side < 0 ? -world.courtHalfDepth + 0.9 : minOwn,
      side < 0 ? -minOwn : world.courtHalfDepth - 0.9,
    ),
  };
}

/** 只有真的貼到球才准按鍵（跟 tryHit 實心距離對齊） */
function vbCpuInSolidContact(
  self: VbCpuPlayer,
  ball: VbCpuBall,
  world: VbCpuWorld,
): boolean {
  return vbHorizontalDistance(self, ball) <= world.cpuSolidContact;
}

type VbCpuSupportMode = 'receive' | 'setup' | 'attack' | 'cover';

/** 同隊期望左右間距（比硬分離大，站位看起來才開） */
const VB_CPU_TEAMMATE_SEP_X = 3.2;

/** 邊線／場外落點：不把 digger 推離球 */
function isSidelineLand(landX: number, world: VbCpuWorld): boolean {
  return Math.abs(landX) >= world.courtHalfWidth - 1.8;
}

function roleSideSign(role: VbCpuRole): number {
  return role === 'back' ? -1 : 1;
}

/**
 * 非 owner 支援點：前後排固定左右錯開，不要兩人擠中線。
 */
function vbCpuSupportSpot(
  self: VbCpuPlayer,
  teammate: VbCpuPlayer,
  land: { x: number; z: number },
  world: VbCpuWorld,
  mode: VbCpuSupportMode,
): { x: number; z: number } {
  const side = teamSideSign(self.teamId);
  const home = vbCpuHomeSpot(self, world);
  const netStand = world.netThickness + 1.35;
  const roleSign = roleSideSign(self.role);
  let x = home.x;
  let z = home.z;

  if (mode === 'receive') {
    // 接發站位：前後排左右拉開，只小幅跟落點橫移
    const depth = self.role === 'front'
      ? Math.max(world.courtHalfDepth * 0.36, netStand)
      : world.courtHalfDepth * 0.56;
    x = land.x * 0.25 + roleSign * 2.7;
    z = side * depth;
  } else if (mode === 'setup') {
    const depth = world.courtHalfDepth * 0.42;
    x = land.x * 0.15 + roleSign * 2.4;
    z = side * depth;
  } else if (mode === 'attack') {
    const depth = Math.max(world.courtHalfDepth * 0.28, netStand);
    x = teammate.x * 0.1 + roleSign * 2.5;
    z = side * depth;
  } else {
    const depth = world.courtHalfDepth * 0.55;
    x = land.x * 0.2 + roleSign * 2.6;
    z = side * depth;
  }

  // 仍過近：硬推到角色側
  if (Math.abs(x - teammate.x) < VB_CPU_TEAMMATE_SEP_X) {
    x = teammate.x + roleSign * VB_CPU_TEAMMATE_SEP_X;
  }

  return clampOnHalf(x, z, side, world, false);
}

interface VbCpuMoveMemory {
  reactUntilMs: number;
  lastTargetKey: string;
  lastSteerX: number;
  lastSteerZ: number;
}

interface VbCpuFidgetMemory {
  nextSwapMs: number;
  offsetX: number;
  offsetZ: number;
}

const moveMemoryById = new Map<string, VbCpuMoveMemory>();
const fidgetMemoryById = new Map<string, VbCpuFidgetMemory>();

/** 待機微移：目標附近換小偏移，看起來一直在動 */
function vbCpuFidgetOffset(selfId: string): { x: number; z: number } {
  const now = performance.now();
  let mem = fidgetMemoryById.get(selfId);

  if (!mem || now >= mem.nextSwapMs) {
    mem = {
      nextSwapMs: now + 380 + Math.random() * 520,
      offsetX: (Math.random() - 0.5) * 1.6,
      offsetZ: (Math.random() - 0.5) * 1.1,
    };
    fidgetMemoryById.set(selfId, mem);
  }

  return { x: mem.offsetX, z: mem.offsetZ };
}

/**
 * 輕量真人走停：換目標短反應延遲；到位減速；遠距衝刺。
 * owner 緊急追球（urgent）直接全速，避免落點微抖重啟延遲導致漏接。
 */
function applyHumanishSteer(
  self: VbCpuPlayer,
  targetX: number,
  targetZ: number,
  steerScale: number,
  options: { urgent: boolean },
): { x: number; z: number } {
  const dist = Math.hypot(targetX - self.x, targetZ - self.z);
  let scale = steerScale;

  if (options.urgent) {
    scale = Math.max(scale, 1);
    return {
      x: clamp(targetX - self.x, -1, 1) * scale,
      z: clamp(targetZ - self.z, -1, 1) * scale,
    };
  }

  if (dist > 2.5) {
    scale = Math.max(scale, 1);
  } else if (dist < 0.55) {
    // 到位後仍保持微速，不要完全停住
    scale = Math.max(0.28, scale * 0.45);
  }

  const now = performance.now();
  let mem = moveMemoryById.get(self.id);
  const prevTx = mem ? Number(mem.lastTargetKey.split(',')[0]) : targetX;
  const prevTz = mem ? Number(mem.lastTargetKey.split(',')[1]) : targetZ;
  const jump = Math.hypot(targetX - prevTx, targetZ - prevTz);
  const shouldReact = !mem || jump > 1.25;

  if (shouldReact) {
    const delaySec = 0.05 + Math.random() * 0.07;
    mem = {
      reactUntilMs: now + delaySec * 1000,
      lastTargetKey: `${targetX.toFixed(2)},${targetZ.toFixed(2)}`,
      lastSteerX: mem?.lastSteerX ?? 0,
      lastSteerZ: mem?.lastSteerZ ?? 0,
    };
    moveMemoryById.set(self.id, mem);
  } else if (mem) {
    mem.lastTargetKey = `${targetX.toFixed(2)},${targetZ.toFixed(2)}`;
  }

  if (mem && now < mem.reactUntilMs) {
    return {
      x: mem.lastSteerX * 0.75,
      z: mem.lastSteerZ * 0.75,
    };
  }

  const steerX = clamp(targetX - self.x, -1, 1) * scale;
  const steerZ = clamp(targetZ - self.z, -1, 1) * scale;

  if (mem) {
    mem.lastSteerX = steerX;
    mem.lastSteerZ = steerZ;
  }

  return { x: steerX, z: steerZ };
}

/**
 * 對手對打 AI（有來有回）：
 * - 只有 owner 追落點；非 owner 走支援／前後排定點
 * - 可托可直接擊球／殺球，但按鍵前必須實心貼球
 */
function computeRallyOpponentInput(
  self: VbCpuPlayer,
  teammates: VbCpuPlayer[],
  ball: VbCpuBall,
  world: VbCpuWorld,
): PlayerInput {
  const side = teamSideSign(self.teamId);
  const home = vbCpuHomeSpot(self, world);
  const isOwner = world.ballOwnerId === self.id;
  const land = world.predictedLand ?? { x: ball.x, z: ball.z };
  const landTime = world.landTimeSec ?? 1.2;
  const teammate = teammates.find((player) => player.id !== self.id);
  let targetX = home.x;
  let targetZ = home.z;
  let steerScale = 0.82;

  const ownBall = world.possessionTeam === self.teamId;
  const netStand = world.netThickness + 0.9;
  const sideline = isSidelineLand(land.x, world);

  if (isOwner) {
    const chaseX = clampChaseX(land.x, world);
    const chaseZ = clamp(
      land.z,
      side < 0 ? -world.courtHalfDepth + 0.9 : netStand,
      side < 0 ? -netStand : world.courtHalfDepth - 0.9,
    );

    // owner 全速貼落點／球：不要混家，避免摸不到漏接
    if (landTime > 0.4) {
      targetX = chaseX;
      targetZ = chaseZ;
      steerScale = 1;
    } else {
      targetX = chaseX * 0.7 + ball.x * 0.3;
      targetZ = chaseZ * 0.7 + ball.z * 0.3;
      steerScale = 1;
    }

    // 非邊線：與隊友保持左右距離，避免兩人疊中
    if (
      teammate
      && !sideline
      && Math.abs(targetX - teammate.x) < VB_CPU_TEAMMATE_SEP_X
    ) {
      const push = roleSideSign(self.role) * VB_CPU_TEAMMATE_SEP_X;
      targetX = clampChaseX(teammate.x + push, world);
    }
  } else if (teammate) {
    let mode: VbCpuSupportMode = 'receive';

    if (ownBall && world.touchesUsed >= 1) {
      mode = self.role === 'front' ? 'attack' : 'cover';
    } else if (ownBall) {
      mode = 'setup';
    } else {
      mode = 'receive';
    }

    const spot = vbCpuSupportSpot(self, teammate, land, world, mode);
    targetX = spot.x;
    targetZ = spot.z;
    steerScale = mode === 'receive'
      ? 0.88
      : mode === 'attack'
        ? 0.96
        : mode === 'setup'
          ? 0.9
          : 0.84;
  }

  // 支援位待機微移；owner 追球不加偏移以免漏接
  if (!isOwner) {
    const fidget = vbCpuFidgetOffset(self.id);
    targetX += fidget.x;
    targetZ += fidget.z;
  }

  const clamped = clampOnHalf(targetX, targetZ, side, world, isOwner);
  const steer = applyHumanishSteer(self, clamped.x, clamped.z, steerScale, {
    urgent: isOwner,
  });

  if (!isOwner) {
    return {
      type: 'volleyball',
      x: steer.x,
      y: steer.z,
      jump: false,
      bump: false,
      set: false,
      spike: false,
    };
  }

  if (world.opponentWillMiss) {
    return {
      type: 'volleyball',
      x: steer.x,
      y: steer.z,
      jump: false,
      bump: false,
      set: false,
      spike: false,
    };
  }

  let bump = false;
  let set = false;
  let spike = false;
  let jump = false;

  const distToBall = vbHorizontalDistance(self, ball);
  const nearForJump = distToBall < VB_HITBOX_BUMP + 0.08;
  const inContact = vbCpuInSolidContact(self, ball, world);
  const canBump = inContact && vbCpuCanBump(self, ball);
  const canSpike = inContact && vbCpuCanSpike(self, ball);
  const touchCount = ownBall ? world.touchesUsed : 0;
  // 有隊友時第一觸偶爾托；其餘優先打過網，別一直餵自己
  const preferSet = Boolean(teammate) && world.phase === 'rally' && touchCount < 1;
  const isServer = world.servingPlayerId === self.id;

  if (
    world.phase === 'rally'
    && isOwner
    && !preferSet
    && ball.active
    && ball.y > 1.35
    && ball.vy < 1.0
    && nearForJump
    && inContact
  ) {
    jump = true;
  }

  if ((ball.active || world.phase === 'serve') && (canBump || canSpike)) {
    if (world.phase === 'serve') {
      bump = isServer;
    } else if (preferSet && Math.random() < 0.48) {
      set = true;
    } else if (canSpike) {
      spike = true;
    } else if (canBump) {
      const wantJumpSpike = ball.y > 1.28
        && nearForJump
        && (
          self.role === 'front'
            ? Math.random() < 0.85
            : Math.random() < 0.42
        );

      if (wantJumpSpike) {
        jump = true;
        bump = true;
      } else {
        bump = true;
      }
    }
  }

  if (
    world.phase === 'serve'
    && isServer
    && isOwner
    && canBump
  ) {
    bump = true;
    set = false;
    spike = false;
  }

  return {
    type: 'volleyball',
    x: steer.x,
    y: steer.z,
    jump,
    bump,
    set,
    spike,
  };
}

/** 本機隊友 CPU：幫你救，但觸球仍貼身（不准隔空） */
function computeAllyCpuInput(
  self: VbCpuPlayer,
  teammates: VbCpuPlayer[],
  ball: VbCpuBall,
  world: VbCpuWorld,
): PlayerInput {
  const side = teamSideSign(self.teamId);
  const home = vbCpuHomeSpot(self, world);
  const isOwner = world.ballOwnerId === self.id;
  const land = world.predictedLand ?? { x: ball.x, z: ball.z };
  const landTime = world.landTimeSec ?? 1.2;
  const local = teammates.find((player) => player.id === world.localPlayerId);
  const teammate = teammates.find((player) => player.id !== self.id);
  let targetX = home.x;
  let targetZ = home.z;
  let steerScale = 0.9;
  const ownBall = world.possessionTeam === self.teamId;
  const netStand = world.netThickness + 0.9;

  if (isOwner) {
    const chaseX = clampChaseX(land.x, world);
    const chaseZ = clamp(
      land.z,
      side < 0 ? -world.courtHalfDepth + 0.9 : netStand,
      side < 0 ? -netStand : world.courtHalfDepth - 0.9,
    );

    if (landTime <= 0.45) {
      targetX = chaseX * 0.65 + ball.x * 0.35;
      targetZ = chaseZ * 0.65 + ball.z * 0.35;
    } else {
      targetX = chaseX;
      targetZ = chaseZ;
    }
    steerScale = 1;
  } else if (local) {
    const roleSign = roleSideSign(self.role);
    targetX = clampSupportX(local.x * 0.15 + roleSign * 2.7, world);
    targetZ = side * (
      self.role === 'back'
        ? world.courtHalfDepth * 0.62
        : world.courtHalfDepth * 0.45
    );

    const toBallDist = vbHorizontalDistance(self, ball);

    if (toBallDist < 2.4 && toBallDist > 0.01) {
      const awayX = self.x - ball.x;
      const awayZ = self.z - ball.z;
      const away = Math.hypot(awayX, awayZ) || 1;
      targetX += (awayX / away) * 1.1;
      targetZ += (awayZ / away) * 1.1;
    }
  }

  // 支援位待機微移；owner 追球不加偏移以免漏接
  if (!isOwner) {
    const fidget = vbCpuFidgetOffset(self.id);
    targetX += fidget.x;
    targetZ += fidget.z;
  }

  const clamped = clampOnHalf(targetX, targetZ, side, world, isOwner);
  const steer = applyHumanishSteer(self, clamped.x, clamped.z, steerScale, {
    urgent: isOwner,
  });

  if (!isOwner) {
    return {
      type: 'volleyball',
      x: steer.x,
      y: steer.z,
      jump: false,
      bump: false,
      set: false,
      spike: false,
    };
  }

  let bump = false;
  let set = false;
  let spike = false;
  let jump = false;

  const distToBall = vbHorizontalDistance(self, ball);
  const nearForJump = distToBall < VB_HITBOX_BUMP + 0.08;
  const inContact = vbCpuInSolidContact(self, ball, world);
  const canBump = inContact && vbCpuCanBump(self, ball);
  const canSpike = inContact && vbCpuCanSpike(self, ball);
  const touchCount = ownBall ? world.touchesUsed : 0;
  const preferSet = Boolean(teammate) && world.phase === 'rally' && touchCount < 1;
  const isServer = world.servingPlayerId === self.id;

  if ((ball.active || world.phase === 'serve') && (canBump || canSpike)) {
    if (world.phase === 'serve') {
      bump = isServer;
    } else if (preferSet && Math.random() < 0.72) {
      set = true;
    } else if (canSpike) {
      spike = true;
    } else if (canBump) {
      if (ball.y > 1.2 && nearForJump) {
        jump = true;
      }
      bump = true;
    }
  }

  if (
    world.phase === 'serve'
    && isServer
    && isOwner
    && canBump
  ) {
    bump = true;
    set = false;
    spike = false;
  }

  return {
    type: 'volleyball',
    x: steer.x,
    y: steer.z,
    jump,
    bump,
    set,
    spike,
  };
}

export function vbComputeCpuInput(
  self: VbCpuPlayer,
  teammates: VbCpuPlayer[],
  ball: VbCpuBall,
  world: VbCpuWorld,
  _gravity: number,
  _ballRadius: number,
): PlayerInput {
  if (
    world.phase === 'finished'
    || world.phase === 'crownAward'
    || world.phase === 'pointPause'
    || world.phase === 'teamReveal'
  ) {
    return IDLE_INPUT;
  }

  const local = teammates.find((player) => player.id === world.localPlayerId);
  const isAlly = Boolean(local && local.teamId === self.teamId);

  if (isAlly) {
    return computeAllyCpuInput(self, teammates, ball, world);
  }

  return computeRallyOpponentInput(self, teammates, ball, world);
}
