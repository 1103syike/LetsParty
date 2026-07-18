/**
 * 用真實遊戲畫面截「教學輪播」海報（需先 npm run dev）
 * 用法：node scripts/capture-minigame-covers.mjs
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = path.join(root, 'public', 'images', 'minigames');
const baseUrl = process.env.COVER_CAPTURE_URL ?? 'http://127.0.0.1:3000';

const GAMES = [
  { gameId: 'rock-paper-scissors', folder: 'rps', slides: 12 },
  { gameId: 'arena-bump', folder: 'arena-bump', slides: 12 },
  { gameId: 'volleyball', folder: 'volleyball', slides: 12 },
];

mkdirSync(outRoot, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1920, height: 1440 },
  deviceScaleFactor: 1,
});

for (const game of GAMES) {
  const folder = path.join(outRoot, game.folder);
  mkdirSync(folder, { recursive: true });

  for (let slide = 0; slide < game.slides; slide += 1) {
    const url = `${baseUrl}/dev/cover-capture/${game.gameId}/${slide}`;
    console.log('open', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });

    await page.waitForFunction(
      () => window.__COVER_CAPTURE__?.ready === true,
      null,
      { timeout: 90_000 },
    );

    await page.waitForTimeout(500);

    const dest = path.join(folder, `slide-${String(slide).padStart(2, '0')}.png`);
    await page.locator('[data-cover-root]').screenshot({ path: dest, type: 'png' });
    console.log('saved', dest);
  }
}

await browser.close();
console.log('done');
