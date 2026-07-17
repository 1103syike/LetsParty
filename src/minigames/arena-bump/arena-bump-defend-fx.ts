import {
  Color3,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  Vector3,
} from '@babylonjs/core';

const PLAYER_COLOR_HEX: Record<string, string> = {
  'player-1': '#e86b8a',
  'player-2': '#9b7fd4',
  'player-3': '#6ba8e8',
  'player-4': '#7ecf9a',
};

interface DefendShield {
  root: Mesh;
  rim: Mesh;
  material: PBRMaterial;
  rimMaterial: PBRMaterial;
  popMs: number;
}

/** 長按格擋時，角色前方浮一枚圓盾 */
export class ArenaBumpDefendFx {
  private readonly scene: Scene;

  private readonly shields = new Map<string, DefendShield>();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  sync(
    fighterId: string,
    isDefending: boolean,
    playerColor: string,
    x: number,
    y: number,
    z: number,
    facingX: number,
    facingZ: number,
    deltaMs: number,
  ): void {
    if (!isDefending) {
      this.hide(fighterId);
      return;
    }

    let shield = this.shields.get(fighterId);

    if (!shield) {
      shield = this.createShield(fighterId, playerColor);
      this.shields.set(fighterId, shield);
    }

    const faceMag = Math.hypot(facingX, facingZ) || 1;
    const fx = facingX / faceMag;
    const fz = facingZ / faceMag;
    // 盾在胸口前方
    const holdX = x + fx * 0.72;
    const holdY = y + 0.72;
    const holdZ = z + fz * 0.72;

    shield.root.position.set(holdX, holdY, holdZ);
    shield.root.lookAt(new Vector3(holdX + fx, holdY, holdZ + fz));

    shield.popMs = Math.min(160, shield.popMs + deltaMs);
    const pop = Math.min(1, shield.popMs / 140);
    const eased = 1 - (1 - pop) ** 3;
    const scale = 0.55 + eased * 0.5;
    shield.root.scaling.setAll(scale);
    shield.root.setEnabled(true);
  }

  hide(fighterId: string): void {
    const shield = this.shields.get(fighterId);

    if (!shield) {
      return;
    }

    shield.root.setEnabled(false);
    shield.popMs = 0;
  }

  hideAll(): void {
    for (const fighterId of this.shields.keys()) {
      this.hide(fighterId);
    }
  }

  dispose(): void {
    for (const shield of this.shields.values()) {
      shield.root.dispose();
      shield.rim.dispose();
      shield.material.dispose();
      shield.rimMaterial.dispose();
    }

    this.shields.clear();
  }

  private createShield(fighterId: string, playerColor: string): DefendShield {
    const hex = PLAYER_COLOR_HEX[playerColor] ?? '#9b7fd4';
    const color = Color3.FromHexString(hex);

    const material = new PBRMaterial(`arena-defend-mat-${fighterId}`, this.scene);
    material.albedoColor = color;
    material.emissiveColor = color.scale(0.35);
    material.metallic = 0.15;
    material.roughness = 0.35;
    material.alpha = 0.88;
    material.backFaceCulling = false;

    const rimMaterial = new PBRMaterial(`arena-defend-rim-${fighterId}`, this.scene);
    rimMaterial.albedoColor = Color3.FromHexString('#f5f0e8');
    rimMaterial.emissiveColor = Color3.FromHexString('#f5e6a8').scale(0.45);
    rimMaterial.metallic = 0.55;
    rimMaterial.roughness = 0.28;
    rimMaterial.alpha = 0.95;
    rimMaterial.backFaceCulling = false;

    const root = MeshBuilder.CreateDisc(
      `arena-defend-shield-${fighterId}`,
      {
        radius: 0.55,
        tessellation: 28,
        sideOrientation: Mesh.DOUBLESIDE,
      },
      this.scene,
    );
    root.material = material;
    root.billboardMode = Mesh.BILLBOARDMODE_NONE;
    root.setEnabled(false);

    const rim = MeshBuilder.CreateTorus(
      `arena-defend-rim-${fighterId}`,
      {
        diameter: 1.12,
        thickness: 0.08,
        tessellation: 28,
      },
      this.scene,
    );
    rim.parent = root;
    rim.material = rimMaterial;
    rim.rotation.x = Math.PI / 2;
    rim.position.setAll(0);

    return {
      root,
      rim,
      material,
      rimMaterial,
      popMs: 0,
    };
  }
}
