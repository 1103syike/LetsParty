import {
  Color3,
  Color4,
  DirectionalLight,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  Vector3,
} from '@babylonjs/core';

import {
  applyStageMaterial,
  createSeaMaterial,
  createSkyMaterial,
  createStageSideMaterial,
  createStageTopMaterial,
  createStageTrimMaterial,
} from '@/minigames/rock-paper-scissors/rps-arena-materials';
import { QUATERNius_PALETTE } from '@/common/quaternius/quaternius-materials';

/** 中央擂台半徑（動物亂跑範圍） */
export const RPS_STAGE_HALF = 6.5;

export function createRpsArena(scene: Scene): { stageTop: Mesh } {
  scene.clearColor = new Color4(0.72, 0.86, 0.91, 1);
  setupRpsArenaLighting(scene);

  createSkyDisc(scene);
  createSea(scene);
  createOuterMeadow(scene);
  createRiverRing(scene);
  const stageTop = createStage(scene);
  createStageTrim(scene);

  return { stageTop };
}

/** 漫遊鏡頭：略提亮動物，但避免 exposure / ambient 過高死白 */
export const RPS_ROAMING_AMBIENT = new Color3(0.52, 0.56, 0.62);
export const RPS_ROAMING_EXPOSURE = 1.06;

export function setupRpsArenaLighting(scene: Scene): void {
  scene.ambientColor = RPS_ROAMING_AMBIENT.clone();
  scene.imageProcessingConfiguration.exposure = RPS_ROAMING_EXPOSURE;
  scene.imageProcessingConfiguration.contrast = 1.02;

  const hemi = new HemisphericLight('rps-hemi', new Vector3(0.15, 1, 0.2), scene);
  hemi.intensity = 1.26;
  hemi.groundColor = QUATERNius_PALETTE.grass.scale(0.72);
  hemi.diffuse.set(0.96, 0.97, 1);

  const key = new DirectionalLight('rps-key', new Vector3(-0.3, -1, 0.28), scene);
  key.intensity = 0.44;

  const fill = new DirectionalLight('rps-fill', new Vector3(0.5, -0.75, -0.32), scene);
  fill.intensity = 0.26;
}

function createSkyDisc(scene: Scene): void {
  const sky = MeshBuilder.CreateDisc(
    'rps-sky-disc',
    {
      radius: 55,
      tessellation: 48,
    },
    scene,
  );

  sky.rotation.x = Math.PI / 2;
  sky.position.y = 8;
  sky.position.z = -18;
  applyStageMaterial(sky, createSkyMaterial(scene));
}

function createSea(scene: Scene): void {
  const sea = MeshBuilder.CreateGround(
    'rps-sea',
    {
      width: 120,
      height: 120,
    },
    scene,
  );

  sea.position.y = -0.08;
  applyStageMaterial(sea, createSeaMaterial(scene));
}

/** 擂台外圈草地 */
function createOuterMeadow(scene: Scene): void {
  const meadow = MeshBuilder.CreateDisc(
    'rps-meadow',
    {
      radius: 54,
      tessellation: 64,
    },
    scene,
  );

  meadow.rotation.x = Math.PI / 2;
  meadow.position.y = -0.06;
  applyStageMaterial(meadow, createStageTopMaterial(scene));
}

/** 環形護城河 */
function createRiverRing(scene: Scene): void {
  const river = MeshBuilder.CreateTorus(
    'rps-river',
    {
      diameter: (RPS_STAGE_HALF + 5.2) * 2,
      thickness: 3.2,
      tessellation: 72,
    },
    scene,
  );

  river.rotation.x = Math.PI / 2;
  river.position.y = -0.03;
  applyStageMaterial(river, createSeaMaterial(scene));
}

function createStage(scene: Scene): Mesh {
  const stageRadius = RPS_STAGE_HALF;
  const stageHeight = 0.75;

  const stage = MeshBuilder.CreateCylinder(
    'rps-stage',
    {
      diameter: stageRadius * 2,
      height: stageHeight,
      tessellation: 48,
    },
    scene,
  );

  stage.position.y = -stageHeight / 2;
  applyStageMaterial(stage, createStageSideMaterial(scene));

  const stageTop = MeshBuilder.CreateDisc(
    'rps-stage-top',
    {
      radius: stageRadius - 0.15,
      tessellation: 48,
    },
    scene,
  );

  stageTop.rotation.x = Math.PI / 2;
  stageTop.position.y = 0.02;
  applyStageMaterial(stageTop, createStageTopMaterial(scene));

  return stageTop as unknown as Mesh;
}

function createStageTrim(scene: Scene): void {
  const trim = MeshBuilder.CreateTorus(
    'rps-stage-trim',
    {
      diameter: RPS_STAGE_HALF * 2 + 0.4,
      thickness: 0.18,
      tessellation: 64,
    },
    scene,
  );

  trim.position.y = 0.04;
  trim.rotation.x = Math.PI / 2;
  applyStageMaterial(trim, createStageTrimMaterial(scene));
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
