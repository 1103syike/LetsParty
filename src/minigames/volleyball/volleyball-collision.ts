/**
 * 排球碰撞／Hitbox 單位（世界座標公尺感）
 *
 * 設計：
 * - CPU：嚴格貼身，看起來像真的摸到球
 * - 本機：略寬 + 遊戲層觸球窗，手感好打
 * 兩套數字分開，不要再用「全員同一圈」互相遷就。
 */

/** 角色身體水平半徑（站位推擠、分離） */
export const VB_PLAYER_BODY_RADIUS = 0.55;

/** 球半徑 */
export const VB_BALL_RADIUS = 0.24;

/** 擊球判定對象 */
export type VbHitProfile = 'cpu' | 'local';

/**
 * CPU 實心觸球水平距離（球心 → 角色中心）。
 * tryHit／emergency／AI 按鍵共用這一個數字；禁止隔空，但仍可直接擊球。
 */
export const VB_CPU_SOLID_CONTACT = VB_PLAYER_BODY_RADIUS * 0.78; // ≈0.43

/** 本機臂展（略寬；再加 LOCAL_BONUS）— 不解本機手感 */
export const VB_HITBOX_REACH_LOCAL = 0.46;

/** 本機額外臂展（觸球窗搭配，不是給 CPU） */
export const VB_HITBOX_LOCAL_REACH_BONUS = 0.16;

/** AI 近身參考（等同實心） */
export const VB_HITBOX_BUMP = VB_CPU_SOLID_CONTACT;

export const VB_HITBOX_SPIKE = VB_CPU_SOLID_CONTACT + 0.05;

/** 觸球高度帶 */
export const VB_HITBOX_Y_MIN = 0.28;
export const VB_HITBOX_Y_MAX_BUMP_GROUNDED_CPU = 1.55;
export const VB_HITBOX_Y_MAX_BUMP_GROUNDED_LOCAL = 1.95;
export const VB_HITBOX_Y_MAX_BUMP_CPU = 2.05;
export const VB_HITBOX_Y_MAX_BUMP_LOCAL = 2.35;
export const VB_HITBOX_Y_MAX_SPIKE_CPU = 2.55;
export const VB_HITBOX_Y_MAX_SPIKE_LOCAL = 2.9;

/** 殺球時角色至少要離地這麼高 */
export const VB_SPIKE_MIN_PLAYER_Y = 0.22;

/** 隊友之間最小距離（避免黏成一團） */
export const VB_TEAMMATE_SEPARATION = VB_PLAYER_BODY_RADIUS * 2.4;

export type VbHitKind = 'bump' | 'set' | 'spike';

export interface VbBody2D {
  x: number;
  y: number;
  z: number;
}

export function vbHorizontalDistance(
  left: Pick<VbBody2D, 'x' | 'z'>,
  right: Pick<VbBody2D, 'x' | 'z'>,
): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function vbReachForProfile(profile: VbHitProfile, kind: VbHitKind): number {
  // CPU：水平距離就是實心接觸，不再另開一圈較寬 hitbox
  if (profile === 'cpu') {
    return VB_CPU_SOLID_CONTACT;
  }

  const bump = VB_HITBOX_REACH_LOCAL + VB_BALL_RADIUS;
  return kind === 'spike' ? bump + 0.05 : bump;
}

function vbMaxYForProfile(
  profile: VbHitProfile,
  kind: VbHitKind,
  isAirborne: boolean,
): number {
  if (kind === 'spike') {
    return profile === 'local' ? VB_HITBOX_Y_MAX_SPIKE_LOCAL : VB_HITBOX_Y_MAX_SPIKE_CPU;
  }

  if (isAirborne) {
    return profile === 'local' ? VB_HITBOX_Y_MAX_BUMP_LOCAL : VB_HITBOX_Y_MAX_BUMP_CPU;
  }

  return profile === 'local'
    ? VB_HITBOX_Y_MAX_BUMP_GROUNDED_LOCAL
    : VB_HITBOX_Y_MAX_BUMP_GROUNDED_CPU;
}

/** 是否在對應擊球種類的 hitbox 內 */
export function vbCanHitBall(
  player: VbBody2D,
  ball: VbBody2D,
  kind: VbHitKind,
  options?: {
    isJumping?: boolean;
    /** 預設 cpu（寧可嚴） */
    profile?: VbHitProfile;
    /** 僅 local 有意義；cpu 會被忽略 */
    reachBonus?: number;
  },
): boolean {
  const profile = options?.profile ?? 'cpu';
  const isAirborne = Boolean(options?.isJumping) || player.y > 0.12;
  const bonus = profile === 'local' ? (options?.reachBonus ?? 0) : 0;
  const range = vbReachForProfile(profile, kind) + bonus;
  const maxY = vbMaxYForProfile(profile, kind, isAirborne);

  if (vbHorizontalDistance(player, ball) > range) {
    return false;
  }

  if (ball.y < VB_HITBOX_Y_MIN || ball.y > maxY) {
    return false;
  }

  // 殺球：必須真的在跳／離地（不准「假裝跳躍」擴大範圍）
  if (kind === 'spike' && player.y < VB_SPIKE_MIN_PLAYER_Y && !options?.isJumping) {
    return false;
  }

  return true;
}
