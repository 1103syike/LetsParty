import { ARENA_BUMP_ID } from '@/minigames/arena-bump/arena-bump-id';
import { ArenaBumpGame, type ArenaBumpSnapshot } from '@/minigames/arena-bump/arena-bump';
import { arenaBumpCopy } from '@/minigames/arena-bump/locales/zh-TW';
import type { MiniGameDefinition } from '@/minigames/types';
import type { Participant } from '@/types/party';

export { ARENA_BUMP_ID } from '@/minigames/arena-bump/arena-bump-id';

export const arenaBumpDefinition: MiniGameDefinition = {
  id: ARENA_BUMP_ID,
  name: arenaBumpCopy.name,
  rules: arenaBumpCopy.rules,
  inputMode: 'joystick',
  create(participants: Participant[], localPlayerId: string | null = null) {
    return new ArenaBumpGame(participants, localPlayerId);
  },
};

export type { ArenaBumpSnapshot };
