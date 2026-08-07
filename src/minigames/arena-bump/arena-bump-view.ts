/**
 * 場景每幀寫入鏡頭水平前／右軸，操作層讀取做 WASD。
 * 用真實相機方位，避免「鏡頭跟人不跟」時操作脫節。
 */
let forwardX = 0;
let forwardZ = -1;
let rightX = 1;
let rightZ = 0;

export function setArenaBumpViewBasis(
  nextForwardX: number,
  nextForwardZ: number,
  nextRightX: number,
  nextRightZ: number,
): void {
  forwardX = nextForwardX;
  forwardZ = nextForwardZ;
  rightX = nextRightX;
  rightZ = nextRightZ;
}

export function getArenaBumpViewBasis(): {
  forwardX: number;
  forwardZ: number;
  rightX: number;
  rightZ: number;
} {
  return {
    forwardX,
    forwardZ,
    rightX,
    rightZ,
  };
}
