import {
  Color3,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
} from '@babylonjs/core';
import type { ArcRotateCamera } from '@babylonjs/core';

import { getRpsPanelCameraLayer } from '@/minigames/rock-paper-scissors/rps-render-layers';
import type { PlayerColor } from '@/types/party';

/** 馬卡龙 pastel：各格舞台底色 */
const PANEL_BG_BY_COLOR: Record<PlayerColor, { base: Color3; glow: Color3; highlight: Color3 }> = {
  'player-1': {
    base: Color3.FromHexString('#f08aa5'),
    glow: Color3.FromHexString('#ffd4e0'),
    highlight: Color3.FromHexString('#fff0f4'),
  },
  'player-2': {
    base: Color3.FromHexString('#a888dc'),
    glow: Color3.FromHexString('#ddd0ff'),
    highlight: Color3.FromHexString('#f5f0ff'),
  },
  'player-3': {
    base: Color3.FromHexString('#72b0ee'),
    glow: Color3.FromHexString('#c8e6ff'),
    highlight: Color3.FromHexString('#eef7ff'),
  },
  'player-4': {
    base: Color3.FromHexString('#72c892'),
    glow: Color3.FromHexString('#c4f0d4'),
    highlight: Color3.FromHexString('#eefaf2'),
  },
};

function applyPanelBgMaterial(
  material: PBRMaterial,
  palette: { base: Color3; glow: Color3 },
): void {
  material.albedoColor = palette.base;
  material.emissiveColor = palette.glow.scale(0.22);
  material.metallic = 0;
  material.roughness = 0.96;
  material.backFaceCulling = false;
}

function applyPanelGlowMaterial(
  material: PBRMaterial,
  palette: { highlight: Color3; glow: Color3 },
): void {
  material.albedoColor = palette.highlight.scale(0.92);
  material.emissiveColor = palette.glow.scale(0.28);
  material.metallic = 0;
  material.roughness = 1;
  material.backFaceCulling = false;
}

export class RpsPanelBackdrops {
  private readonly planes: Mesh[] = [];

  private readonly glows: Mesh[] = [];

  private readonly materials: PBRMaterial[] = [];

  private readonly glowMaterials: PBRMaterial[] = [];

  private splitVisible = false;

  constructor(scene: Scene) {
    for (let slotIndex = 0; slotIndex < 4; slotIndex += 1) {
      const material = new PBRMaterial(`rps-panel-bg-mat-${slotIndex}`, scene);
      const glowMaterial = new PBRMaterial(`rps-panel-bg-glow-mat-${slotIndex}`, scene);
      const plane = MeshBuilder.CreatePlane(
        `rps-panel-bg-${slotIndex}`,
        {
          width: 14,
          height: 10.5,
        },
        scene,
      );
      const glow = MeshBuilder.CreateDisc(
        `rps-panel-bg-glow-${slotIndex}`,
        {
          radius: 3.2,
          tessellation: 36,
        },
        scene,
      );

      applyPanelBgMaterial(material, PANEL_BG_BY_COLOR['player-1']);
      applyPanelGlowMaterial(glowMaterial, PANEL_BG_BY_COLOR['player-1']);
      plane.material = material;
      glow.material = glowMaterial;
      plane.layerMask = getRpsPanelCameraLayer(slotIndex);
      glow.layerMask = getRpsPanelCameraLayer(slotIndex);
      plane.renderingGroupId = 0;
      glow.renderingGroupId = 0;
      plane.setEnabled(false);
      glow.setEnabled(false);

      this.planes[slotIndex] = plane;
      this.glows[slotIndex] = glow;
      this.materials[slotIndex] = material;
      this.glowMaterials[slotIndex] = glowMaterial;
    }
  }

  setSplitVisible(enabled: boolean): void {
    if (this.splitVisible === enabled) {
      return;
    }

    this.splitVisible = enabled;

    for (const plane of this.planes) {
      plane?.setEnabled(enabled);
    }

    for (const glow of this.glows) {
      glow?.setEnabled(enabled);
    }
  }

  syncParticipantColors(colors: PlayerColor[]): void {
    for (let slotIndex = 0; slotIndex < this.materials.length; slotIndex += 1) {
      const colorKey = colors[slotIndex] ?? 'player-1';
      const palette = PANEL_BG_BY_COLOR[colorKey];
      const material = this.materials[slotIndex];
      const glowMaterial = this.glowMaterials[slotIndex];

      if (!material || !glowMaterial) {
        continue;
      }

      applyPanelBgMaterial(material, palette);
      applyPanelGlowMaterial(glowMaterial, palette);
    }
  }

  /** 每格 backdrop 貼在鏡頭 target 後方，保證填滿畫面 */
  syncToCameras(cameras: Array<ArcRotateCamera | null>): void {
    if (!this.splitVisible) {
      return;
    }

    for (let slotIndex = 0; slotIndex < cameras.length; slotIndex += 1) {
      const camera = cameras[slotIndex];
      const plane = this.planes[slotIndex];
      const glow = this.glows[slotIndex];

      if (!camera || !plane || !glow) {
        continue;
      }

      const target = camera.getTarget();
      const camPos = camera.position;
      const viewDir = target.subtract(camPos).normalize();
      /** 放在角色後方（遠離鏡頭），不能夹在鏡頭與角色之間 */
      const behindDistance = 1.35;
      const backdropCenter = target.add(viewDir.scale(behindDistance));

      plane.position.copyFrom(backdropCenter);
      plane.lookAt(camPos);

      glow.position.copyFrom(backdropCenter.add(viewDir.scale(-0.25)));
      glow.lookAt(camPos);
    }
  }

  dispose(): void {
    for (const plane of this.planes) {
      plane?.dispose();
    }

    for (const glow of this.glows) {
      glow?.dispose();
    }

    for (const material of this.materials) {
      material?.dispose();
    }

    for (const material of this.glowMaterials) {
      material?.dispose();
    }

    this.planes.length = 0;
    this.glows.length = 0;
    this.materials.length = 0;
    this.glowMaterials.length = 0;
  }
}

export function getDefaultPanelBgColor(color: PlayerColor): Color3 {
  return PANEL_BG_BY_COLOR[color]?.base ?? PANEL_BG_BY_COLOR['player-1'].base;
}
