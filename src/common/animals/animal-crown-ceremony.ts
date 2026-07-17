import {
  Color3,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  SceneLoader,
  TransformNode,
  Vector3,
} from '@babylonjs/core';

import '@babylonjs/loaders/glTF';

import type { AnimalActor } from '@/common/animals/animal-actor';
import { CROWN_MODEL_SOURCE } from '@/common/animals/crown-assets';

const CROWN_GOLD = Color3.FromHexString('#f4c542');
const CROWN_GEM = Color3.FromHexString('#ff8fab');

/** GLB 模板縮放；落下動畫在此基礎上再插值 */
const CROWN_MODEL_SCALE = 0.22;
const CROWN_DROP_SCALE_START = 0.18;
const CROWN_DROP_SCALE_END = 0.3;
/**
 * 皇冠 root 約在模型中心，要再往上抬才不會把圈緣埋進頭裡。
 * 基準點改為 mesh 最高點（見 getCrownSeatTarget）。
 */
const CROWN_HEAD_OFFSET_Y = 0.2;

interface CrownDropState {
  root: TransformNode;
  actor: AnimalActor;
  startY: number;
  targetY: number;
  delayMs: number;
}

interface CeremonySpot {
  x: number;
  z: number;
}

export interface CeremonyCameraPlan {
  radius: number;
  beta: number;
  focusY: number;
  focusX: number;
  focusZ: number;
}

/**
 * 落敗者退到鏡頭遠側（+Z），不搶戲。
 * 頒冠鏡頭固定從 -Z 看向 +Z，贏家站近側，輸家站遠側。
 */
const CEREMONY_LOSER_SPOTS: CeremonySpot[] = [
  { x: -3.2, z: 2.8 },
  { x: 3.2, z: 2.8 },
  { x: -3.2, z: 3.8 },
  { x: 3.2, z: 3.8 },
];

/**
 * 依贏家人數給對稱站位（一律 -Z：鏡頭前、球網這一側）：
 * 1 人居中特寫、2 人左右並排、3 人品字、4 人扇形。
 */
function resolveWinnerSpots(winnerCount: number): CeremonySpot[] {
  if (winnerCount <= 1) {
    return [{ x: 0, z: -1.25 }];
  }

  if (winnerCount === 2) {
    return [
      { x: -1.15, z: -1.2 },
      { x: 1.15, z: -1.2 },
    ];
  }

  if (winnerCount === 3) {
    return [
      { x: 0, z: -1.35 },
      { x: -1.45, z: -0.85 },
      { x: 1.45, z: -0.85 },
    ];
  }

  return [
    { x: -1.55, z: -1.25 },
    { x: 1.55, z: -1.25 },
    { x: -0.85, z: -0.55 },
    { x: 0.85, z: -0.55 },
  ];
}

function resolveCameraPlanFromSpots(spots: CeremonySpot[]): CeremonyCameraPlan {
  if (spots.length === 0) {
    return { radius: 6.2, beta: 1.08, focusY: 1.05, focusX: 0, focusZ: -1.0 };
  }

  let minX = spots[0].x;
  let maxX = spots[0].x;
  let minZ = spots[0].z;
  let maxZ = spots[0].z;

  for (const spot of spots) {
    minX = Math.min(minX, spot.x);
    maxX = Math.max(maxX, spot.x);
    minZ = Math.min(minZ, spot.z);
    maxZ = Math.max(maxZ, spot.z);
  }

  const focusX = (minX + maxX) / 2;
  const focusZ = (minZ + maxZ) / 2;
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const span = Math.max(spanX, spanZ, 0.5);

  return {
    radius: 6 + span * 1.55 + spots.length * 0.35,
    beta: 1.06 + Math.min(span * 0.07, 0.18),
    focusY: 1.02 + Math.min(span * 0.08, 0.2),
    focusX,
    focusZ,
  };
}

function easeOutBack(progress: number): number {
  const overshoot = 1.4;

  return 1 + (overshoot + 1) * (progress - 1) ** 3 + overshoot * (progress - 1) ** 2;
}

function createProceduralCrown(scene: Scene): TransformNode {
  const root = new TransformNode('party-crown-procedural', scene);
  const material = new PBRMaterial('party-crown-procedural-mat', scene);
  material.albedoColor = CROWN_GOLD;
  material.emissiveColor = CROWN_GOLD.scale(0.18);
  material.metallic = 0.42;
  material.roughness = 0.38;

  const band = MeshBuilder.CreateTorus(
    'party-crown-band',
    {
      diameter: 0.52,
      thickness: 0.11,
      tessellation: 18,
    },
    scene,
  );
  band.parent = root;
  band.rotation.x = Math.PI / 2;
  band.material = material;

  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2;
    const spike = MeshBuilder.CreateCylinder(
      `party-crown-spike-${index}`,
      {
        height: 0.24,
        diameterTop: 0.04,
        diameterBottom: 0.12,
        tessellation: 4,
      },
      scene,
    );
    spike.parent = root;
    spike.position.set(Math.cos(angle) * 0.26, 0.14, Math.sin(angle) * 0.26);
    spike.material = material;

    const gem = MeshBuilder.CreateSphere(
      `party-crown-gem-${index}`,
      {
        diameter: 0.08,
        segments: 6,
      },
      scene,
    );
    gem.parent = root;
    gem.position.set(Math.cos(angle) * 0.26, 0.28, Math.sin(angle) * 0.26);
    const gemMat = material.clone(`party-crown-gem-mat-${index}`);
    gemMat.albedoColor = CROWN_GEM;
    gemMat.emissiveColor = CROWN_GEM.scale(0.35);
    gem.material = gemMat;
  }

  return root;
}

async function loadCrownTemplate(scene: Scene): Promise<TransformNode> {
  try {
    const result = await SceneLoader.ImportMeshAsync('', '/models/rps/', 'crown.glb', scene);
    const root = new TransformNode('party-crown-template', scene);

    for (const mesh of result.meshes) {
      if (mesh instanceof Mesh) {
        mesh.parent = root;
        mesh.position.set(0, 0, 0);
        mesh.rotation.set(0, 0, 0);

        const material = mesh.material;

        if (material instanceof PBRMaterial) {
          material.emissiveColor = material.emissiveColor.add(CROWN_GOLD.scale(0.08));
        }
      }
    }

    root.scaling.setAll(CROWN_MODEL_SCALE);
    root.setEnabled(false);

    return root;
  } catch (error) {
    console.warn(`[crown] crown.glb 載入失敗，改用程式生成。來源：${CROWN_MODEL_SOURCE}`, error);
    const fallback = createProceduralCrown(scene);
    fallback.scaling.setAll(CROWN_MODEL_SCALE);
    fallback.setEnabled(false);

    return fallback;
  }
}

export class AnimalCrownCeremony {
  private crownTemplate: TransformNode | null = null;

  private drops: CrownDropState[] = [];

  private winnerSpots: CeremonySpot[] = [];

  private lockedFocus: Vector3 | null = null;

  private cameraPlan: CeremonyCameraPlan = resolveCameraPlanFromSpots([]);

  private elapsedMs = 0;

  private durationMs = 3400;

  private active = false;

  constructor(private readonly scene: Scene) {}

  async preload(): Promise<void> {
    if (this.crownTemplate) {
      return;
    }

    this.crownTemplate = await loadCrownTemplate(this.scene);
  }

  arrangeActors(
    actors: AnimalActor[],
    participantIds: string[],
    winnerIds: string[],
  ): void {
    const winnerSet = new Set(winnerIds);
    this.winnerSpots = resolveWinnerSpots(winnerIds.length);
    this.cameraPlan = resolveCameraPlanFromSpots(this.winnerSpots);
    this.lockedFocus = new Vector3(
      this.cameraPlan.focusX,
      this.cameraPlan.focusY,
      this.cameraPlan.focusZ,
    );

    let winnerSpotIndex = 0;
    let loserSpotIndex = 0;

    for (let slotIndex = 0; slotIndex < actors.length; slotIndex += 1) {
      const actor = actors[slotIndex];
      const participantId = participantIds[slotIndex];

      if (!actor || !participantId) {
        continue;
      }

      if (winnerSet.has(participantId)) {
        const spot = this.winnerSpots[winnerSpotIndex] ?? this.winnerSpots[0];
        winnerSpotIndex += 1;
        actor.setPosition(spot.x, spot.z);
        // 面向鏡頭（-Z），多人並排時不會互盯對方
        actor.faceWorldDirection(0, -1);
        actor.playCelebrate();
        continue;
      }

      const backSpot = CEREMONY_LOSER_SPOTS[loserSpotIndex] ?? CEREMONY_LOSER_SPOTS[0];
      loserSpotIndex += 1;
      actor.setPosition(backSpot.x, backSpot.z);
      actor.faceTowardCenter();
      actor.playFaint();
    }
  }

  begin(winners: AnimalActor[], durationMs: number): void {
    if (!this.crownTemplate) {
      return;
    }

    this.durationMs = durationMs;
    this.elapsedMs = 0;
    this.active = true;
    this.clearDrops();

    winners.forEach((actor, index) => {
      const crownRoot = this.crownTemplate!.clone(`party-crown-drop-${index}`, null);

      if (!crownRoot) {
        return;
      }

      crownRoot.setEnabled(true);

      const seat = actor.getCrownSeatTarget();
      const startY = seat.y + 2.6;
      const targetY = seat.y + CROWN_HEAD_OFFSET_Y;

      crownRoot.position.set(seat.x, startY, seat.z);
      crownRoot.scaling.setAll(0.001);

      this.drops.push({
        root: crownRoot,
        actor,
        startY,
        targetY,
        delayMs: index * 320,
      });
    });
  }

  update(deltaMs: number): void {
    if (!this.active) {
      return;
    }

    this.elapsedMs += deltaMs;
    const dropDurationMs = Math.max(900, this.durationMs - 900);

    for (const drop of this.drops) {
      const seat = drop.actor.getCrownSeatTarget();
      drop.root.position.x = seat.x;
      drop.root.position.z = seat.z;
      drop.targetY = seat.y + CROWN_HEAD_OFFSET_Y;

      const localMs = this.elapsedMs - drop.delayMs;

      if (localMs < 0) {
        drop.root.position.y = drop.startY;
        drop.root.scaling.setAll(0.001);
        continue;
      }

      const progress = Math.min(1, localMs / dropDurationMs);
      const eased = easeOutBack(progress);

      drop.root.position.y = drop.startY + (drop.targetY - drop.startY) * eased;

      const scaleRange = CROWN_DROP_SCALE_END - CROWN_DROP_SCALE_START;
      const baseScale = CROWN_DROP_SCALE_START + eased * scaleRange;
      const pulse = 1 + Math.sin(this.elapsedMs * 0.012) * 0.04;
      drop.root.scaling.setAll(baseScale * pulse);
      drop.root.rotation.y += deltaMs * 0.0025;
    }

    if (this.elapsedMs >= this.durationMs) {
      this.active = false;
    }
  }

  isActive(): boolean {
    return this.active;
  }

  getFocusTarget(): Vector3 {
    if (this.lockedFocus) {
      return this.lockedFocus.clone();
    }

    const plan = this.cameraPlan;

    return new Vector3(plan.focusX, plan.focusY, plan.focusZ);
  }

  getCameraPlan(): CeremonyCameraPlan {
    return this.cameraPlan;
  }

  dispose(): void {
    this.clearDrops();
    this.winnerSpots = [];
    this.lockedFocus = null;
    this.cameraPlan = resolveCameraPlanFromSpots([]);
    this.crownTemplate?.dispose();
    this.crownTemplate = null;
  }

  private clearDrops(): void {
    for (const drop of this.drops) {
      drop.root.dispose();
    }

    this.drops = [];
  }
}
