import {
  ArcRotateCamera,
  Engine,
  HemisphericLight,
  Scene,
  Vector3,
} from '@babylonjs/core';
import { onBeforeUnmount, onMounted, shallowRef } from 'vue';

interface UseBabylonSceneParams {
  autoRender?: boolean;
  createScene?: (engine: Engine) => Scene;
  createCamera?: (scene: Scene) => ArcRotateCamera;
  init?: (params: {
    canvas: HTMLCanvasElement;
    engine: Engine;
    scene: Scene;
    camera: ArcRotateCamera;
  }) => Promise<void>;
}

export function useBabylonScene(params?: UseBabylonSceneParams) {
  const canvasRef = shallowRef<HTMLCanvasElement | null>(null);
  const engineRef = shallowRef<Engine | null>(null);
  const sceneRef = shallowRef<Scene | null>(null);
  const cameraRef = shallowRef<ArcRotateCamera | null>(null);

  let disposed = false;

  function createDefaultScene(engine: Engine): Scene {
    const scene = new Scene(engine);
    scene.clearColor.set(0, 0, 0, 0);

    const light = new HemisphericLight('hemi', new Vector3(0.2, 1, 0.15), scene);
    light.intensity = 1.05;
    light.groundColor.set(0.85, 0.82, 0.92);

    return scene;
  }

  function createDefaultCamera(scene: Scene): ArcRotateCamera {
    const camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 2,
      Math.PI / 2.45,
      11,
      new Vector3(0, 0.75, 0),
      scene,
    );

    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 16;
    camera.attachControl = () => undefined;

    return camera;
  }

  function handleResize(): void {
    engineRef.value?.resize();
  }

  onMounted(async () => {
    if (!canvasRef.value) {
      return;
    }

    const engine = new Engine(canvasRef.value, true, {
      alpha: true,
      preserveDrawingBuffer: true,
      stencil: true,
    });

    if (disposed) {
      engine.dispose();
      return;
    }

    engineRef.value = engine;

    const scene = params?.createScene?.(engine) ?? createDefaultScene(engine);
    sceneRef.value = scene;

    const camera = params?.createCamera?.(scene) ?? createDefaultCamera(scene);
    cameraRef.value = camera;

    if (params?.autoRender !== false) {
      engine.runRenderLoop(() => {
        scene.render();
      });
    }

    window.addEventListener('resize', handleResize);

    if (params?.init) {
      await params.init({
        canvas: canvasRef.value,
        engine,
        scene,
        camera,
      });
    }
  });

  onBeforeUnmount(() => {
    disposed = true;
    window.removeEventListener('resize', handleResize);
    engineRef.value?.dispose();
    engineRef.value = null;
    sceneRef.value = null;
    cameraRef.value = null;
  });

  return {
    canvasRef,
    engineRef,
    sceneRef,
    cameraRef,
  };
}
