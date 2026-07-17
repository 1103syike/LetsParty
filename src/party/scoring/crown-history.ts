import type { Participant } from '@/types/party';

export type CrownHistory = Record<string, number[]>;

export function createInitialCrownHistory(participants: Participant[]): CrownHistory {
  const history: CrownHistory = {};

  for (const participant of participants) {
    history[participant.id] = [0];
  }

  return history;
}

export function snapshotCrownHistory(
  history: CrownHistory,
  participants: Participant[],
): CrownHistory {
  const next: CrownHistory = { ...history };

  for (const participant of participants) {
    const timeline = [...(next[participant.id] ?? [0]), participant.crownCount];
    next[participant.id] = timeline;
  }

  return next;
}

export function getCrownHistoryRoundCount(history: CrownHistory): number {
  let maxLength = 0;

  for (const timeline of Object.values(history)) {
    maxLength = Math.max(maxLength, timeline.length);
  }

  return Math.max(0, maxLength - 1);
}
