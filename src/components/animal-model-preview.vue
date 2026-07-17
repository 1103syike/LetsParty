<script setup lang="ts">
import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  HemisphericLight,
  Scene,
  Vector3,
} from '@babylonjs/core';
import { onBeforeUnmount, watch } from 'vue';

import { AnimalActor } from '@/common/animals/animal-actor';
import {
  ANIMAL_PREVIEW_CAMERA,
  getAnimalPreviewRadius,
} from '@/common/animals/animal-view-config';
import { useBabylonScene } from '@/composables/use-babylon-scene';
import type { AnimalId } from '@/types/animal';
import type { PlayerColor } from '@/types/party';

const props = withDefaults(
  defineProps<{
    animalId: AnimalId;
    playerColor?: PlayerColor;
    isActive?: boolean;
    compact?: boolean;
    hero?: boolean;
  }>(),
  {
    playerColor: 'player-1',
    isActive: false,
    compact: false,
    hero: false,
  },
);

let previewActor: AnimalActor | null = null;
let previewCamera: ArcRotateCamera | null = null;
let activeScene: Scene | null = null;

function aimPreviewCamera(): void {
  if (!previewActor || !previewCamera) {
    return;
  }

  previewCamera.setTarget(previewActor.getAimTarget());
  previewCamera.alpha = ANIMAL_PREVIEW_CAMERA.alpha;
  previewCamera.beta = ANIMAL_PREVIEW_CAMERA.beta;
  previewCamera.radius = getAnimalPreviewRadius(props.animalId);
  previewCamera.minZ = 0.08;
  previewActor.applyPreviewPose(previewCamera);
}

function setupPreviewLighting(scene: Scene): void {
  scene.ambientColor = new Color3(0.88, 0.9, 0.94);
  scene.imageProcessingConfiguration.exposure = 1.42;
  scene.imageProcessingConfiguration.contrast = 1.06;

  const hemi = new HemisphericLight('animal-preview-hemi', new Vector3(0.15, 1, 0.25), scene);
  hemi.intensity = 1.75;
  hemi.groundColor.set(0.96, 0.97, 1);
  hemi.diffuse.set(1, 1, 1);

  const key = new DirectionalLight('animal-preview-key', new Vector3(-0.25, -1, 0.35), scene);
  key.intensity = 1.15;

  const fill = new DirectionalLight('animal-preview-fill', new Vector3(0.55, -0.65, -0.35), scene);
  fill.intensity = 0.75;
}

async function loadPreviewActor(scene: Scene): Promise<void> {
  previewActor?.dispose();
  previewActor = null;

  previewActor = await AnimalActor.create(scene, props.animalId, props.playerColor);
  aimPreviewCamera();
}

const { canvasRef } = useBabylonScene({
  createScene(engine) {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.97, 0.98, 1, 1);

    return scene;
  },
  createCamera(scene) {
    const camera = new ArcRotateCamera(
      'animal-preview-cam',
      ANIMAL_PREVIEW_CAMERA.alpha,
      ANIMAL_PREVIEW_CAMERA.beta,
      ANIMAL_PREVIEW_CAMERA.radius,
      new Vector3(0, 0.55, 0),
      scene,
    );

    camera.lowerRadiusLimit = 2;
    camera.upperRadiusLimit = 3.6;
    camera.minZ = 0.08;
    camera.attachControl = () => undefined;

    return camera;
  },
  async init({ scene, camera }) {
    activeScene = scene;
    previewCamera = camera;

    setupPreviewLighting(scene);
    await loadPreviewActor(scene);
  },
});

watch(
  () => props.animalId,
  async () => {
    if (!activeScene) {
      return;
    }

    await loadPreviewActor(activeScene);
  },
);

onBeforeUnmount(() => {
  previewActor?.dispose();
  previewActor = null;
  previewCamera = null;
  activeScene = null;
});
</script>

<template>
  <canvas
    ref="canvasRef"
    class="animal-preview__canvas"
    :class="{
      'animal-preview__canvas--active': isActive,
      'animal-preview__canvas--compact': compact,
      'animal-preview__canvas--hero': hero,
    }"
  />
</template>

<style lang="scss" scoped>
.animal-preview__canvas {
  display: block;
  width: 100%;
  height: 5.5rem;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.88);
  touch-action: none;

  &--active {
    box-shadow: inset 0 0 0 2px var(--color-accent);
  }

  &--compact {
    height: 3.25rem;
    border-radius: var(--radius-md);
  }

  &--hero {
    height: 8rem;
    border-radius: var(--radius-md);
    box-shadow:
      0 var(--space-sm) var(--space-lg) rgba(92, 77, 130, 0.16),
      inset 0 0 0 2px rgba(255, 255, 255, 0.65);
  }
}
</style>
