import { rpsCopy } from '@/minigames/rock-paper-scissors/locales/zh-TW';
import {
  RockPaperScissorsGame,
  type RockPaperScissorsSnapshot,
} from '@/minigames/rock-paper-scissors/rock-paper-scissors';
import type { MiniGameInstance } from '@/minigames/types';
import type { Participant } from '@/types/party';
import type { PlayerInput, RpsChoice } from '@/types/player-input';

export const ROCK_PAPER_SCISSORS_ID = 'rock-paper-scissors';

class RockPaperScissorsMiniGame implements MiniGameInstance {
  private readonly game: RockPaperScissorsGame;

  private readonly localPlayerId: string | null;

  constructor(participants: Participant[], localPlayerId: string | null) {
    this.game = new RockPaperScissorsGame(participants.map((participant) => participant.id));
    this.localPlayerId = localPlayerId;
  }

  start(): void {
    this.game.start();
  }

  onPlayerInput(playerId: string, input: PlayerInput): void {
    this.game.onPlayerInput(playerId, input);
  }

  getCpuInput(cpuId: string, deltaMs: number): PlayerInput {
    return this.game.getCpuInput(cpuId, deltaMs);
  }

  onTick(deltaMs: number): void {
    this.game.onTick(deltaMs);
  }

  getRankings(): string[] {
    return this.game.getRankings();
  }

  getCrownAwards(_rankings?: string[]): Record<string, number> {
    return this.game.getCrownAwards();
  }

  getRoundResults(): Record<string, 'win' | 'lose' | 'tie'> {
    return this.game.getRoundResults();
  }

  getGameSnapshot(): RockPaperScissorsSnapshot {
    return this.game.getSnapshot(this.localPlayerId);
  }

  isFinished(): boolean {
    return this.game.isFinished();
  }

  dispose(): void {
    this.game.dispose();
  }
}

export const rockPaperScissorsDefinition = {
  id: ROCK_PAPER_SCISSORS_ID,
  name: rpsCopy.name,
  rules: rpsCopy.rules,
  inputMode: 'buttons' as const,
  create(participants: Participant[], localPlayerId: string | null = null) {
    return new RockPaperScissorsMiniGame(participants, localPlayerId);
  },
};

export type { RockPaperScissorsSnapshot, RpsChoice };
