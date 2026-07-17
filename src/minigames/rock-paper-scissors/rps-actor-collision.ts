import type { RpsAnimalActor } from '@/minigames/rock-paper-scissors/rps-animal-actor';
import { clampToStage } from '@/minigames/rock-paper-scissors/rps-scene-environment';

/** 圓形 hitbox 半徑（世界座標） */
export const RPS_ACTOR_HIT_RADIUS = 0.55;

const MIN_CENTER_DISTANCE = RPS_ACTOR_HIT_RADIUS * 2;
const MIN_CENTER_DISTANCE_SQ = MIN_CENTER_DISTANCE * MIN_CENTER_DISTANCE;

export function overlapsOtherActors(
  x: number,
  z: number,
  self: RpsAnimalActor,
  allActors: RpsAnimalActor[],
): boolean {
  for (const other of allActors) {
    if (other === self) {
      continue;
    }

    const dx = x - other.root.position.x;
    const dz = z - other.root.position.z;

    if (dx * dx + dz * dz < MIN_CENTER_DISTANCE_SQ) {
      return true;
    }
  }

  return false;
}

/**
 * 嘗試移動到目標點：先全向，再滑動單軸，仍重疊則維持原位
 */
export function tryMoveWithHitbox(
  actor: RpsAnimalActor,
  desiredX: number,
  desiredZ: number,
  allActors: RpsAnimalActor[],
): { x: number; z: number } {
  const currentX = actor.root.position.x;
  const currentZ = actor.root.position.z;
  const clamped = clampToStage(desiredX, desiredZ);

  if (!overlapsOtherActors(clamped.x, clamped.z, actor, allActors)) {
    return clamped;
  }

  const slideX = clampToStage(desiredX, currentZ);

  if (!overlapsOtherActors(slideX.x, slideX.z, actor, allActors)) {
    return slideX;
  }

  const slideZ = clampToStage(currentX, desiredZ);

  if (!overlapsOtherActors(slideZ.x, slideZ.z, actor, allActors)) {
    return slideZ;
  }

  return { x: currentX, z: currentZ };
}

/** 出生／重設時找不與其他角色重疊的位置 */
export function findSpawnPosition(
  actor: RpsAnimalActor,
  allActors: RpsAnimalActor[],
  pickRandom: () => { x: number; z: number },
  maxAttempts = 32,
): { x: number; z: number } {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const picked = pickRandom();
    const candidate = clampToStage(picked.x, picked.z);

    if (!overlapsOtherActors(candidate.x, candidate.z, actor, allActors)) {
      return candidate;
    }
  }

  const index = allActors.indexOf(actor);
  const angle = (index / Math.max(1, allActors.length)) * Math.PI * 2;
  const ringRadius = MIN_CENTER_DISTANCE + 0.35;

  return clampToStage(
    Math.cos(angle) * ringRadius,
    Math.sin(angle) * ringRadius,
  );
}
