import { mashButtonCopy } from '@/minigames/mash-button/locales/zh-TW';
import { MashButtonGame } from '@/minigames/mash-button/mash-button';
import type { MiniGameDefinition } from '@/minigames/types';

export const mashButtonDefinition: MiniGameDefinition = {
  id: 'mash-button',
  name: mashButtonCopy.name,
  rules: mashButtonCopy.rules,
  inputMode: 'mash',
  create(participants, _localPlayerId?) {
    return new MashButtonGame(participants);
  },
};
