/**
 * 開發驗證：CPU 緊急回擊是否一定把球打到對面半場。
 * 執行：npx vite-node src/minigames/volleyball/dev-verify-cpu-return.ts
 */
import { VolleyballGame } from '@/minigames/volleyball/volleyball';
import type { Participant } from '@/types/party';

const participants: Participant[] = [
  {
    id: 'human',
    displayName: 'Human',
    kind: 'human',
    color: 'player-1',
    animalId: 'pig',
    crownCount: 0,
  },
  {
    id: 'cpu-1',
    displayName: 'CPU1',
    kind: 'cpu',
    color: 'player-2',
    animalId: 'dog',
    crownCount: 0,
  },
  {
    id: 'cpu-2',
    displayName: 'CPU2',
    kind: 'cpu',
    color: 'player-3',
    animalId: 'chicken',
    crownCount: 0,
  },
  {
    id: 'cpu-3',
    displayName: 'CPU3',
    kind: 'cpu',
    color: 'player-4',
    animalId: 'sheep',
    crownCount: 0,
  },
];

const game = new VolleyballGame(participants, 'human');
game.start();

const resultA = game.devVerifyCpuReturn('a');
const resultB = game.devVerifyCpuReturn('b');

const ok = resultA.ok && resultB.ok;
console.log('team A landing → return', resultA);
console.log('team B landing → return', resultB);
console.log(ok ? 'PASS: CPU can return over net from both sides' : 'FAIL: CPU return broken');

if (!ok) {
  throw new Error('CPU return verification failed');
}
