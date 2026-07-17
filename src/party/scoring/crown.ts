import type { Participant } from '@/types/party';

export function awardCrownToFirstPlace(
  participants: Participant[],
  rankings: string[],
): Participant[] {
  if (rankings.length === 0) {
    return participants;
  }

  const winnerId = rankings[0];

  return awardCrownsByMap(participants, { [winnerId]: 1 });
}

export function awardCrownsByMap(
  participants: Participant[],
  crownAwards: Record<string, number>,
): Participant[] {
  return participants.map((participant) => {
    const award = crownAwards[participant.id] ?? 0;

    if (award <= 0) {
      return participant;
    }

    return {
      ...participant,
      crownCount: participant.crownCount + award,
    };
  });
}

export type PartyRoundOutcome =
  | { type: 'continue' }
  | { type: 'end'; winnerIds: string[] }
  | { type: 'suddenDeath'; tiedIds: string[] };

export function evaluatePartyRound(
  participants: Participant[],
  targetCrowns: number,
  roundIndex: number,
  maxRounds: number,
): PartyRoundOutcome {
  const reachedTarget = participants.filter(
    (participant) => participant.crownCount >= targetCrowns,
  );

  if (reachedTarget.length === 1) {
    return { type: 'end', winnerIds: [reachedTarget[0].id] };
  }

  if (reachedTarget.length > 1) {
    const topCrowns = Math.max(...reachedTarget.map((participant) => participant.crownCount));
    const tiedIds = reachedTarget
      .filter((participant) => participant.crownCount === topCrowns)
      .map((participant) => participant.id);

    if (tiedIds.length === 1) {
      return { type: 'end', winnerIds: tiedIds };
    }

    return { type: 'suddenDeath', tiedIds };
  }

  if (roundIndex >= maxRounds) {
    const topCrowns = Math.max(...participants.map((participant) => participant.crownCount));
    const topIds = participants
      .filter((participant) => participant.crownCount === topCrowns)
      .map((participant) => participant.id);

    if (topIds.length === 1) {
      return { type: 'end', winnerIds: topIds };
    }

    return { type: 'suddenDeath', tiedIds: topIds };
  }

  return { type: 'continue' };
}

export function compareParticipantsByCrown(left: Participant, right: Participant): number {
  if (right.crownCount !== left.crownCount) {
    return right.crownCount - left.crownCount;
  }

  return left.displayName.localeCompare(right.displayName, 'zh-Hant');
}

export function sortParticipantsByCrown(participants: Participant[]): Participant[] {
  return [...participants].sort(compareParticipantsByCrown);
}

export function sortParticipantIdsByCrown(
  participants: Participant[],
  crownCountFor: (participantId: string) => number,
): string[] {
  const nameById = Object.fromEntries(
    participants.map((participant) => [participant.id, participant.displayName]),
  );

  return participants
    .map((participant) => participant.id)
    .sort((leftId, rightId) => {
      const leftCount = crownCountFor(leftId);
      const rightCount = crownCountFor(rightId);

      if (rightCount !== leftCount) {
        return rightCount - leftCount;
      }

      const leftName = nameById[leftId] ?? leftId;
      const rightName = nameById[rightId] ?? rightId;

      return leftName.localeCompare(rightName, 'zh-Hant');
    });
}
