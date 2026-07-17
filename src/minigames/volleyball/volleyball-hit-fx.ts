import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
} from '@babylonjs/core';

type FlatRing = {
  mesh: Mesh;
  mat: StandardMaterial;
  /** 相對 hitTiming 的縮放曲線偏移 */
  scaleFrom: number;
  scaleTo: number;
  alphaFrom: number;
  alphaTo: number;
  color: Color3;
};

/**
 * 落點時機圓環：平貼地面、雙環收攏，
 * hitTiming 0→1 時由大收小、變亮（最佳擊球窗）。
 */
export class VolleyballHitFx {
  private readonly rings: FlatRing[];

  private readonly texture: DynamicTexture;

  private pulsePhase = 0;

  private hitTiming = 0;

  constructor(scene: Scene) {
    this.texture = this.createRingTexture(scene);

    // 對齊 --color-player-1 / --color-player-3：粉＋亮藍，跟落點標記同調、更鮮
    const hot = Color3.FromHexString('#e86b8a');
    const sky = Color3.FromHexString('#6ba8e8');

    this.rings = [
      this.createRing(scene, 'outer', sky, 3.6, 1.1, 0.5, 1),
      this.createRing(scene, 'inner', hot, 2.7, 0.78, 0.55, 1),
    ];
  }

  /** hitTiming：0 未到／已過，1 最佳窗 */
  sync(land: { x: number; z: number } | null, hitTiming: number): void {
    this.hitTiming = Math.max(0, Math.min(1, hitTiming));

    if (!land || this.hitTiming < 0.03) {
      for (const ring of this.rings) {
        ring.mesh.setEnabled(false);
        ring.mat.alpha = 0;
      }

      return;
    }

    for (const ring of this.rings) {
      ring.mesh.position.x = land.x;
      ring.mesh.position.z = land.z;
      ring.mesh.setEnabled(true);
    }
  }

  update(deltaMs: number): void {
    if (this.hitTiming < 0.03) {
      return;
    }

    this.pulsePhase += deltaMs * 0.018;
    const t = this.hitTiming;
    const sweetPulse = t > 0.68
      ? 1 + Math.sin(this.pulsePhase) * 0.14
      : 1 + Math.sin(this.pulsePhase * 0.7) * 0.04;

    for (const ring of this.rings) {
      if (!ring.mesh.isEnabled()) {
        continue;
      }

      const scale = (ring.scaleFrom + (ring.scaleTo - ring.scaleFrom) * t) * sweetPulse;
      ring.mesh.scaling.setAll(scale);
      ring.mat.alpha = ring.alphaFrom + (ring.alphaTo - ring.alphaFrom) * t;
      ring.mat.emissiveColor = ring.color.scale(0.85 + t * 1.1);
    }
  }

  dispose(): void {
    for (const ring of this.rings) {
      ring.mesh.dispose();
      ring.mat.dispose();
    }

    this.texture.dispose();
  }

  private createRing(
    scene: Scene,
    name: string,
    color: Color3,
    scaleFrom: number,
    scaleTo: number,
    alphaFrom: number,
    alphaTo: number,
  ): FlatRing {
    const mat = new StandardMaterial(`vb-land-timing-${name}-mat`, scene);
    mat.diffuseColor = color;
    mat.emissiveColor = color.scale(0.75);
    mat.specularColor = Color3.Black();
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.diffuseTexture = this.texture;
    mat.opacityTexture = this.texture;
    mat.useAlphaFromDiffuseTexture = true;
    mat.alpha = 0;

    const mesh = MeshBuilder.CreateDisc(
      `vb-land-timing-${name}`,
      { radius: 0.5, tessellation: 56 },
      scene,
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = name === 'inner' ? 0.048 : 0.042;
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.setEnabled(false);

    return {
      mesh,
      mat,
      scaleFrom,
      scaleTo,
      alphaFrom,
      alphaTo,
      color,
    };
  }

  private createRingTexture(scene: Scene): DynamicTexture {
    const size = 256;
    const texture = new DynamicTexture(
      'vb-land-timing-ring-tex',
      { width: size, height: size },
      scene,
      false,
    );
    const ctx = texture.getContext();
    const cx = size / 2;
    const cy = size / 2;
    // 環帶加寬，遠看才明顯
    const outer = size * 0.48;
    const inner = size * 0.28;

    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(cx, cy, outer, 0, Math.PI * 2);
    ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.fill();
    texture.hasAlpha = true;
    texture.update();

    return texture;
  }
}
