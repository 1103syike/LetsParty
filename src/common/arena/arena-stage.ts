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

import { BUMP_STAGE_RADIUS } from '@/common/arena/bump-physics';
import { PARTY_ARENA_PALETTE } from '@/common/arena/party-arena-palette';
import { createQuaterniusFlatMaterial } from '@/common/quaternius/quaternius-materials';

/** 漫遊／分鏡切回時用的環境光（猜拳 comic panels 也會讀） */
export const PARTY_ARENA_AMBIENT = new Color3(0.58, 0.6, 0.68);
export const PARTY_ARENA_EXPOSURE = 1.1;

const CANDY_STRIPE_COUNT = 20;
const STAGE_HEIGHT = 0.82;

function flat(
  scene: Scene,
  name: string,
  color: Color3,
  roughness = 0.32,
): ReturnType<typeof createQuaterniusFlatMaterial> {
  const material = createQuaterniusFlatMaterial(scene, name, color, roughness);
  // 輕微自發光，塑膠玩具感
  material.emissiveColor = color.scale(0.08);
  return material;
}

/** 建立馬力歐派對風圓形擂台（草地頂、糖果側邊、金邊、護城河、外圈草地） */
export function createPartyArenaStage(scene: Scene, stageRadius = BUMP_STAGE_RADIUS): Mesh {
  setupPartyArenaLighting(scene);

  createSkyBackdrop(scene);
  createSea(scene);
  createOuterMeadow(scene, stageRadius);
  createRiverRing(scene, stageRadius);
  createStageBody(scene, stageRadius);
  createCandyStripes(scene, stageRadius);
  const stageTop = createStageTop(scene, stageRadius);
  createStageTrim(scene, stageRadius);
  createCenterEmblem(scene);

  return stageTop;
}

export function setupPartyArenaLighting(scene: Scene): void {
  scene.clearColor = new Color4(0.49, 0.78, 0.94, 1);
  scene.ambientColor = PARTY_ARENA_AMBIENT.clone();
  scene.imageProcessingConfiguration.exposure = PARTY_ARENA_EXPOSURE;
  scene.imageProcessingConfiguration.contrast = 1.06;
  scene.imageProcessingConfiguration.toneMappingEnabled = true;

  const hemi = new HemisphericLight('arena-hemi', new Vector3(0.12, 1, 0.18), scene);
  hemi.intensity = 1.32;
  hemi.groundColor = PARTY_ARENA_PALETTE.grass.scale(0.65);
  hemi.diffuse.set(1, 0.98, 0.94);

  const key = new DirectionalLight('arena-key', new Vector3(-0.35, -1, 0.3), scene);
  key.intensity = 0.52;
  key.diffuse.set(1, 0.96, 0.88);

  const fill = new DirectionalLight('arena-fill', new Vector3(0.55, -0.7, -0.35), scene);
  fill.intensity = 0.3;
  fill.diffuse.set(0.85, 0.9, 1);
}

function createSkyBackdrop(scene: Scene): void {
  const sky = MeshBuilder.CreateDisc('arena-sky', { radius: 58, tessellation: 48 }, scene);
  sky.rotation.x = Math.PI / 2;
  sky.position.set(0, 9, -20);
  sky.material = flat(scene, 'arena-sky-mat', PARTY_ARENA_PALETTE.sky, 0.55);
  sky.isPickable = false;

  const skyBand = MeshBuilder.CreateDisc(
    'arena-sky-band',
    { radius: 42, tessellation: 48 },
    scene,
  );
  skyBand.rotation.x = Math.PI / 2;
  skyBand.position.set(0, 7.2, -16);
  skyBand.material = flat(scene, 'arena-sky-band-mat', PARTY_ARENA_PALETTE.skyDeep, 0.55);
  skyBand.isPickable = false;
}

function createSea(scene: Scene): void {
  const sea = MeshBuilder.CreateGround('arena-sea', { width: 130, height: 130 }, scene);
  sea.position.y = -0.22;
  sea.material = flat(scene, 'arena-sea-mat', PARTY_ARENA_PALETTE.water, 0.22);
  sea.isPickable = false;
}

function createOuterMeadow(scene: Scene, stageRadius: number): void {
  const meadow = MeshBuilder.CreateDisc(
    'arena-meadow',
    { radius: Math.max(stageRadius + 22, 36), tessellation: 64 },
    scene,
  );
  meadow.rotation.x = Math.PI / 2;
  meadow.position.y = -0.05;
  meadow.material = flat(scene, 'arena-meadow-mat', PARTY_ARENA_PALETTE.meadow, 0.45);
  meadow.isPickable = false;

  // 外圈深淺草斑，讓遠景不那麼平
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + 0.2;
    const dist = stageRadius + 10 + (i % 3) * 2.4;
    const patch = MeshBuilder.CreateDisc(
      `arena-meadow-patch-${i}`,
      { radius: 2.8 + (i % 3) * 0.5, tessellation: 24 },
      scene,
    );
    patch.rotation.x = Math.PI / 2;
    patch.position.set(Math.cos(angle) * dist, -0.04, Math.sin(angle) * dist);
    patch.material = flat(
      scene,
      `arena-meadow-patch-mat-${i}`,
      i % 2 === 0 ? PARTY_ARENA_PALETTE.grass : PARTY_ARENA_PALETTE.grassDark,
      0.48,
    );
    patch.isPickable = false;
  }
}

function createRiverRing(scene: Scene, stageRadius: number): void {
  const river = MeshBuilder.CreateTorus(
    'arena-river',
    {
      diameter: (stageRadius + 4.6) * 2,
      thickness: 2.8,
      tessellation: 72,
    },
    scene,
  );
  river.rotation.x = Math.PI / 2;
  river.position.y = -0.02;
  river.material = flat(scene, 'arena-river-mat', PARTY_ARENA_PALETTE.waterDeep, 0.18);
  river.isPickable = false;
}

function createStageBody(scene: Scene, stageRadius: number): void {
  const stage = MeshBuilder.CreateCylinder(
    'arena-stage',
    {
      diameter: stageRadius * 2,
      height: STAGE_HEIGHT,
      tessellation: 48,
    },
    scene,
  );
  stage.position.y = -STAGE_HEIGHT / 2;
  stage.material = flat(scene, 'arena-stage-side-mat', PARTY_ARENA_PALETTE.platformSide, 0.4);
  stage.isPickable = false;
}

/** 擂台側壁糖果直紋（紅／白交替） */
function createCandyStripes(scene: Scene, stageRadius: number): void {
  const stripeHeight = STAGE_HEIGHT * 0.92;
  const stripeDepth = 0.14;
  const stripeWidth = ((Math.PI * 2 * stageRadius) / CANDY_STRIPE_COUNT) * 0.92;
  const radius = stageRadius + 0.02;

  for (let i = 0; i < CANDY_STRIPE_COUNT; i++) {
    const angle = (i / CANDY_STRIPE_COUNT) * Math.PI * 2;
    const color = i % 2 === 0 ? PARTY_ARENA_PALETTE.stripeA : PARTY_ARENA_PALETTE.stripeB;
    const stripe = MeshBuilder.CreateBox(
      `arena-stripe-${i}`,
      { width: stripeWidth, height: stripeHeight, depth: stripeDepth },
      scene,
    );
    stripe.position.set(
      Math.cos(angle) * radius,
      -STAGE_HEIGHT / 2,
      Math.sin(angle) * radius,
    );
    stripe.rotation.y = -angle;
    stripe.material = flat(scene, `arena-stripe-mat-${i}`, color, 0.28);
    stripe.isPickable = false;
  }
}

function createStageTop(scene: Scene, stageRadius: number): Mesh {
  const stageTop = MeshBuilder.CreateDisc(
    'arena-stage-top',
    {
      radius: stageRadius - 0.14,
      tessellation: 64,
    },
    scene,
  );
  stageTop.rotation.x = Math.PI / 2;
  stageTop.position.y = 0.02;
  stageTop.material = flat(scene, 'arena-stage-top-mat', PARTY_ARENA_PALETTE.grass, 0.42);

  // 內圈淺草地，像派對地墊中心
  const innerPad = MeshBuilder.CreateDisc(
    'arena-stage-inner',
    {
      radius: stageRadius * 0.42,
      tessellation: 48,
    },
    scene,
  );
  innerPad.rotation.x = Math.PI / 2;
  innerPad.position.y = 0.025;
  innerPad.material = flat(scene, 'arena-stage-inner-mat', PARTY_ARENA_PALETTE.meadow, 0.4);
  innerPad.isPickable = false;

  // 外緣淺色環，把草地跟金邊隔開
  const rimRing = MeshBuilder.CreateTorus(
    'arena-stage-rim-ring',
    {
      diameter: (stageRadius - 0.28) * 2,
      thickness: 0.22,
      tessellation: 64,
    },
    scene,
  );
  rimRing.rotation.x = Math.PI / 2;
  rimRing.position.y = 0.03;
  rimRing.material = flat(scene, 'arena-stage-rim-ring-mat', PARTY_ARENA_PALETTE.grassDark, 0.45);
  rimRing.isPickable = false;

  return stageTop;
}

function createStageTrim(scene: Scene, stageRadius: number): void {
  const gold = MeshBuilder.CreateTorus(
    'arena-stage-trim',
    {
      diameter: stageRadius * 2 + 0.28,
      thickness: 0.2,
      tessellation: 72,
    },
    scene,
  );
  gold.position.y = 0.05;
  gold.rotation.x = Math.PI / 2;
  gold.material = flat(scene, 'arena-trim-mat', PARTY_ARENA_PALETTE.trimGold, 0.22);
  gold.isPickable = false;

  const white = MeshBuilder.CreateTorus(
    'arena-stage-trim-outer',
    {
      diameter: stageRadius * 2 + 0.55,
      thickness: 0.12,
      tessellation: 72,
    },
    scene,
  );
  white.position.y = 0.02;
  white.rotation.x = Math.PI / 2;
  white.material = flat(scene, 'arena-trim-outer-mat', PARTY_ARENA_PALETTE.trimWhite, 0.3);
  white.isPickable = false;

  // 金邊外再點一圈彩色珠子
  const beadCount = 16;
  const beadRadius = stageRadius + 0.42;
  const beadColors = [
    PARTY_ARENA_PALETTE.stripeA,
    PARTY_ARENA_PALETTE.player2,
    PARTY_ARENA_PALETTE.player3,
    PARTY_ARENA_PALETTE.player4,
    PARTY_ARENA_PALETTE.star,
  ];

  for (let i = 0; i < beadCount; i++) {
    const angle = (i / beadCount) * Math.PI * 2;
    const bead = MeshBuilder.CreateSphere(
      `arena-bead-${i}`,
      { diameter: 0.22, segments: 10 },
      scene,
    );
    bead.position.set(Math.cos(angle) * beadRadius, 0.12, Math.sin(angle) * beadRadius);
    bead.material = flat(
      scene,
      `arena-bead-mat-${i}`,
      beadColors[i % beadColors.length]!,
      0.25,
    );
    bead.isPickable = false;
  }
}

/** 中央金色星章 */
function createCenterEmblem(scene: Scene): void {
  const base = MeshBuilder.CreateCylinder(
    'arena-emblem-base',
    { diameter: 1.55, height: 0.06, tessellation: 32 },
    scene,
  );
  base.position.y = 0.04;
  base.material = flat(scene, 'arena-emblem-base-mat', PARTY_ARENA_PALETTE.trimWhite, 0.28);
  base.isPickable = false;

  const disc = MeshBuilder.CreateCylinder(
    'arena-emblem-disc',
    { diameter: 1.25, height: 0.07, tessellation: 32 },
    scene,
  );
  disc.position.y = 0.08;
  disc.material = flat(scene, 'arena-emblem-disc-mat', PARTY_ARENA_PALETTE.trimGold, 0.2);
  disc.isPickable = false;

  // 五角星：五個扁平菱形繞中心
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const tip = MeshBuilder.CreateBox(
      `arena-star-tip-${i}`,
      { width: 0.28, height: 0.05, depth: 0.55 },
      scene,
    );
    tip.position.set(Math.cos(angle) * 0.28, 0.12, Math.sin(angle) * 0.28);
    tip.rotation.y = -angle;
    tip.material = flat(scene, `arena-star-tip-mat-${i}`, PARTY_ARENA_PALETTE.star, 0.22);
    tip.isPickable = false;
  }

  const core = MeshBuilder.CreateSphere(
    'arena-star-core',
    { diameter: 0.42, segments: 12 },
    scene,
  );
  core.position.y = 0.14;
  core.scaling.y = 0.35;
  core.material = flat(scene, 'arena-star-core-mat', PARTY_ARENA_PALETTE.starRim, 0.2);
  core.isPickable = false;
}
