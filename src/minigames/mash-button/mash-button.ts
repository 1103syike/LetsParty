import type { MiniGameInstance } from '@/minigames/types';
import type { Participant } from '@/types/party';
import type { PlayerInput } from '@/types/player-input';

const PLAY_DURATION_MS = 8000;

export class MashButtonGame implements MiniGameInstance {
  private readonly participantIds: string[];

  private readonly scores = new Map<string, number>();

  private elapsedMs = 0;

  private finished = false;

  constructor(participants: Participant[]) {
    this.participantIds = participants.map((participant) => participant.id);

    for (const participantId of this.participantIds) {
      this.scores.set(participantId, 0);
    }
  }

  start(): void {
    this.elapsedMs = 0;
    this.finished = false;
  }

  onPlayerInput(playerId: string, input: PlayerInput): void {
    if (this.finished || input.type !== 'mash') {
      return;
    }

    const currentScore = this.scores.get(playerId) ?? 0;
    this.scores.set(playerId, currentScore + 1);
  }

  getCpuInput(_cpuId: string, deltaMs: number): PlayerInput {
    const mashChance = Math.min(0.35, 0.12 + deltaMs / 1000);

    if (Math.random() < mashChance) {
      return { type: 'mash' };
    }

    return { type: 'button', button: 'idle' };
  }

  onTick(deltaMs: number): void {
    if (this.finished) {
      return;
    }

    this.elapsedMs += deltaMs;

    if (this.elapsedMs >= PLAY_DURATION_MS) {
      this.finished = true;
    }
  }

  getRankings(): string[] {
    return [...this.participantIds].sort((leftId, rightId) => {
      const leftScore = this.scores.get(leftId) ?? 0;
      const rightScore = this.scores.get(rightId) ?? 0;

      return rightScore - leftScore;
    });
  }

  getScores(): Record<string, number> {
    const result: Record<string, number> = {};

    for (const participantId of this.participantIds) {
      result[participantId] = this.scores.get(participantId) ?? 0;
    }

    return result;
  }

  isFinished(): boolean {
    return this.finished;
  }

  dispose(): void {
    this.scores.clear();
    this.finished = true;
  }
}
