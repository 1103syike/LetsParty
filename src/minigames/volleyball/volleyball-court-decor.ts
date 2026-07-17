import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
} from '@babylonjs/core';

import { createQuaterniusFlatMaterial } from '@/common/quaternius/quaternius-materials';

/** 對齊物理半場 6.0 × 8.4 */
const HALF_W = 6.0;
const HALF_D = 8.4;

// 對齊 design token，但場景刻意加深一階（淺色會糊成一團）
const COL = {
  grassA: '#3f9d6e',
  grassB: '#2f8a72',
  line: '#fffdf8',
  lineShadow: '#5c4d82',
  cloud: '#f3ecff',
  player1: '#e86b8a',
  player2: '#9b7fd4',
  player3: '#6ba8e8',
  player4: '#7ecf9a',
  accent: '#9b7fd4',
  warning: '#e8b86d',
} as const;

function hex(value: string): Color3 {
  return Color3.FromHexString(value);
}

function flat(scene: Scene, name: string, color: string) {
  return createQuaterniusFlatMaterial(scene, name, hex(color));
}

function lineBox(
  scene: Scene,
  name: string,
  width: number,
  depth: number,
  x: number,
  z: number,
): Mesh {
  // 底影線＋亮線：草地加深後白線才看得見
  const shadow = MeshBuilder.CreateBox(
    `${name}-shadow`,
    { width: width + 0.06, height: 0.02, depth: depth + 0.06 },
    scene,
  );
  shadow.position.set(x, 0.018, z);
  shadow.material = flat(scene, `${name}-shadow-mat`, COL.lineShadow);
  shadow.isPickable = false;

  const mesh = MeshBuilder.CreateBox(
    name,
    { width, height: 0.035, depth },
    scene,
  );
  mesh.position.set(x, 0.028, z);
  mesh.material = flat(scene, `${name}-mat`, COL.line);
  mesh.isPickable = false;
  return mesh;
}

/** 在草地外圍加派對裝飾（不影響物理／點選） */
export function addVolleyballCourtDecor(scene: Scene): void {
  // 雙色半場（紅隊／藍隊側）
  const halfA = MeshBuilder.CreateGround(
    'vb-half-a',
    { width: HALF_W * 2 - 0.2, height: HALF_D - 0.15 },
    scene,
  );
  halfA.position.set(0, 0.012, -HALF_D * 0.5 - 0.05);
  halfA.material = flat(scene, 'vb-half-a-mat', COL.grassA);
  halfA.isPickable = false;

  const halfB = MeshBuilder.CreateGround(
    'vb-half-b',
    { width: HALF_W * 2 - 0.2, height: HALF_D - 0.15 },
    scene,
  );
  halfB.position.set(0, 0.012, HALF_D * 0.5 + 0.05);
  halfB.material = flat(scene, 'vb-half-b-mat', COL.grassB);
  halfB.isPickable = false;

  // 外框線（加粗）
  const inset = 0.12;
  const outerW = HALF_W * 2 - inset * 2;
  const outerD = HALF_D * 2 - inset * 2;
  lineBox(scene, 'vb-line-n', outerW, 0.18, 0, -HALF_D + inset);
  lineBox(scene, 'vb-line-s', outerW, 0.18, 0, HALF_D - inset);
  lineBox(scene, 'vb-line-w', 0.18, outerD, -HALF_W + inset, 0);
  lineBox(scene, 'vb-line-e', 0.18, outerD, HALF_W - inset, 0);
  // 中線
  lineBox(scene, 'vb-line-mid', outerW, 0.16, 0, 0);
  // 兩側攻擊線（可愛分區感）
  lineBox(scene, 'vb-line-att-a', outerW * 0.92, 0.14, 0, -3.2);
  lineBox(scene, 'vb-line-att-b', outerW * 0.92, 0.14, 0, 3.2);

  addCornerFlags(scene);
  addBalloonClusters(scene);
  addClouds(scene);
  addSideFlowers(scene);
  addBench(scene, -HALF_W - 1.8, -2.5, COL.player1);
  addBench(scene, HALF_W + 1.8, 2.5, COL.player3);
}

function addCornerFlags(scene: Scene): void {
  const spots: Array<{ x: number; z: number; color: string }> = [
    { x: -HALF_W + 0.35, z: -HALF_D + 0.35, color: COL.player1 },
    { x: HALF_W - 0.35, z: -HALF_D + 0.35, color: COL.player2 },
    { x: -HALF_W + 0.35, z: HALF_D - 0.35, color: COL.player3 },
    { x: HALF_W - 0.35, z: HALF_D - 0.35, color: COL.player4 },
  ];

  spots.forEach((spot, index) => {
    const pole = MeshBuilder.CreateCylinder(
      `vb-flag-pole-${index}`,
      { height: 1.1, diameter: 0.07 },
      scene,
    );
    pole.position.set(spot.x, 0.55, spot.z);
    pole.material = flat(scene, `vb-flag-pole-mat-${index}`, COL.warning);
    pole.isPickable = false;

    const ball = MeshBuilder.CreateSphere(
      `vb-flag-ball-${index}`,
      { diameter: 0.32, segments: 12 },
      scene,
    );
    ball.position.set(spot.x, 1.2, spot.z);
    ball.material = flat(scene, `vb-flag-ball-mat-${index}`, spot.color);
    ball.isPickable = false;
  });
}

function addBalloonClusters(scene: Scene): void {
  const clusters: Array<{ x: number; z: number; colors: string[] }> = [
    {
      x: -HALF_W - 2.2,
      z: -5,
      colors: [COL.player1, COL.player2, COL.warning],
    },
    {
      x: HALF_W + 2.2,
      z: 5,
      colors: [COL.player3, COL.player4, COL.accent],
    },
    {
      x: -HALF_W - 2.0,
      z: 4.5,
      colors: [COL.player4, COL.player1],
    },
    {
      x: HALF_W + 2.0,
      z: -4.5,
      colors: [COL.player2, COL.player3],
    },
  ];

  clusters.forEach((cluster, clusterIndex) => {
    cluster.colors.forEach((color, balloonIndex) => {
      const balloon = MeshBuilder.CreateSphere(
        `vb-balloon-${clusterIndex}-${balloonIndex}`,
        { diameter: 0.55 - balloonIndex * 0.06, segments: 14 },
        scene,
      );
      balloon.position.set(
        cluster.x + (balloonIndex - 1) * 0.35,
        1.4 + balloonIndex * 0.45,
        cluster.z + balloonIndex * 0.15,
      );
      balloon.material = flat(
        scene,
        `vb-balloon-mat-${clusterIndex}-${balloonIndex}`,
        color,
      );
      balloon.isPickable = false;

      const string = MeshBuilder.CreateCylinder(
        `vb-balloon-str-${clusterIndex}-${balloonIndex}`,
        { height: balloon.position.y - 0.2, diameter: 0.03 },
        scene,
      );
      string.position.set(
        balloon.position.x,
        balloon.position.y * 0.5,
        balloon.position.z,
      );
      string.material = flat(scene, `vb-balloon-str-mat-${clusterIndex}`, COL.line);
      string.isPickable = false;
    });
  });
}

function addClouds(scene: Scene): void {
  const clouds = [
    { x: -7, y: 5.2, z: -9, s: 1.1 },
    { x: 6.5, y: 5.6, z: -8.5, s: 0.9 },
    { x: -5, y: 5.8, z: 9.5, s: 1.2 },
    { x: 7, y: 5.4, z: 8.8, s: 1 },
  ];

  clouds.forEach((cloud, index) => {
    const a = MeshBuilder.CreateSphere(
      `vb-cloud-${index}-a`,
      { diameter: 1.4 * cloud.s, segments: 10 },
      scene,
    );
    a.position.set(cloud.x, cloud.y, cloud.z);
    a.material = flat(scene, `vb-cloud-mat-${index}`, COL.cloud);
    a.isPickable = false;

    const b = a.clone(`vb-cloud-${index}-b`);
    b.position.set(cloud.x + 0.7 * cloud.s, cloud.y - 0.1, cloud.z);
    b.scaling.setAll(0.85);

    const c = a.clone(`vb-cloud-${index}-c`);
    c.position.set(cloud.x - 0.65 * cloud.s, cloud.y - 0.15, cloud.z + 0.1);
    c.scaling.setAll(0.75);
  });
}

function addSideFlowers(scene: Scene): void {
  const colors = [COL.player1, COL.player2, COL.player3, COL.warning, COL.accent];
  const spots = [
    [-HALF_W - 1.1, -6.2],
    [-HALF_W - 1.3, -1.2],
    [-HALF_W - 1.0, 3.8],
    [HALF_W + 1.1, -3.5],
    [HALF_W + 1.25, 1.5],
    [HALF_W + 1.05, 6.0],
    [-3.2, -HALF_D - 1.3],
    [2.8, -HALF_D - 1.2],
    [-2.5, HALF_D + 1.25],
    [3.4, HALF_D + 1.15],
  ] as const;

  spots.forEach(([x, z], index) => {
    const stem = MeshBuilder.CreateCylinder(
      `vb-flower-stem-${index}`,
      { height: 0.35, diameter: 0.05 },
      scene,
    );
    stem.position.set(x, 0.18, z);
    stem.material = flat(scene, `vb-flower-stem-mat-${index}`, COL.grassB);
    stem.isPickable = false;

    const petal = MeshBuilder.CreateSphere(
      `vb-flower-${index}`,
      { diameter: 0.28, segments: 10 },
      scene,
    );
    petal.position.set(x, 0.42, z);
    petal.material = flat(scene, `vb-flower-mat-${index}`, colors[index % colors.length]!);
    petal.isPickable = false;
  });
}

function addBench(scene: Scene, x: number, z: number, color: string): void {
  const seat = MeshBuilder.CreateBox(
    `vb-bench-${x}-${z}`,
    { width: 1.6, height: 0.18, depth: 0.55 },
    scene,
  );
  seat.position.set(x, 0.35, z);
  seat.material = flat(scene, `vb-bench-mat-${x}`, color);
  seat.isPickable = false;

  const legL = MeshBuilder.CreateBox(
    `vb-bench-leg-l-${x}`,
    { width: 0.12, height: 0.3, depth: 0.45 },
    scene,
  );
  legL.position.set(x - 0.55, 0.15, z);
  legL.material = flat(scene, `vb-bench-leg-mat-${x}`, COL.warning);
  legL.isPickable = false;

  const legR = legL.clone(`vb-bench-leg-r-${x}`);
  legR.position.x = x + 0.55;
}
