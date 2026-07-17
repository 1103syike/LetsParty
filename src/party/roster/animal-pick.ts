import {
  getTakenAnimalIds,
  normalizeAnimalId,
  pickUnusedAnimalId,
} from '@/common/animals/animals';
import type { AnimalId } from '@/types/animal';
import type { Participant } from '@/types/party';

/** 只有其他「真人」佔用的動物不能搶；CPU 可被本地玩家擠走 */
export function isAnimalBlockedForHumanPick(
  animalId: AnimalId | 'fox',
  participants: Array<Participant>,
  localParticipantId: string,
): boolean {
  const normalizedId = normalizeAnimalId(animalId);

  return participants.some((participant) => {
    if (participant.id === localParticipantId) {
      return false;
    }

    if (participant.kind !== 'human') {
      return false;
    }

    return normalizeAnimalId(participant.animalId) === normalizedId;
  });
}

function assignCpuAnimal(participant: Participant, animalId: AnimalId): Participant {
  return {
    ...participant,
    animalId,
  };
}

/**
 * 本地玩家選動物：優先權高於 CPU。
 * 若搶 CPU 的動物，CPU 改拿玩家原本的動物（交換）；交換衝突時再挑剩餘動物。
 */
export function applyHumanAnimalPick(
  participants: Participant[],
  localParticipantId: string,
  animalId: AnimalId,
): Participant[] {
  const localParticipant = participants.find((participant) => participant.id === localParticipantId);

  if (!localParticipant) {
    return participants;
  }

  const targetId = normalizeAnimalId(animalId);
  const previousId = normalizeAnimalId(localParticipant.animalId);

  if (previousId === targetId) {
    return participants;
  }

  if (isAnimalBlockedForHumanPick(targetId, participants, localParticipantId)) {
    return participants;
  }

  const displacedOwner = participants.find(
    (participant) =>
      participant.id !== localParticipantId
      && normalizeAnimalId(participant.animalId) === targetId,
  );

  let next = participants.map((participant) => {
    if (participant.id === localParticipantId) {
      return {
        ...participant,
        animalId: targetId,
      };
    }

    return participant;
  });

  if (!displacedOwner || displacedOwner.kind !== 'cpu') {
    return next;
  }

  const swapCandidate = previousId;
  const canSwap = !next.some(
    (participant) =>
      participant.id !== displacedOwner.id
      && normalizeAnimalId(participant.animalId) === swapCandidate,
  );

  if (canSwap) {
    return next.map((participant) => {
      if (participant.id === displacedOwner.id) {
        return assignCpuAnimal(participant, swapCandidate);
      }

      return participant;
    });
  }

  const taken = getTakenAnimalIds(next, displacedOwner.id);
  const fallbackId = pickUnusedAnimalId(taken);

  return next.map((participant) => {
    if (participant.id === displacedOwner.id) {
      return assignCpuAnimal(participant, fallbackId);
    }

    return participant;
  });
}

export function findParticipantByAnimalId(
  participants: Participant[],
  animalId: AnimalId | 'fox',
): Participant | undefined {
  const normalizedId = normalizeAnimalId(animalId);

  return participants.find(
    (participant) => normalizeAnimalId(participant.animalId) === normalizedId,
  );
}
