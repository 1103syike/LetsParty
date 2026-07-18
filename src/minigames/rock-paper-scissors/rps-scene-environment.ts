import { Mesh, Scene } from '@babylonjs/core';

import {
  PARTY_ARENA_AMBIENT,
  PARTY_ARENA_EXPOSURE,
  createPartyArenaStage,
  setupPartyArenaLighting,
} from '@/common/arena/arena-stage';
import { addPartyArenaDecor } from '@/common/arena/party-arena-decor';

/** 中央擂台半徑（動物亂跑範圍） */
export const RPS_STAGE_HALF = 6.5;

/** 漫遊鏡頭環境光（comic panels 切回時會還原） */
export const RPS_ROAMING_AMBIENT = PARTY_ARENA_AMBIENT;
export const RPS_ROAMING_EXPOSURE = PARTY_ARENA_EXPOSURE;

export function createRpsArena(scene: Scene): { stageTop: Mesh } {
  const stageTop = createPartyArenaStage(scene, RPS_STAGE_HALF);
  addPartyArenaDecor(scene, RPS_STAGE_HALF);

  return { stageTop };
}

export function setupRpsArenaLighting(scene: Scene): void {
  setupPartyArenaLighting(scene);
}

export function clampToStage(x: number, z: number): { x: number; z: number } {
  const limit = RPS_STAGE_HALF - 0.9;
  const distance = Math.hypot(x, z);

  if (distance <= limit) {
    return { x, z };
  }

  const scale = limit / distance;

  return {
    x: x * scale,
    z: z * scale,
  };
}
