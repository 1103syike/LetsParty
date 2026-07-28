import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  Vector3,
} from '@babylonjs/core';

import { BUMP_STAGE_RADIUS } from '@/common/arena/bump-physics';
import {
  PARTY_ARENA_PALETTE,
  PARTY_ARENA_PLAYER_COLORS,
} from '@/common/arena/party-arena-palette';
import { createQuaterniusFlatMaterial } from '@/common/quaternius/quaternius-materials';

function flat(scene: Scene, name: string, color: Color3, roughness = 0.3) {
  const material = createQuaterniusFlatMaterial(scene, name, color, roughness);
  material.emissiveColor = color.scale(0.1);
  return material;
}

function unpickable(mesh: Mesh): Mesh {
  mesh.isPickable = false;
  return mesh;
}

/**
 * 擂台周圍派對裝飾：四色旗杆、氣球串、棉花糖雲、漂浮星星。
 * 幾何都放在擂台半徑外，不影響碰撞。
 */
export function addPartyArenaDecor(scene: Scene, stageRadius = BUMP_STAGE_RADIUS): void {
  addCornerPosts(scene, stageRadius);
  addBalloonClusters(scene, stageRadius);
  addCandyClouds(scene, stageRadius);
  addFloatingStars(scene, stageRadius);
  addRimFlowers(scene, stageRadius);
}

function addCornerPosts(scene: Scene, stageRadius: number): void {
  const dist = stageRadius + 2.35;

  PARTY_ARENA_PLAYER_COLORS.forEach((color, index) => {
    const angle = (index / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;

    const pole = unpickable(
      MeshBuilder.CreateCylinder(
        `arena-post-pole-${index}`,
        { height: 1.35, diameter: 0.1, tessellation: 10 },
        scene,
      ),
    );
    pole.position.set(x, 0.68, z);
    pole.material = flat(scene, `arena-post-pole-mat-${index}`, PARTY_ARENA_PALETTE.pole, 0.25);

    const base = unpickable(
      MeshBuilder.CreateCylinder(
        `arena-post-base-${index}`,
        { height: 0.12, diameter: 0.42, tessellation: 12 },
        scene,
      ),
    );
    base.position.set(x, 0.06, z);
    base.material = flat(scene, `arena-post-base-mat-${index}`, PARTY_ARENA_PALETTE.trimWhite, 0.35);

    const ball = unpickable(
      MeshBuilder.CreateSphere(
        `arena-post-ball-${index}`,
        { diameter: 0.48, segments: 12 },
        scene,
      ),
    );
    ball.position.set(x, 1.48, z);
    ball.material = flat(scene, `arena-post-ball-mat-${index}`, color, 0.25);

    // 小旗布：扁平盒子
    const flag = unpickable(
      MeshBuilder.CreateBox(
        `arena-post-flag-${index}`,
        { width: 0.55, height: 0.32, depth: 0.04 },
        scene,
      ),
    );
    flag.position.set(
      x + Math.cos(angle) * 0.28,
      1.15,
      z + Math.sin(angle) * 0.28,
    );
    flag.rotation.y = -angle;
    flag.material = flat(scene, `arena-post-flag-mat-${index}`, color, 0.35);
  });
}

function addBalloonClusters(scene: Scene, stageRadius: number): void {
  const clusters: Array<{ angle: number; colors: Array<(typeof PARTY_ARENA_PLAYER_COLORS)[number]> }> = [
    {
      angle: 0,
      colors: [
        PARTY_ARENA_PALETTE.player1,
        PARTY_ARENA_PALETTE.player2,
        PARTY_ARENA_PALETTE.star,
      ],
    },
    {
      angle: Math.PI / 2,
      colors: [
        PARTY_ARENA_PALETTE.player3,
        PARTY_ARENA_PALETTE.player4,
        PARTY_ARENA_PALETTE.stripeA,
      ],
    },
    {
      angle: Math.PI,
      colors: [
        PARTY_ARENA_PALETTE.player2,
        PARTY_ARENA_PALETTE.player1,
        PARTY_ARENA_PALETTE.trimGold,
      ],
    },
    {
      angle: (Math.PI * 3) / 2,
      colors: [
        PARTY_ARENA_PALETTE.player4,
        PARTY_ARENA_PALETTE.player3,
        PARTY_ARENA_PALETTE.accent,
      ],
    },
  ];

  const dist = stageRadius + 3.6;

  clusters.forEach((cluster, clusterIndex) => {
    const cx = Math.cos(cluster.angle) * dist;
    const cz = Math.sin(cluster.angle) * dist;

    cluster.colors.forEach((color, balloonIndex) => {
      const offset = (balloonIndex - 1) * 0.38;
      const bx = cx + Math.cos(cluster.angle + Math.PI / 2) * offset;
      const bz = cz + Math.sin(cluster.angle + Math.PI / 2) * offset;
      const by = 1.55 + balloonIndex * 0.5;
      const diameter = 0.58 - balloonIndex * 0.06;

      const balloon = unpickable(
        MeshBuilder.CreateSphere(
          `arena-balloon-${clusterIndex}-${balloonIndex}`,
          { diameter, segments: 14 },
          scene,
        ),
      );
      balloon.position.set(bx, by, bz);
      balloon.scaling.y = 1.12;
      balloon.material = flat(
        scene,
        `arena-balloon-mat-${clusterIndex}-${balloonIndex}`,
        color,
        0.22,
      );

      const knot = unpickable(
        MeshBuilder.CreateSphere(
          `arena-balloon-knot-${clusterIndex}-${balloonIndex}`,
          { diameter: 0.1, segments: 8 },
          scene,
        ),
      );
      knot.position.set(bx, by - diameter * 0.55, bz);
      knot.material = flat(
        scene,
        `arena-balloon-knot-mat-${clusterIndex}-${balloonIndex}`,
        PARTY_ARENA_PALETTE.trimWhite,
        0.4,
      );

      const stringHeight = by - 0.15;
      const string = unpickable(
        MeshBuilder.CreateCylinder(
          `arena-balloon-str-${clusterIndex}-${balloonIndex}`,
          { height: stringHeight, diameter: 0.025, tessellation: 6 },
          scene,
        ),
      );
      string.position.set(bx, stringHeight * 0.5, bz);
      string.material = flat(
        scene,
        `arena-balloon-str-mat-${clusterIndex}`,
        PARTY_ARENA_PALETTE.trimWhite,
        0.5,
      );
    });
  });
}

function addCandyClouds(scene: Scene, stageRadius: number): void {
  const clouds = [
    { x: -stageRadius - 6, y: 5.4, z: -stageRadius - 4, s: 1.15 },
    { x: stageRadius + 5.5, y: 5.9, z: -stageRadius - 5, s: 0.95 },
    { x: -stageRadius - 4, y: 6.1, z: stageRadius + 5.5, s: 1.25 },
    { x: stageRadius + 6, y: 5.6, z: stageRadius + 4.5, s: 1.05 },
    { x: 0, y: 6.4, z: -stageRadius - 8, s: 1.35 },
  ];

  clouds.forEach((cloud, index) => {
    const a = unpickable(
      MeshBuilder.CreateSphere(
        `arena-cloud-${index}-a`,
        { diameter: 1.55 * cloud.s, segments: 10 },
        scene,
      ),
    );
    a.position.set(cloud.x, cloud.y, cloud.z);
    a.material = flat(scene, `arena-cloud-mat-${index}`, PARTY_ARENA_PALETTE.cloud, 0.55);

    const b = a.clone(`arena-cloud-${index}-b`);
    b.position = new Vector3(cloud.x + 0.75 * cloud.s, cloud.y - 0.08, cloud.z);
    b.scaling.setAll(0.88);

    const c = a.clone(`arena-cloud-${index}-c`);
    c.position = new Vector3(cloud.x - 0.7 * cloud.s, cloud.y - 0.12, cloud.z + 0.1);
    c.scaling.setAll(0.78);

    const d = a.clone(`arena-cloud-${index}-d`);
    d.position = new Vector3(cloud.x + 0.15 * cloud.s, cloud.y + 0.25, cloud.z - 0.15);
    d.scaling.setAll(0.7);
  });
}

function addFloatingStars(scene: Scene, stageRadius: number): void {
  const count = 10;
  const dist = stageRadius + 5.2;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + 0.15;
    const y = 2.2 + (i % 3) * 0.55;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const color = i % 2 === 0 ? PARTY_ARENA_PALETTE.star : PARTY_ARENA_PALETTE.trimGold;

    const hub = unpickable(
      MeshBuilder.CreateSphere(
        `arena-float-star-${i}`,
        { diameter: 0.28, segments: 8 },
        scene,
      ),
    );
    hub.position.set(x, y, z);
    hub.material = flat(scene, `arena-float-star-mat-${i}`, color, 0.2);

    for (let tip = 0; tip < 4; tip++) {
      const tipAngle = (tip / 4) * Math.PI * 2 + Math.PI / 4;
      const arm = unpickable(
        MeshBuilder.CreateBox(
          `arena-float-star-arm-${i}-${tip}`,
          { width: 0.12, height: 0.08, depth: 0.32 },
          scene,
        ),
      );
      arm.position.set(
        x + Math.cos(tipAngle) * 0.16,
        y,
        z + Math.sin(tipAngle) * 0.16,
      );
      arm.rotation.y = -tipAngle;
      arm.material = flat(scene, `arena-float-star-arm-mat-${i}-${tip}`, color, 0.2);
    }
  }
}

function addRimFlowers(scene: Scene, stageRadius: number): void {
  const colors = [
    PARTY_ARENA_PALETTE.player1,
    PARTY_ARENA_PALETTE.player2,
    PARTY_ARENA_PALETTE.player3,
    PARTY_ARENA_PALETTE.player4,
    PARTY_ARENA_PALETTE.star,
    PARTY_ARENA_PALETTE.stripeA,
  ];
  const count = 14;
  const dist = stageRadius + 1.55;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + 0.08;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const color = colors[i % colors.length]!;

    const stem = unpickable(
      MeshBuilder.CreateCylinder(
        `arena-flower-stem-${i}`,
        { height: 0.28, diameter: 0.045, tessellation: 6 },
        scene,
      ),
    );
    stem.position.set(x, 0.14, z);
    stem.material = flat(scene, `arena-flower-stem-mat-${i}`, PARTY_ARENA_PALETTE.grassDark, 0.5);

    const petal = unpickable(
      MeshBuilder.CreateSphere(
        `arena-flower-${i}`,
        { diameter: 0.26, segments: 10 },
        scene,
      ),
    );
    petal.position.set(x, 0.34, z);
    petal.material = flat(scene, `arena-flower-mat-${i}`, color, 0.3);

    const center = unpickable(
      MeshBuilder.CreateSphere(
        `arena-flower-center-${i}`,
        { diameter: 0.12, segments: 8 },
        scene,
      ),
    );
    center.position.set(x, 0.4, z);
    center.material = flat(scene, `arena-flower-center-mat-${i}`, PARTY_ARENA_PALETTE.star, 0.25);
  }
}
