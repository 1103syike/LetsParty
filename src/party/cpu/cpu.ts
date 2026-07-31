import { pickUnusedAnimalId } from '@/common/animals/animals';
import { pickRandomCpuDisplayName } from '@/party/cpu/cpu-name';
import type { AnimalId } from '@/types/animal';
import type { Participant, PlayerColor } from '@/types/party';
import { PARTY_PLAYER_COUNT } from '@/types/party';

const PLAYER_COLORS: PlayerColor[] = ['player-1', 'player-2', 'player-3', 'player-4'];

function createCpuParticipant(
  seatIndex: number,
  cpuNumber: number,
  displayName: string,
  animalId: AnimalId,
): Participant {
  return {
    id: `cpu-${cpuNumber}`,
    displayName,
    kind: 'cpu',
    color: PLAYER_COLORS[seatIndex],
    animalId,
    crownCount: 0,
    isReady: true,
  };
}

export function fillCpuToFour(participants: Participant[]): Participant[] {
  const filled = [...participants];
  const usedNames = new Set(filled.map((participant) => participant.displayName));
  let cpuNumber = nextCpuNumber(filled);

  while (filled.length < PARTY_PLAYER_COUNT) {
    const taken = new Set(filled.map((participant) => participant.animalId));
    const animalId = pickUnusedAnimalId(taken);
    const displayName = pickRandomCpuDisplayName(usedNames);

    usedNames.add(displayName);
    filled.push(createCpuParticipant(filled.length, cpuNumber, displayName, animalId));
    cpuNumber += 1;
  }

  return filled.map((participant, seatIndex) => {
    if (participant.animalId) {
      return participant;
    }

    const taken = new Set(
      filled
        .filter((_, index) => index !== seatIndex)
        .map((entry) => entry.animalId),
    );
    const animalId = pickUnusedAnimalId(taken);

    return {
      ...participant,
      animalId,
    };
  });
}

/** 保留真人，裁掉多餘 CPU 再補到 4 */
export function reconcileCpuSeats(participants: Participant[]): Participant[] {
  const humans = participants.filter((participant) => participant.kind === 'human');
  const cpus = participants.filter((participant) => participant.kind === 'cpu');
  const needCpu = Math.max(0, PARTY_PLAYER_COUNT - humans.length);
  const kept = [...humans, ...cpus.slice(0, needCpu)];

  return fillCpuToFour(kept).map((participant, index) => ({
    ...participant,
    color: PLAYER_COLORS[index] ?? participant.color,
  }));
}

/** 把真人塞進第一個 CPU 席（或附加再 reconcile） */
export function seatHumanReplacingCpu(
  participants: Participant[],
  human: Participant,
): Participant[] {
  const next = [...participants];
  const cpuIndex = next.findIndex((participant) => participant.kind === 'cpu');

  if (cpuIndex >= 0) {
    const seatColor = next[cpuIndex]!.color;
    next[cpuIndex] = {
      ...human,
      color: seatColor,
      crownCount: 0,
      isReady: human.isReady ?? false,
    };
    return reconcileCpuSeats(next);
  }

  if (next.filter((participant) => participant.kind === 'human').length >= PARTY_PLAYER_COUNT) {
    return participants;
  }

  return reconcileCpuSeats([...next, human]);
}

export function removeHumanById(
  participants: Participant[],
  humanId: string,
): Participant[] {
  const next = participants.filter((participant) => participant.id !== humanId);
  return reconcileCpuSeats(next);
}

function nextCpuNumber(participants: Participant[]): number {
  let max = 0;

  for (const participant of participants) {
    if (participant.kind !== 'cpu') {
      continue;
    }

    const match = /^cpu-(\d+)$/.exec(participant.id);

    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }

  return max + 1;
}
