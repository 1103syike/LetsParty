import { VB_BALL_RADIUS } from '@/minigames/volleyball/volleyball-collision';

/** 物理場界（出界／瞄準共用） */
export const VB_COURT_HALF_WIDTH = 7.0;
export const VB_COURT_HALF_DEPTH = 9.6;
export const VB_NET_THICKNESS = 0.12;
export const VB_NET_BOTTOM_Y = 0.95;
export const VB_NET_TOP_Y = 2.0;
export const VB_NET_CLEAR_Y = VB_NET_TOP_Y + 0.28;
export const VB_GRAVITY = 12.2;
export const VB_HIT_LIFT_Y = 1.15;

export type VbAimHitKind = 'set' | 'bump' | 'spike';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function vbIsOutOfBounds(x: number, z: number): boolean {
  return Math.abs(x) > VB_COURT_HALF_WIDTH || Math.abs(z) > VB_COURT_HALF_DEPTH;
}

export function vbTeamSideSign(teamId: 'a' | 'b'): number {
  return teamId === 'a' ? -1 : 1;
}

/** 對方半場＋場外緩衝都可瞄；不可瞄回己方 */
export function vbClampOpponentAim(
  side: number,
  aimX: number,
  aimZ: number,
): { x: number; z: number } {
  const minClear = VB_NET_THICKNESS + 1.5;
  const outPad = 2.8;

  return {
    x: clamp(aimX, -(VB_COURT_HALF_WIDTH + outPad), VB_COURT_HALF_WIDTH + outPad),
    z: side < 0
      ? clamp(aimZ, minClear, VB_COURT_HALF_DEPTH + outPad)
      : clamp(aimZ, -(VB_COURT_HALF_DEPTH + outPad), -minClear),
  };
}

/** 把滑鼠落點夾到己方半場（舉球用） */
export function vbClampOwnAim(
  side: number,
  aimX: number,
  aimZ: number,
): { x: number; z: number } {
  return {
    x: clamp(aimX, -VB_COURT_HALF_WIDTH + 0.9, VB_COURT_HALF_WIDTH - 0.9),
    z: clamp(
      aimZ,
      side < 0 ? -VB_COURT_HALF_DEPTH + 1.2 : VB_NET_THICKNESS + 1.2,
      side < 0 ? -VB_NET_THICKNESS - 1.2 : VB_COURT_HALF_DEPTH - 1.2,
    ),
  };
}

/** 依目前 y／vy 算出實際落地秒數（水平速度要用這個，才會對準落點） */
export function vbPredictLandTimeSec(startY: number, launchVy: number): number {
  const disc = launchVy * launchVy - 2 * VB_GRAVITY * (VB_BALL_RADIUS - startY);

  if (disc <= 0 || VB_GRAVITY <= 0) {
    return 0.7;
  }

  return Math.max(0.35, (launchVy + Math.sqrt(disc)) / VB_GRAVITY);
}

export interface VbLaunchOverNetInput {
  side: number;
  targetX: number;
  targetZ: number;
  ballX: number;
  ballY: number;
  ballZ: number;
  flightSec: number;
  loft: number;
  fast?: boolean;
  forceInBounds?: boolean;
  /** 殺球時抬高接觸點（對齊 applyHitVelocity） */
  contactY?: number;
}

export interface VbLaunchOverNetResult {
  startX: number;
  startY: number;
  startZ: number;
  vx: number;
  vy: number;
  vz: number;
  /** 解析落點（含殺球限速後的實際距離） */
  landX: number;
  landZ: number;
  landSec: number;
}

/**
 * 過網球速度（純函式）：與場上 launchOverNet 同一套，給物理與瞄準預覽共用。
 */
export function vbComputeLaunchOverNet(input: VbLaunchOverNetInput): VbLaunchOverNetResult {
  const fast = Boolean(input.fast);
  const forceInBounds = Boolean(input.forceInBounds);
  const oppClear = VB_NET_THICKNESS + 2.2;
  const outPad = 2.8;
  const clearY = fast ? VB_NET_TOP_Y + 0.12 : VB_NET_CLEAR_Y;
  const minLandSec = fast ? 0.28 : 0.48;

  const startZ = input.side < 0
    ? Math.min(input.ballZ, -VB_NET_THICKNESS - 0.2)
    : Math.max(input.ballZ, VB_NET_THICKNESS + 0.2);
  const startX = clamp(input.ballX, -VB_COURT_HALF_WIDTH + 0.5, VB_COURT_HALF_WIDTH - 0.5);
  let startY = Math.max(input.ballY, VB_HIT_LIFT_Y);

  if (input.contactY != null && input.contactY > 0.12) {
    startY = Math.max(startY, Math.min(input.contactY + 1.1, 3.35));
  }

  const duration = clamp(input.flightSec, fast ? 0.28 : 0.48, fast ? 0.55 : 1.25);
  let vy = (VB_BALL_RADIUS - startY) / duration + 0.5 * VB_GRAVITY * duration + Math.max(0, input.loft);

  let targetZ = input.targetZ;
  let aimOut = !forceInBounds
    && (
      Math.abs(input.targetX) > VB_COURT_HALF_WIDTH
      || Math.abs(targetZ) > VB_COURT_HALF_DEPTH
    );

  if (aimOut) {
    if (input.side < 0) {
      targetZ = clamp(Math.max(targetZ, oppClear), oppClear, VB_COURT_HALF_DEPTH + outPad);
    } else {
      targetZ = clamp(Math.min(targetZ, -oppClear), -(VB_COURT_HALF_DEPTH + outPad), -oppClear);
    }
  } else if (input.side < 0) {
    targetZ = clamp(Math.max(targetZ, oppClear), oppClear, VB_COURT_HALF_DEPTH - 0.35);
  } else {
    targetZ = clamp(Math.min(targetZ, -oppClear), -VB_COURT_HALF_DEPTH + 0.35, -oppClear);
  }

  const targetX = aimOut
    ? clamp(input.targetX, -(VB_COURT_HALF_WIDTH + outPad), VB_COURT_HALF_WIDTH + outPad)
    : clamp(input.targetX, -VB_COURT_HALF_WIDTH + 0.35, VB_COURT_HALF_WIDTH - 0.35);

  let vx = 0;
  let vz = 0;
  let landSec = minLandSec;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    landSec = Math.max(minLandSec, vbPredictLandTimeSec(startY, vy));
    vx = (targetX - startX) / landSec;
    vz = (targetZ - startZ) / landSec;

    if (fast) {
      const horizontal = Math.hypot(vx, vz);
      const maxHorizontal = 19.5;

      if (horizontal > maxHorizontal) {
        const scale = maxHorizontal / horizontal;
        vx *= scale;
        vz *= scale;
      }
    }

    const crossesToOpponent = input.side < 0
      ? vz > 0.8 && startZ + vz * landSec >= oppClear
      : vz < -0.8 && startZ + vz * landSec <= -oppClear;

    if (!crossesToOpponent) {
      const forcedZ = input.side < 0 ? oppClear + 0.8 : -(oppClear + 0.8);
      vz = (forcedZ - startZ) / landSec;
      vx = (targetX - startX) / landSec;
    }

    const tNet = -startZ / vz;
    if (tNet <= 0) {
      break;
    }

    if (tNet >= landSec) {
      if (!fast) {
        break;
      }

      vy += 0.55;
      continue;
    }

    const yAtNet = tNet <= 0.05
      ? startY
      : startY + vy * tNet - 0.5 * VB_GRAVITY * tNet * tNet;
    if (yAtNet >= clearY) {
      break;
    }

    vy += fast ? 0.48 : 0.55;
  }

  // 歐拉積分比解析略矮：殺球最後再抬 vy，並重算水平速度，落點才對得上
  if (fast && Math.abs(vz) > 0.05) {
    const tNet = -startZ / vz;
    if (tNet > 0 && tNet < 1.2) {
      const yAtNet = startY + vy * tNet - 0.5 * VB_GRAVITY * tNet * tNet;
      const needY = VB_NET_TOP_Y + 0.18;
      if (yAtNet < needY) {
        vy += (needY - yAtNet) / tNet + 0.35;
        landSec = Math.max(minLandSec, vbPredictLandTimeSec(startY, vy));
        const horizontal = Math.hypot(targetX - startX, targetZ - startZ) / landSec;
        const capped = Math.min(horizontal, 19.5);
        const dx = targetX - startX;
        const dz = targetZ - startZ;
        const dist = Math.hypot(dx, dz) || 1;
        vx = (dx / dist) * capped;
        vz = (dz / dist) * capped;
      }
    }
  }

  landSec = Math.max(minLandSec, vbPredictLandTimeSec(startY, vy));

  return {
    startX,
    startY,
    startZ,
    vx,
    vy,
    vz,
    landX: startX + vx * landSec,
    landZ: startZ + vz * landSec,
    landSec,
  };
}

/** 滑鼠落點 → 出手後實際會落的 xz（給瞄準圈用） */
export function vbResolveAimLand(options: {
  kind: VbAimHitKind;
  side: number;
  aimX: number;
  aimZ: number;
  ballX: number;
  ballY: number;
  ballZ: number;
  hitterY?: number;
}): { x: number; z: number; isOut: boolean } {
  if (options.kind === 'set') {
    const aimed = vbClampOwnAim(options.side, options.aimX, options.aimZ);
    const targetX = clamp(aimed.x, -VB_COURT_HALF_WIDTH + 1.0, VB_COURT_HALF_WIDTH - 1.0);
    const targetZ = clamp(
      aimed.z,
      options.side < 0 ? -VB_COURT_HALF_DEPTH + 1.4 : VB_NET_THICKNESS + 1.4,
      options.side < 0 ? -VB_NET_THICKNESS - 1.4 : VB_COURT_HALF_DEPTH - 1.4,
    );

    return { x: targetX, z: targetZ, isOut: false };
  }

  const aimed = vbClampOpponentAim(options.side, options.aimX, options.aimZ);
  const launch = vbComputeLaunchOverNet({
    side: options.side,
    targetX: aimed.x,
    targetZ: aimed.z,
    ballX: options.ballX,
    ballY: options.ballY,
    ballZ: options.ballZ,
    flightSec: options.kind === 'spike' ? 0.34 : 0.82,
    loft: options.kind === 'spike' ? 0.55 : 1.15,
    fast: options.kind === 'spike',
    forceInBounds: false,
    contactY: options.kind === 'spike' ? options.hitterY : undefined,
  });

  return {
    x: launch.landX,
    z: launch.landZ,
    isOut: vbIsOutOfBounds(launch.landX, launch.landZ),
  };
}
