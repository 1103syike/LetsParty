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

/** 炸彈落地爆炸：大爆發 + 雙重衝擊波 + 閃光 */
export class BouncyBombFx {
  private readonly scene: Scene;

  private readonly particles: ParticleSystem[] = [];

  private flashMesh: Mesh | null = null;

  private flashMat: StandardMaterial | null = null;

  private flashUntilMs = 0;

  private pillarMesh: Mesh | null = null;

  private pillarMat: StandardMaterial | null = null;

  private pillarUntilMs = 0;

  private dotTexture: Texture | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  playBurst(x: number, z: number, colorHex: string): void {
    this.spawnBurst(x, z, colorHex, 220);
    this.spawnBurst(x, z, '#fbbf24', 90);
    this.spawnRing(x, z, colorHex, 1.4, 2.8);
    this.spawnRing(x, z, '#ffffff', 0.9, 4.2);
    this.showFlash(x, z, colorHex);
    this.showPillar(x, z, colorHex);
  }

  update(): void {
    const now = performance.now();

    if (this.flashMesh && this.flashMat) {
      if (now >= this.flashUntilMs) {
        this.flashMesh.setEnabled(false);
      } else {
        const remain = this.flashUntilMs - now;
        const t = remain / 520;
        this.flashMat.alpha = 0.85 * t;
        this.flashMesh.scaling.setAll(1.6 + (1 - t) * 4.2);
      }
    }

    if (this.pillarMesh && this.pillarMat) {
      if (now >= this.pillarUntilMs) {
        this.pillarMesh.setEnabled(false);
      } else {
        const remain = this.pillarUntilMs - now;
        const t = remain / 420;
        this.pillarMat.alpha = 0.7 * t;
        this.pillarMesh.scaling.y = 1 + (1 - t) * 2.4;
        this.pillarMesh.position.y = 0.2 + (1 - t) * 1.6;
      }
    }
  }

  dispose(): void {
    for (const system of this.particles) {
      system.dispose();
    }

    this.particles.length = 0;
    this.flashMesh?.dispose();
    this.flashMesh = null;
    this.flashMat = null;
    this.pillarMesh?.dispose();
    this.pillarMesh = null;
    this.pillarMat = null;
    this.dotTexture?.dispose();
    this.dotTexture = null;
  }

  private showFlash(x: number, z: number, colorHex: string): void {
    if (!this.flashMesh || !this.flashMat) {
      this.flashMesh = MeshBuilder.CreateDisc(
        'bb-blast-flash',
        { radius: 1.4, tessellation: 36 },
        this.scene,
      );
      this.flashMesh.rotation.x = Math.PI / 2;
      this.flashMat = new StandardMaterial('bb-blast-flash-mat', this.scene);
      this.flashMat.specularColor = Color3.Black();
      this.flashMat.disableLighting = true;
      this.flashMat.backFaceCulling = false;
      this.flashMesh.material = this.flashMat;
      this.flashMesh.isPickable = false;
    }

    const color = Color3.FromHexString(colorHex);
    this.flashMat.diffuseColor = color;
    this.flashMat.emissiveColor = color.scale(1.4);
    this.flashMesh.position.set(x, 0.05, z);
    this.flashMesh.scaling.setAll(1.8);
    this.flashMat.alpha = 0.9;
    this.flashMesh.setEnabled(true);
    this.flashUntilMs = performance.now() + 520;
  }

  private showPillar(x: number, z: number, colorHex: string): void {
    if (!this.pillarMesh || !this.pillarMat) {
      this.pillarMesh = MeshBuilder.CreateCylinder(
        'bb-blast-pillar',
        { height: 2.4, diameter: 1.1, tessellation: 16 },
        this.scene,
      );
      this.pillarMat = new StandardMaterial('bb-blast-pillar-mat', this.scene);
      this.pillarMat.specularColor = Color3.Black();
      this.pillarMat.disableLighting = true;
      this.pillarMat.backFaceCulling = false;
      this.pillarMesh.material = this.pillarMat;
      this.pillarMesh.isPickable = false;
    }

    const color = Color3.FromHexString(colorHex);
    this.pillarMat.diffuseColor = color;
    this.pillarMat.emissiveColor = Color3.FromHexString('#fbbf24').scale(1.2);
    this.pillarMesh.position.set(x, 1.1, z);
    this.pillarMesh.scaling.set(1, 1, 1);
    this.pillarMat.alpha = 0.75;
    this.pillarMesh.setEnabled(true);
    this.pillarUntilMs = performance.now() + 420;
  }

  private spawnBurst(x: number, z: number, colorHex: string, count: number): void {
    const texture = this.getDotTexture();
    const system = new ParticleSystem(`bb-blast-${this.particles.length}`, count, this.scene);
    const accent = hexToColor4(colorHex, 1);
    const hot = new Color4(1, 0.92, 0.35, 1);

    system.particleTexture = texture;
    system.emitter = new Vector3(x, 0.35, z);
    system.minEmitBox = new Vector3(-0.2, 0, -0.2);
    system.maxEmitBox = new Vector3(0.2, 0.55, 0.2);
    system.color1 = hot;
    system.color2 = accent;
    system.colorDead = new Color4(1, 1, 1, 0);
    system.minSize = 0.16;
    system.maxSize = 0.62;
    system.minLifeTime = 0.22;
    system.maxLifeTime = 0.7;
    system.emitRate = 0;
    system.manualEmitCount = count;
    system.blendMode = ParticleSystem.BLENDMODE_ADD;
    system.gravity = new Vector3(0, -16, 0);
    system.direction1 = new Vector3(-6, 3, -6);
    system.direction2 = new Vector3(6, 14, 6);
    system.minEmitPower = 3.5;
    system.maxEmitPower = 11;
    system.updateSpeed = 0.016;
    system.disposeOnStop = true;
    system.targetStopDuration = 0.7;
    system.onDisposeObservable.add(() => {
      const index = this.particles.indexOf(system);

      if (index >= 0) {
        this.particles.splice(index, 1);
      }
    });
    system.start();
    this.particles.push(system);
  }

  private spawnRing(
    x: number,
    z: number,
    colorHex: string,
    startScale: number,
    expand: number,
  ): void {
    const ring = MeshBuilder.CreateTorus(
      `bb-blast-ring-${this.particles.length}`,
      { diameter: 1.6, thickness: 0.12, tessellation: 40 },
      this.scene,
    );
    ring.position.set(x, 0.08, z);
    ring.rotation.x = Math.PI / 2;
    ring.scaling.setAll(startScale);
    const mat = new StandardMaterial(`bb-blast-ring-mat-${this.particles.length}`, this.scene);
    const color = Color3.FromHexString(colorHex);
    mat.diffuseColor = color;
    mat.emissiveColor = color.scale(1.35);
    mat.alpha = 0.95;
    mat.disableLighting = true;
    ring.material = mat;
    ring.isPickable = false;

    const started = performance.now();
    const observer = this.scene.onBeforeRenderObservable.add(() => {
      const t = (performance.now() - started) / 480;

      if (t >= 1) {
        this.scene.onBeforeRenderObservable.remove(observer);
        ring.dispose();
        mat.dispose();
        return;
      }

      ring.scaling.setAll(startScale + t * expand);
      mat.alpha = 0.95 * (1 - t);
    });
  }

  private getDotTexture(): Texture {
    if (this.dotTexture) {
      return this.dotTexture;
    }

    const size = 64;
    const dynamic = new DynamicTexture(
      'bb-blast-dot',
      { width: size, height: size },
      this.scene,
      false,
    );
    const ctx = dynamic.getContext();
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.85)');
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

function hexToColor4(hex: string, alpha = 1): Color4 {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(normalized, 16);

  return new Color4(
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
    alpha,
  );
}
