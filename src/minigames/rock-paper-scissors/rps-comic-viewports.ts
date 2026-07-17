import { Viewport } from '@babylonjs/core';

/** 與 rock-paper-scissors-play.vue `.comic-grid` 一致 */
export const COMIC_GRID_PADDING_PX = 8;
export const COMIC_GRID_GAP_PX = 8;

/**
 * 依 canvas 尺寸算出四格 viewport（Babylon 原點左下）
 * 順序：左上、右上、左下、右下
 */
export function computeComicPanelViewports(
  canvasWidth: number,
  canvasHeight: number,
): Viewport[] {
  const padding = COMIC_GRID_PADDING_PX;
  const gap = COMIC_GRID_GAP_PX;
  const panelWidth = (canvasWidth - padding * 2 - gap) / 2;
  const panelHeight = (canvasHeight - padding * 2 - gap) / 2;

  if (panelWidth <= 0 || panelHeight <= 0) {
    return [
      new Viewport(0, 0.5, 0.5, 0.5),
      new Viewport(0.5, 0.5, 0.5, 0.5),
      new Viewport(0, 0, 0.5, 0.5),
      new Viewport(0.5, 0, 0.5, 0.5),
    ];
  }

  const left = padding / canvasWidth;
  const right = (padding + panelWidth + gap) / canvasWidth;
  const bottom = padding / canvasHeight;
  const top = 1 - (padding + panelHeight) / canvasHeight;
  const width = panelWidth / canvasWidth;
  const height = panelHeight / canvasHeight;

  return [
    new Viewport(left, top, width, height),
    new Viewport(right, top, width, height),
    new Viewport(left, bottom, width, height),
    new Viewport(right, bottom, width, height),
  ];
}
