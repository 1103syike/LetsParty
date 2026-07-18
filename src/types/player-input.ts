export type RpsChoice = 'rock' | 'paper' | 'scissors';

export type PlayerInput =
  | { type: 'mash' }
  | { type: 'rps'; choice: RpsChoice }
  /** 唬爛宣稱（可改）；與真實出拳分開 */
  | { type: 'rps-claim'; choice: RpsChoice }
  | { type: 'button'; button: string }
  | { type: 'joystick'; x: number; y: number }
  /** 擂台互推：移動 + 跳躍／衝撞／格擋（可帶滑鼠撞擊目標） */
  | {
      type: 'arena';
      x: number;
      y: number;
      jump: boolean;
      charge: boolean;
      defend: boolean;
      /** 滑鼠點選的世界座標目標；沒帶則用當下轉向衝撞 */
      aimX?: number | null;
      aimZ?: number | null;
    }
  /** 2v2 排球：移動 + 跳躍／擊球／舉球／殺球（可帶滑鼠落點） */
  | {
      type: 'volleyball';
      x: number;
      y: number;
      jump: boolean;
      bump: boolean;
      set: boolean;
      spike: boolean;
      /** 滑鼠點選的世界座標落點；沒帶則用自動落點 */
      aimX?: number | null;
      aimZ?: number | null;
    };
