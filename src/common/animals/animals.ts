import {
  ANIMAL_IDS,
  ANIMAL_MODEL_LICENSE,
  type AnimalDefinition,
  type AnimalId,
} from '@/types/animal';

/**
 * Quaternius 低多邊形動物（CC0）
 * 模型來源：https://poly.pizza/u/Quaternius
 * glb 放在 public/models/animals/
 */
export const ANIMAL_LIST: AnimalDefinition[] = [
  {
    id: 'pig',
    name: '豬',
    modelPath: '/models/animals/pig.glb',
  },
  {
    id: 'chicken',
    name: '雞',
    modelPath: '/models/animals/chicken.glb',
  },
  {
    id: 'dog',
    name: '狗',
    modelPath: '/models/animals/dog.glb',
  },
  {
    id: 'sheep',
    name: '羊',
    modelPath: '/models/animals/sheep.glb',
  },
];

export { ANIMAL_MODEL_LICENSE };

/** 舊存檔可能仍是 fox，統一映射到雞 */
export function normalizeAnimalId(animalId: AnimalId | 'fox'): AnimalId {
  if (animalId === 'fox') {
    return 'chicken';
  }

  return animalId;
}

export function getAnimalById(animalId: AnimalId | 'fox'): AnimalDefinition {
  const normalizedId = normalizeAnimalId(animalId);
  const matched = ANIMAL_LIST.find((animal) => animal.id === normalizedId);

  if (matched) {
    return matched;
  }

  return ANIMAL_LIST[0];
}

/** UI 頭像圈內顯示的動物簡稱（繁體一字） */
export function getAnimalAvatarLabel(animalId: AnimalId | 'fox'): string {
  return getAnimalById(animalId).name;
}

export function getDefaultAnimalForSeat(seatIndex: number): AnimalId {
  return ANIMAL_IDS[seatIndex % ANIMAL_IDS.length];
}

export function getTakenAnimalIds(
  participants: Array<{ id: string; animalId: AnimalId | 'fox' }>,
  excludeParticipantId?: string,
): Set<AnimalId> {
  const taken = new Set<AnimalId>();

  for (const participant of participants) {
    if (excludeParticipantId && participant.id === excludeParticipantId) {
      continue;
    }

    taken.add(normalizeAnimalId(participant.animalId));
  }

  return taken;
}

export function isAnimalAvailable(
  animalId: AnimalId | 'fox',
  participants: Array<{ id: string; animalId: AnimalId | 'fox' }>,
  forParticipantId?: string,
): boolean {
  const normalizedId = normalizeAnimalId(animalId);

  return !participants.some((participant) => {
    const takenId = normalizeAnimalId(participant.animalId);

    return takenId === normalizedId && participant.id !== forParticipantId;
  });
}

export function pickUnusedAnimalId(taken: Set<AnimalId>): AnimalId {
  const available = ANIMAL_IDS.filter((animalId) => !taken.has(animalId));

  if (available.length === 0) {
    return ANIMAL_IDS[0];
  }

  const index = Math.floor(Math.random() * available.length);

  return available[index];
}

export function pickRandomAnimalId(): AnimalId {
  const index = Math.floor(Math.random() * ANIMAL_LIST.length);

  return ANIMAL_LIST[index].id;
}
