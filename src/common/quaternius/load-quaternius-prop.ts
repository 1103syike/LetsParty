import {
  AbstractMesh,
  Color3,
  Mesh,
  PBRMaterial,
  Scene,
  SceneLoader,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';

import '@babylonjs/loaders/glTF';

import {
  QUATERNius_PROP_FOLDER,
  QUATERNius_PROPS,
} from '@/common/quaternius/quaternius-assets';

interface QuaterniusPropOptions {
  position?: Vector3;
  scaling?: number;
  rotationY?: number;
  name?: string;
  /** flowers.glb 等多 mesh 檔：只保留指定節點 */
  meshName?: string;
}

interface ScatterSpec {
  x: number;
  z: number;
  scale: number;
  rot: number;
  meshName?: string;
}

function brightenPropMaterials(meshes: AbstractMesh[]): void {
  for (const mesh of meshes) {
    if (!(mesh instanceof Mesh)) {
      continue;
    }

    const material = mesh.material;

    if (material instanceof PBRMaterial) {
      material.metallic = 0;
      material.roughness = Math.min(material.roughness ?? 1, 0.9) * 0.88;
      material.emissiveColor = material.emissiveColor.add(new Color3(0.05, 0.06, 0.04));
      continue;
    }

    if (material instanceof StandardMaterial) {
      material.emissiveColor = new Color3(0.05, 0.06, 0.04);
    }
  }
}

export async function loadQuaterniusProp(
  scene: Scene,
  fileName: string,
  options: QuaterniusPropOptions = {},
): Promise<TransformNode> {
  const container = new TransformNode(options.name ?? `rps-quat-${fileName.replace('.glb', '')}`, scene);
  const result = await SceneLoader.ImportMeshAsync(
    options.meshName ?? '',
    QUATERNius_PROP_FOLDER,
    fileName,
    scene,
  );

  for (const mesh of result.meshes) {
    if (options.meshName && mesh.name !== options.meshName) {
      mesh.setEnabled(false);
      mesh.isVisible = false;
      continue;
    }

    mesh.parent = container;
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scaling.set(1, 1, 1);
  }

  brightenPropMaterials(result.meshes);

  if (options.scaling !== undefined) {
    container.scaling.setAll(options.scaling);
  }

  if (options.position) {
    container.position.copyFrom(options.position);
  }

  if (options.rotationY !== undefined) {
    container.rotation.y = options.rotationY;
  }

  return container;
}

async function scatterProps(
  scene: Scene,
  fileName: string,
  prefix: string,
  specs: ScatterSpec[],
  y = 0.05,
): Promise<void> {
  await Promise.all(
    specs.map((spec, index) =>
      loadQuaterniusProp(scene, fileName, {
        name: `rps-quat-${prefix}-${index}`,
        position: new Vector3(spec.x, y, spec.z),
        scaling: spec.scale,
        rotationY: spec.rot,
        meshName: spec.meshName,
      }),
    ),
  );
}

export async function spawnQuaterniusArenaDecor(scene: Scene): Promise<void> {
  const cloudSpecs: ScatterSpec[] = [
    { x: -18, z: -14, scale: 2.6, rot: 0.2 },
    { x: 14, z: -18, scale: 2.1, rot: -0.4 },
    { x: -12, z: 16, scale: 2.4, rot: 0.5 },
    { x: 20, z: 10, scale: 2.0, rot: -0.1 },
    { x: -22, z: 4, scale: 1.8, rot: 0.8 },
    { x: 8, z: 22, scale: 2.2, rot: 1.4 },
  ];

  await scatterProps(scene, QUATERNius_PROPS.cloud, 'cloud', cloudSpecs, 6.2);

  const treeSpecs: ScatterSpec[] = [
    { x: -17, z: -10, scale: 0.11, rot: 0.35 },
    { x: 17, z: -11, scale: 0.1, rot: -0.55 },
    { x: -16, z: 12, scale: 0.105, rot: 1.1 },
    { x: 16, z: 13, scale: 0.095, rot: 2.2 },
    { x: -20, z: 0, scale: 0.09, rot: 0.9 },
    { x: 20, z: -2, scale: 0.1, rot: -1.2 },
    { x: 0, z: -19, scale: 0.1, rot: 0.15 },
    { x: -2, z: 19, scale: 0.095, rot: 3.1 },
  ];

  await scatterProps(scene, QUATERNius_PROPS.tree, 'tree', treeSpecs, 0.02);

  const bushSpecs: ScatterSpec[] = [
    { x: -11.5, z: -5.5, scale: 0.95, rot: 0.2 },
    { x: 11.2, z: -6, scale: 0.88, rot: -0.35 },
    { x: -10.8, z: 6.2, scale: 0.92, rot: 0.75 },
    { x: 10.5, z: 5.8, scale: 0.9, rot: 1.6 },
    { x: -13, z: 0.5, scale: 0.85, rot: 2.4 },
    { x: 13.2, z: -0.8, scale: 0.87, rot: -1.8 },
    { x: 0.5, z: -12.5, scale: 0.82, rot: 0.5 },
    { x: -0.8, z: 12.8, scale: 0.84, rot: 2.9 },
  ];

  await scatterProps(scene, QUATERNius_PROPS.bush, 'bush', bushSpecs, 0.04);

  const rockSpecs: ScatterSpec[] = [
    { x: -8.8, z: -8.2, scale: 1.35, rot: 0.8 },
    { x: 8.5, z: -8.5, scale: 1.2, rot: 2.1 },
    { x: -8.2, z: 8.6, scale: 1.28, rot: 4.2 },
    { x: 8.8, z: 8.2, scale: 1.4, rot: 5.5 },
    { x: -14, z: -3, scale: 1.05, rot: 1.3 },
    { x: 14.2, z: 2.5, scale: 1.1, rot: -0.7 },
    { x: 2, z: -14.5, scale: 0.95, rot: 3.3 },
    { x: -3, z: 14.8, scale: 1.0, rot: 0.4 },
    { x: -12, z: 9, scale: 0.75, rot: 2.0 },
    { x: 11, z: -10, scale: 0.8, rot: 4.5 },
  ];

  await scatterProps(scene, QUATERNius_PROPS.rock, 'rock', rockSpecs, 0.28);

  /** https://poly.pizza/m/NrJN7UcglF — 綠色小灌木 */
  const plantSpecs: ScatterSpec[] = [
    { x: -9.5, z: 0, scale: 0.42, rot: 0.3 },
    { x: 9.2, z: 0.5, scale: 0.38, rot: -0.5 },
    { x: 0, z: -9.8, scale: 0.4, rot: 1.2 },
    { x: 0.3, z: 9.5, scale: 0.39, rot: 2.4 },
    { x: -12.5, z: -7, scale: 0.36, rot: 0.9 },
    { x: 12.8, z: 7.5, scale: 0.37, rot: -1.1 },
    { x: -7.2, z: -3.5, scale: 0.34, rot: 1.7 },
    { x: 7.5, z: 3.2, scale: 0.35, rot: 2.8 },
  ];

  await scatterProps(scene, QUATERNius_PROPS.plant, 'plant', plantSpecs, 0.03);

  /** https://poly.pizza/m/vUJjrRsFp4 — Grass_Common_Short（鮮綠短草，不是 Grass_3 枯草） */
  const grassSpecs: ScatterSpec[] = [
    { x: -5.8, z: -5.2, scale: 0.72, rot: 0.1 },
    { x: 5.5, z: -5.5, scale: 0.68, rot: 0.7 },
    { x: -5.2, z: 5.8, scale: 0.7, rot: 1.4 },
    { x: 5.8, z: 5.2, scale: 0.66, rot: 2.1 },
    { x: -4.2, z: 0, scale: 0.64, rot: 0.5 },
    { x: 4.5, z: 0.3, scale: 0.65, rot: 1.8 },
    { x: 0, z: -4.8, scale: 0.62, rot: 2.6 },
    { x: 0.2, z: 4.6, scale: 0.67, rot: 3.2 },
    { x: -6.2, z: 2.5, scale: 0.6, rot: 0.9 },
    { x: 6.4, z: -2.2, scale: 0.58, rot: 1.5 },
    { x: -2.8, z: -6, scale: 0.56, rot: 2.2 },
    { x: 3, z: 6.1, scale: 0.61, rot: 2.9 },
    { x: -11, z: -4, scale: 0.74, rot: 0.3 },
    { x: 11.5, z: 4, scale: 0.72, rot: 1.1 },
    { x: -10.5, z: 5, scale: 0.7, rot: 1.7 },
    { x: 10.8, z: -5.5, scale: 0.73, rot: 2.5 },
    { x: -13.5, z: 1, scale: 0.68, rot: 3.0 },
    { x: 13.2, z: -1.5, scale: 0.71, rot: 3.8 },
    { x: 1.5, z: -12, scale: 0.69, rot: 0.6 },
    { x: -1.2, z: 12.5, scale: 0.67, rot: 1.3 },
    { x: -3.5, z: -3.2, scale: 0.55, rot: 0.4 },
    { x: 3.8, z: 3.5, scale: 0.57, rot: 1.9 },
    { x: -3.2, z: 3.6, scale: 0.54, rot: 2.3 },
    { x: 3.4, z: -3.4, scale: 0.56, rot: 3.4 },
  ];

  await scatterProps(scene, QUATERNius_PROPS.grass, 'grass', grassSpecs, 0.01);

  /** https://poly.pizza/m/NBUxHir6FJ — 花叢點綴 */
  const flowerSpecs: ScatterSpec[] = [
    { x: -6.8, z: -1.5, scale: 0.52, rot: 0.2, meshName: 'Flower_1_Clump' },
    { x: 6.5, z: 1.8, scale: 0.48, rot: 1.1, meshName: 'Flower_2_Clump' },
    { x: -1.2, z: -7.2, scale: 0.5, rot: 2.0, meshName: 'Flower_3_Clump' },
    { x: 1.5, z: 7.0, scale: 0.46, rot: 2.7, meshName: 'Flower_4_Clump' },
    { x: -8.5, z: 4.2, scale: 0.44, rot: 0.8, meshName: 'Flower_5_Clump' },
    { x: 8.2, z: -4.5, scale: 0.47, rot: 1.6, meshName: 'Flower_1' },
    { x: -4.8, z: 6.8, scale: 0.45, rot: 3.1, meshName: 'Flower_2' },
    { x: 12.2, z: 2.2, scale: 0.55, rot: 0.5, meshName: 'Flower_3_Clump' },
    { x: -12.5, z: -2.8, scale: 0.53, rot: 1.4, meshName: 'Flower_4_Clump' },
    { x: 4.2, z: -10.5, scale: 0.5, rot: 2.2, meshName: 'Flower_1_Clump' },
    { x: -4.5, z: -10.8, scale: 0.48, rot: 2.9, meshName: 'Flower_2_Clump' },
  ];

  await scatterProps(scene, QUATERNius_PROPS.flowers, 'flower', flowerSpecs, 0.02);
}

export function isQuaterniusEnvironmentMesh(mesh: AbstractMesh): boolean {
  if (mesh.name.startsWith('rps-')) {
    return true;
  }

  let node = mesh.parent;

  while (node) {
    if (node.name.startsWith('rps-quat-')) {
      return true;
    }

    node = node.parent;
  }

  return false;
}
