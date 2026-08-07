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

/** 取某局累積皇冠；缺資料時用最後一筆 */
export function crownsAt(timeline: number[], round: number): number {
  if (timeline.length === 0) {
    return 0;
  }

  const index = Math.max(0, Math.min(round, timeline.length - 1));
  return timeline[index] ?? 0;
}

/**
 * 測試用假資料：多段升降，方便預覽折線走勢。
 * 最終約略：P1 最高、P2/P3 並列、P4 較低。
 */
export function createTiedCrownHistoryDemo(participants: Participant[]): CrownHistory {
  const demos: number[][] = [
    [0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6],
    [0, 0, 1, 1, 2, 2, 3, 4, 4, 5, 5],
    [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
    [0, 0, 0, 1, 1, 1, 2, 2, 3, 3, 3],
  ];
  const history: CrownHistory = {};

  participants.forEach((participant, index) => {
    history[participant.id] = [...(demos[index] ?? demos[demos.length - 1]!)];
  });

  return history;
}
