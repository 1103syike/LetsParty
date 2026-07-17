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
import {
  QUATERNius_PALETTE,
  createQuaterniusFlatMaterial,
} from '@/common/quaternius/quaternius-materials';

export function createPartyArenaStage(scene: Scene, stageRadius = BUMP_STAGE_RADIUS): Mesh {
  scene.clearColor = new Color4(0.72, 0.86, 0.91, 1);

  scene.ambientColor = new Color3(0.52, 0.56, 0.62);
  scene.imageProcessingConfiguration.exposure = 1.06;
  scene.imageProcessingConfiguration.contrast = 1.02;

  const hemi = new HemisphericLight('arena-hemi', new Vector3(0.15, 1, 0.2), scene);
  hemi.intensity = 1.26;
  hemi.groundColor = QUATERNius_PALETTE.grass.scale(0.72);
  hemi.diffuse.set(0.96, 0.97, 1);

  const key = new DirectionalLight('arena-key', new Vector3(-0.3, -1, 0.28), scene);
  key.intensity = 0.44;

  const fill = new DirectionalLight('arena-fill', new Vector3(0.5, -0.75, -0.32), scene);
  fill.intensity = 0.26;

  const sky = MeshBuilder.CreateDisc('arena-sky', { radius: 55, tessellation: 48 }, scene);
  sky.rotation.x = Math.PI / 2;
  sky.position.set(0, 8, -18);
  sky.material = createQuaterniusFlatMaterial(scene, 'arena-sky-mat', QUATERNius_PALETTE.sky);

  const sea = MeshBuilder.CreateGround('arena-sea', { width: 120, height: 120 }, scene);
  sea.position.y = -0.2;
  sea.material = createQuaterniusFlatMaterial(scene, 'arena-sea-mat', QUATERNius_PALETTE.water, 0.35);

  const stageHeight = 0.75;
  const stage = MeshBuilder.CreateCylinder(
    'arena-stage',
    {
      diameter: stageRadius * 2,
      height: stageHeight,
      tessellation: 48,
    },
    scene,
  );
  stage.position.y = -stageHeight / 2;
  stage.material = createQuaterniusFlatMaterial(
    scene,
    'arena-stage-side-mat',
    QUATERNius_PALETTE.platformSide,
  );

  const stageTop = MeshBuilder.CreateDisc(
    'arena-stage-top',
    {
      radius: stageRadius - 0.12,
      tessellation: 48,
    },
    scene,
  );
  stageTop.rotation.x = Math.PI / 2;
  stageTop.position.y = 0.02;
  stageTop.material = createQuaterniusFlatMaterial(
    scene,
    'arena-stage-top-mat',
    QUATERNius_PALETTE.grass,
  );

  const trim = MeshBuilder.CreateTorus(
    'arena-stage-trim',
    {
      diameter: stageRadius * 2 + 0.35,
      thickness: 0.16,
      tessellation: 64,
    },
    scene,
  );
  trim.position.y = 0.04;
  trim.rotation.x = Math.PI / 2;
  trim.material = createQuaterniusFlatMaterial(scene, 'arena-trim-mat', QUATERNius_PALETTE.trim);

  return stageTop;
}
