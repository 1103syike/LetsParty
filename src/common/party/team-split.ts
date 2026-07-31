/** 2v2 分隊：洗牌後前兩人紅隊、後兩人藍隊 */

export type PartyTeamId = 'a' | 'b';

export function shuffleIds(ids: string[]): string[] {
  const next = [...ids];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const temp = next[index];
    next[index] = next[swap];
    next[swap] = temp;
  }

  return next;
}

export function splitIntoTwoTeams(ids: string[]): {
  teamAIds: string[];
  teamBIds: string[];
} {
  const shuffled = shuffleIds(ids);

  return {
    teamAIds: shuffled.slice(0, 2),
    teamBIds: shuffled.slice(2, 4),
  };
}

/** 勝隊兩人各 +1 皇冠；其餘 0 */
export function awardsForWinningTeam(
  allPlayerIds: string[],
  winnerTeamIds: string[] | null,
): Record<string, number> {
  const awards: Record<string, number> = {};

  for (const id of allPlayerIds) {
    awards[id] = 0;
  }

  if (!winnerTeamIds) {
    return awards;
  }

  for (const id of winnerTeamIds) {
    awards[id] = 1;
  }

  return awards;
}
