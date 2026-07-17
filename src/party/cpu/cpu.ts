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
  };
}

export function fillCpuToFour(participants: Participant[]): Participant[] {
  const filled = [...participants];
  const usedNames = new Set(filled.map((participant) => participant.displayName));
  let cpuNumber = 1;

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
