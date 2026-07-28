import type { Participant } from '@/types/party';
import type { PlayerInput } from '@/types/player-input';

export type MiniGameInputMode = 'buttons' | 'joystick' | 'mash' | 'mixed';

export interface MiniGameInstance {
  start(): void;
  onPlayerInput(playerId: string, input: PlayerInput): void;
  getCpuInput?(cpuId: string, deltaMs: number): PlayerInput;
  onTick(deltaMs: number): void;
  getRankings(): string[];
  getCrownAwards?(rankings: string[]): Record<string, number>;
  getRoundResults?(): Record<string, string>;
  getGameSnapshot?(): unknown;
  dispose(): void;
  isFinished(): boolean;
  getScores?(): Record<string, number>;
}

export interface MiniGameCreateOptions {
  /** 測試模式：跳過開場倒數，直接開戰 */
  skipOpeningCountdown?: boolean;
}

export interface MiniGameDefinition {
  id: string;
  name: string;
  rules: string;
  inputMode: MiniGameInputMode;
  create(
    participants: Participant[],
    localPlayerId?: string | null,
    options?: MiniGameCreateOptions,
  ): MiniGameInstance;
}
