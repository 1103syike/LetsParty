import { arenaBumpDefinition } from '@/minigames/arena-bump';
import { ARENA_BUMP_ID } from '@/minigames/arena-bump/arena-bump-id';
import { mashButtonDefinition } from '@/minigames/mash-button';
import { rockPaperScissorsDefinition, ROCK_PAPER_SCISSORS_ID } from '@/minigames/rock-paper-scissors';
import type { MiniGameDefinition } from '@/minigames/types';
import { volleyballDefinition } from '@/minigames/volleyball';
import { VOLLEYBALL_ID } from '@/minigames/volleyball/volleyball-id';

const MINI_GAME_REGISTRY: MiniGameDefinition[] = [
  rockPaperScissorsDefinition,
  arenaBumpDefinition,
  volleyballDefinition,
  mashButtonDefinition,
];

/** 輪抽池：正式可玩、可在大廳勾選的遊戲 */
const ROTATION_POOL: MiniGameDefinition[] = [
  rockPaperScissorsDefinition,
  arenaBumpDefinition,
  volleyballDefinition,
];

export const DEFAULT_ENABLED_MINI_GAME_IDS: string[] = ROTATION_POOL.map(
  (definition) => definition.id,
);

export function getMiniGameById(id: string): MiniGameDefinition | undefined {
  return MINI_GAME_REGISTRY.find((definition) => definition.id === id);
}

/** 大廳可勾選的遊戲清單 */
export function listSelectableMiniGames(): MiniGameDefinition[] {
  return [...ROTATION_POOL];
}

export function resolveEnabledMiniGames(enabledIds: string[] | undefined): MiniGameDefinition[] {
  const ids = enabledIds && enabledIds.length > 0
    ? enabledIds
    : DEFAULT_ENABLED_MINI_GAME_IDS;

  const matched = ids
    .map((id) => getMiniGameById(id))
    .filter((definition): definition is MiniGameDefinition => Boolean(definition))
    .filter((definition) =>
      ROTATION_POOL.some((entry) => entry.id === definition.id),
    );

  if (matched.length === 0) {
    return [...ROTATION_POOL];
  }

  return matched;
}

export function pickRandomMiniGame(enabledIds?: string[]): MiniGameDefinition {
  const pool = resolveEnabledMiniGames(enabledIds);
  const index = Math.floor(Math.random() * pool.length);

  return pool[index] ?? rockPaperScissorsDefinition;
}

export { ARENA_BUMP_ID, ROCK_PAPER_SCISSORS_ID, VOLLEYBALL_ID };
