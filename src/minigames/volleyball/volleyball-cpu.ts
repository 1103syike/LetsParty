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
  phase: 'serve' | 'rally' | 'pointPause' | 'crownAward' | 'finished';
  possessionTeam: VbTeamId;
  servingTeam: VbTeamId;
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
  const leftRight = player.role === 'back' ? -1.15 : 1.15;
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

function clampOnHalf(
  x: number,
  z: number,
  side: number,
  world: VbCpuWorld,
): { x: number; z: number } {
  const minOwn = world.netThickness + 0.9;
  return {
    x: clamp(x, -world.courtHalfWidth + 1.4, world.courtHalfWidth - 1.4),
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

/**
 * 對手對打 AI（有來有回）：
 * - 可托可直接擊球
 * - 但按鍵前必須實心貼球，禁止隔空揮
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

  if (isOwner) {
    const chaseX = clamp(land.x, -world.courtHalfWidth + 1.3, world.courtHalfWidth - 1.3);
    const chaseZ = clamp(
      land.z,
      side < 0 ? -world.courtHalfDepth + 0.9 : netStand,
      side < 0 ? -netStand : world.courtHalfDepth - 0.9,
    );

    if (landTime > 1.05) {
      targetX = chaseX * 0.55 + home.x * 0.45;
      targetZ = chaseZ * 0.5 + home.z * 0.5;
      steerScale = 0.7;
    } else if (landTime > 0.45) {
      targetX = chaseX;
      targetZ = chaseZ;
      steerScale = 0.9;
    } else {
      targetX = chaseX * 0.85 + ball.x * 0.15;
      targetZ = chaseZ * 0.85 + ball.z * 0.15;
      steerScale = 0.95;
    }
  } else if (teammate) {
    const coverX = -teammate.x * 0.35 + (self.role === 'front' ? 1.2 : -1.2);
    const coverDepth = self.role === 'front'
      ? world.courtHalfDepth * 0.38
      : world.courtHalfDepth * 0.55;
    targetX = clamp(coverX, -world.courtHalfWidth + 1.5, world.courtHalfWidth - 1.5);
    targetZ = side * coverDepth;
    steerScale = 0.72;

    if (
      world.possessionTeam === self.teamId
      && world.touchesUsed >= 1
      && self.role === 'front'
    ) {
      targetX = clamp(teammate.x * 0.25 + land.x * 0.35, -world.courtHalfWidth + 1.5, world.courtHalfWidth - 1.5);
      targetZ = side * Math.max(world.courtHalfDepth * 0.32, world.netThickness + 1.6);
      steerScale = 0.88;
    }
  }

  const clamped = clampOnHalf(targetX, targetZ, side, world);
  const steerX = clamp(clamped.x - self.x, -1, 1) * steerScale;
  const steerZ = clamp(clamped.z - self.z, -1, 1) * steerScale;

  if (!isOwner) {
    return {
      type: 'volleyball',
      x: steerX,
      y: steerZ,
      jump: false,
      bump: false,
      set: false,
      spike: false,
    };
  }

  if (world.opponentWillMiss) {
    return {
      type: 'volleyball',
      x: steerX,
      y: steerZ,
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
  // 有隊友時第一觸偏好托，但仍可在貼身時直接擊球
  const preferSet = Boolean(teammate) && world.phase === 'rally' && touchCount < 1;

  if (
    world.phase === 'rally'
    && isOwner
    && !preferSet
    && ball.active
    && ball.y > 1.45
    && ball.vy < 0.8
    && nearForJump
    && inContact
  ) {
    jump = true;
  }

  if ((ball.active || world.phase === 'serve') && (canBump || canSpike)) {
    if (world.phase === 'serve') {
      bump = true;
    } else if (preferSet && Math.random() < 0.72) {
      set = true;
    } else if (canSpike) {
      spike = true;
    } else if (canBump) {
      const wantJumpSpike = ball.y > 1.35
        && nearForJump
        && (
          self.role === 'front'
            ? Math.random() < 0.65
            : Math.random() < 0.3
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
    && world.servingTeam === self.teamId
    && self.role === 'back'
    && isOwner
    && canBump
  ) {
    bump = true;
    set = false;
    spike = false;
  }

  return {
    type: 'volleyball',
    x: steerX,
    y: steerZ,
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
  const local = teammates.find((player) => player.id === world.localPlayerId);
  const teammate = teammates.find((player) => player.id !== self.id);
  let targetX = home.x;
  let targetZ = home.z;

  if (isOwner) {
    targetX = clamp(land.x, -world.courtHalfWidth + 1.3, world.courtHalfWidth - 1.3);
    targetZ = clamp(
      land.z,
      side < 0 ? -world.courtHalfDepth + 0.9 : world.netThickness + 0.9,
      side < 0 ? -world.netThickness - 0.9 : world.courtHalfDepth - 0.9,
    );
  } else if (local) {
    const slotX = self.role === 'back' ? -1.35 : 1.35;
    targetX = clamp(
      local.x * 0.2 + slotX,
      -world.courtHalfWidth + 1.6,
      world.courtHalfWidth - 1.6,
    );
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

  const clamped = clampOnHalf(targetX, targetZ, side, world);
  const steerX = clamp(clamped.x - self.x, -1, 1);
  const steerZ = clamp(clamped.z - self.z, -1, 1);

  if (!isOwner) {
    return {
      type: 'volleyball',
      x: steerX,
      y: steerZ,
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
  const ownBall = world.possessionTeam === self.teamId;
  const touchCount = ownBall ? world.touchesUsed : 0;
  const preferSet = Boolean(teammate) && world.phase === 'rally' && touchCount < 1;

  if ((ball.active || world.phase === 'serve') && (canBump || canSpike)) {
    if (world.phase === 'serve') {
      bump = true;
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
    && world.servingTeam === self.teamId
    && self.role === 'back'
    && isOwner
    && canBump
  ) {
    bump = true;
    set = false;
    spike = false;
  }

  return {
    type: 'volleyball',
    x: steerX,
    y: steerZ,
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
  if (world.phase === 'finished' || world.phase === 'crownAward' || world.phase === 'pointPause') {
    return IDLE_INPUT;
  }

  const local = teammates.find((player) => player.id === world.localPlayerId);
  const isAlly = Boolean(local && local.teamId === self.teamId);

  if (isAlly) {
    return computeAllyCpuInput(self, teammates, ball, world);
  }

  return computeRallyOpponentInput(self, teammates, ball, world);
}
