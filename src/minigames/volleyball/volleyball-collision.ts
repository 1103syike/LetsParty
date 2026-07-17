/**
 * 排球碰撞／Hitbox 單位（世界座標公尺感）
 * 所有判定只准用這裡的常數，禁止在邏輯裡散落 magic number。
 */

/** 角色身體水平半徑（站位推擠、分離） */
export const VB_PLAYER_BODY_RADIUS = 0.55;

/** 球半徑 */
export const VB_BALL_RADIUS = 0.24;

/** 擊球／舉球水平 hitbox（中心距 ≤ 此值可觸球；要貼身，不要隱形立場） */
export const VB_HITBOX_BUMP = VB_PLAYER_BODY_RADIUS + VB_BALL_RADIUS + 0.06;

/** 殺球水平 hitbox（略大，跳起較好摸到） */
export const VB_HITBOX_SPIKE = VB_HITBOX_BUMP + 0.08;

/** 觸球高度帶：球心 y 落在此區間才算打得到 */
export const VB_HITBOX_Y_MIN = 0.35;
export const VB_HITBOX_Y_MAX_BUMP = 2.35;
export const VB_HITBOX_Y_MAX_SPIKE = 2.9;

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

/** 是否在對應擊球種類的 hitbox 內 */
export function vbCanHitBall(
  player: VbBody2D,
  ball: VbBody2D,
  kind: VbHitKind,
  options?: { isJumping?: boolean },
): boolean {
  const range = kind === 'spike' ? VB_HITBOX_SPIKE : VB_HITBOX_BUMP;
  const maxY = kind === 'spike' ? VB_HITBOX_Y_MAX_SPIKE : VB_HITBOX_Y_MAX_BUMP;

  if (vbHorizontalDistance(player, ball) > range) {
    return false;
  }

  if (ball.y < VB_HITBOX_Y_MIN || ball.y > maxY) {
    return false;
  }

  // 殺球：已離地，或跳躍過程中（剛起跳 y 還低也算）
  if (kind === 'spike' && player.y < VB_SPIKE_MIN_PLAYER_Y && !options?.isJumping) {
    return false;
  }

  return true;
}
