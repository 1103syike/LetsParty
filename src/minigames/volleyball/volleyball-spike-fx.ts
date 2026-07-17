import {
  Color3,
  Color4,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  Scene,
  StandardMaterial,
  Texture,
  Vector3,
} from '@babylonjs/core';

/** 殺球落地：地面爆炸粒子 + 短暫閃光盤 */
export class VolleyballSpikeFx {
  private readonly scene: Scene;

  private readonly particles: ParticleSystem[] = [];

  private flashMesh: Mesh | null = null;

  private flashMat: StandardMaterial | null = null;

  private flashUntilMs = 0;

  private dotTexture: Texture | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  playBurst(x: number, z: number): void {
    this.spawnBurst(x, z, 72);
    this.spawnRing(x, z);
    this.showFlash(x, z);
  }

  update(): void {
    if (!this.flashMesh || !this.flashMat) {
      return;
    }

    if (performance.now() >= this.flashUntilMs) {
      this.flashMesh.setEnabled(false);
      return;
    }

    const remain = this.flashUntilMs - performance.now();
    const t = remain / 280;
    this.flashMat.alpha = 0.55 * t;
    this.flashMesh.scaling.setAll(1.2 + (1 - t) * 2.4);
  }

  dispose(): void {
    for (const system of this.particles) {
      system.dispose();
    }

    this.particles.length = 0;
    this.flashMesh?.dispose();
    this.flashMesh = null;
    this.flashMat = null;
    this.dotTexture?.dispose();
    this.dotTexture = null;
  }

  private showFlash(x: number, z: number): void {
    if (!this.flashMesh || !this.flashMat) {
      this.flashMesh = MeshBuilder.CreateDisc(
        'vb-spike-flash',
        { radius: 0.9, tessellation: 28 },
        this.scene,
      );
      this.flashMesh.rotation.x = Math.PI / 2;
      this.flashMat = new StandardMaterial('vb-spike-flash-mat', this.scene);
      // 對齊 --color-warning／accent 感覺的爆炸色
      this.flashMat.diffuseColor = Color3.FromHexString('#fbbf24');
      this.flashMat.emissiveColor = Color3.FromHexString('#fbbf24');
      this.flashMat.specularColor = Color3.Black();
      this.flashMat.disableLighting = true;
      this.flashMat.backFaceCulling = false;
      this.flashMesh.material = this.flashMat;
      this.flashMesh.isPickable = false;
    }

    this.flashMesh.position.set(x, 0.04, z);
    this.flashMesh.scaling.setAll(1.2);
    this.flashMat.alpha = 0.55;
    this.flashMesh.setEnabled(true);
    this.flashUntilMs = performance.now() + 280;
  }

  private spawnBurst(x: number, z: number, count: number): void {
    const texture = this.getDotTexture();
    const system = new ParticleSystem(`vb-spike-burst-${this.particles.length}`, count, this.scene);
    const hot = new Color4(1, 0.85, 0.35, 1);
    const ember = new Color4(0.91, 0.27, 0.38, 1);

    system.particleTexture = texture;
    system.emitter = new Vector3(x, 0.2, z);
    system.minEmitBox = new Vector3(-0.12, 0, -0.12);
    system.maxEmitBox = new Vector3(0.12, 0.25, 0.12);
    system.color1 = hot;
    system.color2 = ember;
    system.colorDead = new Color4(ember.r, ember.g, ember.b, 0);
    system.minSize = 0.12;
    system.maxSize = 0.48;
    system.minLifeTime = 0.18;
    system.maxLifeTime = 0.55;
    system.emitRate = 0;
    system.manualEmitCount = count;
    system.blendMode = ParticleSystem.BLENDMODE_ADD;
    system.gravity = new Vector3(0, -8, 0);
    system.direction1 = new Vector3(-4.5, 1.2, -4.5);
    system.direction2 = new Vector3(4.5, 6.5, 4.5);
    system.minEmitPower = 3.2;
    system.maxEmitPower = 8.5;
    system.updateSpeed = 0.016;
    system.disposeOnStop = true;
    system.targetStopDuration = 0.55;
    system.onDisposeObservable.add(() => {
      const index = this.particles.indexOf(system);

      if (index >= 0) {
        this.particles.splice(index, 1);
      }
    });
    system.start();
    this.particles.push(system);
  }

  private spawnRing(x: number, z: number): void {
    const texture = this.getDotTexture();
    const system = new ParticleSystem(`vb-spike-ring-${this.particles.length}`, 40, this.scene);
    const dust = new Color4(1, 0.95, 0.8, 1);

    system.particleTexture = texture;
    system.emitter = new Vector3(x, 0.08, z);
    system.minEmitBox = new Vector3(-0.05, 0, -0.05);
    system.maxEmitBox = new Vector3(0.05, 0.05, 0.05);
    system.color1 = dust;
    system.color2 = new Color4(0.91, 0.27, 0.38, 0.9);
    system.colorDead = new Color4(dust.r, dust.g, dust.b, 0);
    system.minSize = 0.1;
    system.maxSize = 0.32;
    system.minLifeTime = 0.2;
    system.maxLifeTime = 0.45;
    system.emitRate = 0;
    system.manualEmitCount = 40;
    system.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    system.gravity = new Vector3(0, -1.5, 0);
    system.direction1 = new Vector3(-5.5, 0.15, -5.5);
    system.direction2 = new Vector3(5.5, 0.8, 5.5);
    system.minEmitPower = 2.8;
    system.maxEmitPower = 6.2;
    system.updateSpeed = 0.016;
    system.disposeOnStop = true;
    system.targetStopDuration = 0.5;
    system.onDisposeObservable.add(() => {
      const index = this.particles.indexOf(system);

      if (index >= 0) {
        this.particles.splice(index, 1);
      }
    });
    system.start();
    this.particles.push(system);
  }

  private getDotTexture(): Texture {
    if (this.dotTexture) {
      return this.dotTexture;
    }

    const size = 64;
    const dynamic = new DynamicTexture(
      'vb-spike-dot',
      { width: size, height: size },
      this.scene,
      false,
    );
    const ctx = dynamic.getContext();
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    dynamic.update();
    this.dotTexture = dynamic;

    return dynamic;
  }
}
