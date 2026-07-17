import type { MiniGameDefinition } from '@/minigames/types';
import { volleyballCopy } from '@/minigames/volleyball/locales/zh-TW';
import { VolleyballGame, type VolleyballSnapshot } from '@/minigames/volleyball/volleyball';
import { VOLLEYBALL_ID } from '@/minigames/volleyball/volleyball-id';
import type { Participant } from '@/types/party';

export { VOLLEYBALL_ID } from '@/minigames/volleyball/volleyball-id';

export const volleyballDefinition: MiniGameDefinition = {
  id: VOLLEYBALL_ID,
  name: volleyballCopy.name,
  rules: volleyballCopy.rules,
  inputMode: 'mixed',
  create(participants: Participant[], localPlayerId: string | null = null) {
    return new VolleyballGame(participants, localPlayerId);
  },
};

export type { VolleyballSnapshot };
