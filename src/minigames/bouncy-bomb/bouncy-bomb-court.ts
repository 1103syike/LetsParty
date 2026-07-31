import {
  Color3,
  Color4,
  DirectionalLight,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';

import { createQuaterniusFlatMaterial } from '@/common/quaternius/quaternius-materials';
import {
  BB_COURT_HALF_DEPTH,
  BB_COURT_HALF_WIDTH,
  BB_NET_THICKNESS,
} from '@/minigames/bouncy-bomb/bouncy-bomb-tuning';

/** 夜市炸彈擂台：深色地面＋警戒邊＋沙袋中線（非排球場） */
export function createBouncyBombCourt(scene: Scene): { courtPickMesh: Mesh } {
  scene.clearColor = new Color4(0.12, 0.1, 0.2, 1);
  scene.ambientColor = new Color3(0.28, 0.26, 0.38);

  const hemi = new HemisphericLight('bb-hemi', new Vector3(0.2, 1, 0.15), scene);
  hemi.intensity = 0.72;
  hemi.groundColor = Color3.FromHexString('#5c4d82').scale(0.35);

  const key = new DirectionalLight('bb-key', new Vector3(-0.35, -1, 0.25), scene);
  key.intensity = 0.85;
  key.diffuse = new Color3(0.75, 0.68, 0.55);

  const rim = new DirectionalLight('bb-rim', new Vector3(0.4, -0.4, -0.6), scene);
  rim.intensity = 0.35;
  rim.diffuse = Color3.FromHexString('#9b7fd4');

  const padW = BB_COURT_HALF_WIDTH * 2 + 12;
  const padD = BB_COURT_HALF_DEPTH * 2 + 12;
  const apron = MeshBuilder.CreateGround('bb-apron', { width: padW, height: padD }, scene);
  apron.material = createQuaterniusFlatMaterial(
    scene,
    'bb-apron',
    Color3.FromHexString('#5c4d82').scale(0.28),
  );
  apron.isPickable = false;

  const courtWidth = BB_COURT_HALF_WIDTH * 2;
  const fullDepth = BB_COURT_HALF_DEPTH * 2;
  const courtY = 0.012;

  const deck = MeshBuilder.CreateGround(
    'bb-deck',
    { width: courtWidth, height: fullDepth },
    scene,
  );
  deck.position.y = courtY;
  deck.material = createQuaterniusFlatMaterial(
    scene,
    'bb-deck',
    Color3.FromHexString('#5c4d82').scale(0.42),
  );
  deck.isPickable = false;

  // 半場色帶：內縮跑道，不是整片排球色板
  addHalfLane(scene, 'a', courtWidth, courtY + 0.002);
  addHalfLane(scene, 'b', courtWidth, courtY + 0.002);
  addHazardBorder(scene, courtWidth, fullDepth, courtY + 0.004);
  addSandbagBarrier(scene, courtWidth);
  addScorchLine(scene, courtWidth, courtY + 0.006);
  addCornerProps(scene);

  const courtPickMesh = MeshBuilder.CreateGround(
    'bb-pick',
    { width: courtWidth + 2, height: fullDepth + 2 },
    scene,
  );
  courtPickMesh.position.y = 0.02;
  courtPickMesh.isVisible = false;
  courtPickMesh.isPickable = true;

  return { courtPickMesh };
}

function addHalfLane(
  scene: Scene,
  teamId: 'a' | 'b',
  courtWidth: number,
  y: number,
): void {
  const halfDepth = BB_COURT_HALF_DEPTH;
  const inset = 0.85;
  const laneW = courtWidth - inset * 2;
  const laneD = halfDepth - inset * 1.1;
  const color = teamId === 'a'
    ? Color3.FromHexString('#e86b8a').scale(0.38)
    : Color3.FromHexString('#6ba8e8').scale(0.38);
  const z = teamId === 'a' ? -halfDepth * 0.5 : halfDepth * 0.5;

  const lane = MeshBuilder.CreateGround(
    `bb-lane-${teamId}`,
    { width: laneW, height: laneD },
    scene,
  );
  lane.position.set(0, y, z);
  lane.material = createQuaterniusFlatMaterial(scene, `bb-lane-${teamId}`, color);
  lane.isPickable = false;

  const stripe = MeshBuilder.CreateGround(
    `bb-lane-edge-${teamId}`,
    { width: laneW, height: 0.18 },
    scene,
  );
  const edgeZ = teamId === 'a'
    ? -BB_NET_THICKNESS - inset * 0.5 - 0.35
    : BB_NET_THICKNESS + inset * 0.5 + 0.35;
  stripe.position.set(0, y + 0.001, edgeZ);
  stripe.material = createQuaterniusFlatMaterial(
    scene,
    `bb-lane-edge-${teamId}`,
    Color3.FromHexString('#e8b86d').scale(0.85),
  );
  stripe.isPickable = false;
}

function addHazardBorder(
  scene: Scene,
  courtWidth: number,
  fullDepth: number,
  y: number,
): void {
  const warn = Color3.FromHexString('#e8b86d');
  const dark = Color3.FromHexString('#5c4d82').scale(0.5);
  const thickness = 0.45;

  const segments: Array<{ name: string; w: number; d: number; x: number; z: number }> = [
    { name: 'n', w: courtWidth + thickness * 2, d: thickness, x: 0, z: -fullDepth * 0.5 - thickness * 0.5 },
    { name: 's', w: courtWidth + thickness * 2, d: thickness, x: 0, z: fullDepth * 0.5 + thickness * 0.5 },
    { name: 'w', w: thickness, d: fullDepth, x: -courtWidth * 0.5 - thickness * 0.5, z: 0 },
    { name: 'e', w: thickness, d: fullDepth, x: courtWidth * 0.5 + thickness * 0.5, z: 0 },
  ];

  for (const seg of segments) {
    const mesh = MeshBuilder.CreateGround(
      `bb-hazard-${seg.name}`,
      { width: seg.w, height: seg.d },
      scene,
    );
    mesh.position.set(seg.x, y, seg.z);
    const mat = new StandardMaterial(`bb-hazard-${seg.name}-mat`, scene);
    mat.diffuseColor = warn;
    mat.emissiveColor = warn.scale(0.25);
    mat.specularColor = Color3.Black();
    mesh.material = mat;
    mesh.isPickable = false;

    // 角錐：四角警戒
  }

  const corners: Array<[number, number]> = [
    [-courtWidth * 0.5, -fullDepth * 0.5],
    [courtWidth * 0.5, -fullDepth * 0.5],
    [-courtWidth * 0.5, fullDepth * 0.5],
    [courtWidth * 0.5, fullDepth * 0.5],
  ];

  corners.forEach(([cx, cz], index) => {
    const cone = MeshBuilder.CreateCylinder(
      `bb-cone-${index}`,
      { diameterTop: 0.05, diameterBottom: 0.42, height: 0.7, tessellation: 8 },
      scene,
    );
    cone.position.set(cx, 0.35, cz);
    cone.material = createQuaterniusFlatMaterial(
      scene,
      `bb-cone-${index}`,
      index % 2 === 0 ? warn : dark,
    );
    cone.isPickable = false;
  });
}

function addSandbagBarrier(scene: Scene, courtWidth: number): void {
  const bagMat = createQuaterniusFlatMaterial(
    scene,
    'bb-sandbag',
    Color3.FromHexString('#8a7ca8').scale(0.9),
  );
  const count = 9;
  const span = courtWidth - 1.2;
  const step = span / (count - 1);

  for (let i = 0; i < count; i += 1) {
    const x = -span * 0.5 + i * step;
    const bag = MeshBuilder.CreateBox(
      `bb-sandbag-${i}`,
      { width: 0.85, height: 0.55, depth: 0.5 },
      scene,
    );
    bag.position.set(x, 0.28, 0);
    bag.rotation.y = (i % 2 === 0 ? -1 : 1) * 0.08;
    bag.material = bagMat;
    bag.isPickable = false;

    if (i % 2 === 0) {
      const top = MeshBuilder.CreateBox(
        `bb-sandbag-top-${i}`,
        { width: 0.75, height: 0.4, depth: 0.42 },
        scene,
      );
      top.position.set(x + 0.05, 0.72, 0.02);
      top.material = bagMat;
      top.isPickable = false;
    }
  }
}

function addScorchLine(scene: Scene, courtWidth: number, y: number): void {
  const scorch = MeshBuilder.CreateGround(
    'bb-scorch',
    { width: courtWidth * 0.92, height: 0.55 },
    scene,
  );
  scorch.position.set(0, y, 0);
  const mat = new StandardMaterial('bb-scorch-mat', scene);
  mat.diffuseColor = Color3.FromHexString('#5c4d82').scale(0.2);
  mat.emissiveColor = Color3.FromHexString('#e86b8a').scale(0.12);
  mat.alpha = 0.85;
  mat.specularColor = Color3.Black();
  scorch.material = mat;
  scorch.isPickable = false;
}

function addCornerProps(scene: Scene): void {
  const crateMat = createQuaterniusFlatMaterial(
    scene,
    'bb-crate',
    Color3.FromHexString('#e8b86d').scale(0.55),
  );
  const tireMat = createQuaterniusFlatMaterial(
    scene,
    'bb-tire',
    Color3.FromHexString('#5c4d82').scale(0.55),
  );
  const spots: Array<{ x: number; z: number; kind: 'crate' | 'tire' }> = [
    { x: -BB_COURT_HALF_WIDTH - 1.4, z: -BB_COURT_HALF_DEPTH + 2.2, kind: 'crate' },
    { x: BB_COURT_HALF_WIDTH + 1.4, z: -BB_COURT_HALF_DEPTH + 2.5, kind: 'tire' },
    { x: -BB_COURT_HALF_WIDTH - 1.5, z: BB_COURT_HALF_DEPTH - 2.4, kind: 'tire' },
    { x: BB_COURT_HALF_WIDTH + 1.5, z: BB_COURT_HALF_DEPTH - 2.1, kind: 'crate' },
  ];

  spots.forEach((spot, index) => {
    if (spot.kind === 'crate') {
      const crate = MeshBuilder.CreateBox(
        `bb-crate-${index}`,
        { width: 1.1, height: 1.0, depth: 1.1 },
        scene,
      );
      crate.position.set(spot.x, 0.5, spot.z);
      crate.rotation.y = 0.25 * index;
      crate.material = crateMat;
      crate.isPickable = false;
      return;
    }

    const tire = MeshBuilder.CreateTorus(
      `bb-tire-${index}`,
      { diameter: 1.15, thickness: 0.28, tessellation: 18 },
      scene,
    );
    tire.position.set(spot.x, 0.28, spot.z);
    tire.rotation.x = Math.PI / 2;
    tire.material = tireMat;
    tire.isPickable = false;
  });
}
