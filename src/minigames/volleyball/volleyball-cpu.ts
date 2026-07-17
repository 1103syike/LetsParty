import {
  VB_HITBOX_SPIKE,
  vbCanHitBall,
  vbHorizontalDistance,
} from '@/minigames/volleyball/volleyball-collision';
import type { PlayerInput } from '@/types/player-input';

export type VbTeamId = 'a' | 'b';
export type VbCpuRole = 'back' | 'front';

export interface VbCpuPlayer {
  id: string;
  teamId: VbTeamId;
  x: number;
  y: number;
  z: number;
  role: VbCpuRole;
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
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function teamSideSign(teamId: VbTeamId): number {
  return teamId === 'a' ? -1 : 1;
}

export function vbCpuRoleForSlot(slot: number): VbCpuRole {
  // 0：後排接發／防守；1：前排舉球／網前
  return slot === 0 ? 'back' : 'front';
}

/** 角色守位（半場內，左右錯開但不要貼邊角） */
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
  return {
    x: clamp(x, -world.courtHalfWidth + 1.4, world.courtHalfWidth - 1.4),
    z: clamp(
      z,
      side < 0 ? -world.courtHalfDepth + 0.9 : world.netThickness + 0.9,
      side < 0 ? -world.netThickness - 0.9 : world.courtHalfDepth - 0.9,
    ),
  };
}

/**
 * 對手對打 AI（有來有回）：
 * - owner：依落地時間追落點，準時到位
 * - 非 owner：拉開成舉球／殺球站位
 * - 第一觸舉球、第二觸過網；高球偶爾殺
 * - 漏接只吃「難球」鎖定，一般球會回
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

  if (isOwner) {
    const chaseX = clamp(land.x, -world.courtHalfWidth + 1.3, world.courtHalfWidth - 1.3);
    const chaseZ = clamp(
      land.z,
      side < 0 ? -world.courtHalfDepth + 0.9 : world.netThickness + 0.9,
      side < 0 ? -world.netThickness - 0.9 : world.courtHalfDepth - 0.9,
    );

    if (landTime > 1.05) {
      // 還早：先站中間偏落點，別傻站底線
      targetX = chaseX * 0.55 + home.x * 0.45;
      targetZ = chaseZ * 0.5 + home.z * 0.5;
      steerScale = 0.7;
    } else if (landTime > 0.45) {
      // 進入接球窗：全力到位
      targetX = chaseX;
      targetZ = chaseZ;
      steerScale = 0.9;
    } else {
      // 最後一步：貼球
      targetX = chaseX * 0.85 + ball.x * 0.15;
      targetZ = chaseZ * 0.85 + ball.z * 0.15;
      steerScale = 0.95;
    }
  } else if (teammate) {
    // 支援位：跟 owner 左右錯開，準備接舉／補殺
    const coverX = -teammate.x * 0.35 + (self.role === 'front' ? 1.2 : -1.2);
    const coverDepth = self.role === 'front'
      ? world.courtHalfDepth * 0.38
      : world.courtHalfDepth * 0.55;
    targetX = clamp(coverX, -world.courtHalfWidth + 1.5, world.courtHalfWidth - 1.5);
    targetZ = side * coverDepth;
    steerScale = 0.72;

    // 隊友舉球後：前排靠近網準備殺
    if (
      world.possessionTeam === self.teamId
      && world.touchesUsed >= 1
      && self.role === 'front'
    ) {
      targetX = clamp(teammate.x * 0.25 + land.x * 0.35, -world.courtHalfWidth + 1.5, world.courtHalfWidth - 1.5);
      targetZ = side * (world.courtHalfDepth * 0.32);
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
  const nearForJump = distToBall < VB_HITBOX_SPIKE + 0.25;
  // 墊球進 hitbox 就可打；殺球另算
  const canBump = vbCanHitBall(self, ball, 'bump');
  const canSpike = vbCanHitBall(self, ball, 'spike', { isJumping: true });
  const ownBall = world.possessionTeam === self.teamId;
  const touchCount = ownBall ? world.touchesUsed : 0;
  const shouldSet = Boolean(teammate) && world.phase === 'rally' && touchCount < 1;

  // 舉球後／高球：靠近時提前起跳（還不能打）
  if (
    world.phase === 'rally'
    && isOwner
    && !shouldSet
    && ball.active
    && ball.y > 1.45
    && ball.vy < 0.8
    && nearForJump
  ) {
    jump = true;
  }

  if ((ball.active || world.phase === 'serve') && (canBump || canSpike)) {
    if (world.phase === 'serve') {
      bump = true;
    } else if (shouldSet) {
      // 對打核心：先舉給隊友
      set = true;
    } else {
      // 能跳殺再殺；否則穩穩墊過網（站在落點卻不接多半是這裡搞砸）
      const wantSpike = canSpike
        && (
          self.role === 'front'
            ? ball.y > 1.25 && Math.random() < 0.7
            : ball.y > 1.5 && Math.random() < 0.35
        );

      if (wantSpike) {
        jump = true;
        spike = true;
      } else if (canBump) {
        bump = true;
      } else {
        jump = true;
        spike = true;
      }
    }
  }

  if (
    world.phase === 'serve'
    && world.servingTeam === self.teamId
    && self.role === 'back'
    && isOwner
    && vbCanHitBall(self, ball, 'bump')
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

/** 本機隊友 CPU：幫你救、寬鬆摸球 */
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

  const nearForJump = vbHorizontalDistance(self, ball) < VB_HITBOX_SPIKE + 0.25;
  // 按鍵門檻跟玩家一樣；物理層隊友才略放（canCpuReachBall）
  const canTouch = vbCanHitBall(self, ball, 'bump')
    || vbCanHitBall(self, ball, 'spike', { isJumping: true });
  const ownBall = world.possessionTeam === self.teamId;
  const touchCount = ownBall ? world.touchesUsed : 0;
  const shouldSet = Boolean(teammate) && world.phase === 'rally' && touchCount < 1;

  if ((ball.active || world.phase === 'serve') && canTouch) {
    if (world.phase === 'serve') {
      bump = true;
    } else if (shouldSet) {
      set = true;
    } else {
      jump = ball.y > 1.15 && nearForJump;
      if (jump && (vbCanHitBall(self, ball, 'spike', { isJumping: true }) || self.y > 0.05)) {
        spike = true;
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
    && vbCanHitBall(self, ball, 'bump')
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

/**
 * CPU 入口：
 * - 對手隊 → 對打 AI（有來有回）
 * - 本機隊友 → 助攻救球 AI
 */
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

  const hasLocalTeammate = Boolean(
    world.localPlayerId
    && teammates.some((player) => player.id === world.localPlayerId),
  );

  if (hasLocalTeammate) {
    return computeAllyCpuInput(self, teammates, ball, world);
  }

  return computeRallyOpponentInput(self, teammates, ball, world);
}
