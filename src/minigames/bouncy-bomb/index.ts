import { BOUNCY_BOMB_ID } from '@/minigames/bouncy-bomb/bouncy-bomb-id';
import { BouncyBombGame, type BouncyBombSnapshot } from '@/minigames/bouncy-bomb/bouncy-bomb';
import { bouncyBombCopy } from '@/minigames/bouncy-bomb/locales/zh-TW';
import type { MiniGameCreateOptions, MiniGameDefinition } from '@/minigames/types';
import type { Participant } from '@/types/party';

export { BOUNCY_BOMB_ID } from '@/minigames/bouncy-bomb/bouncy-bomb-id';

export const bouncyBombDefinition: MiniGameDefinition = {
  id: BOUNCY_BOMB_ID,
  name: bouncyBombCopy.name,
  rules: bouncyBombCopy.rules,
  inputMode: 'mixed',
  create(
    participants: Participant[],
    localPlayerId: string | null = null,
    options: MiniGameCreateOptions = {},
  ) {
    return new BouncyBombGame(participants, localPlayerId, options);
  },
};

export type { BouncyBombSnapshot };
