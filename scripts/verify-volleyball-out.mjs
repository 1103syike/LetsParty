/**
 * 驗證排球出界提示＋音效（需先 npm run dev）
 * 用法：node scripts/verify-volleyball-out.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.COVER_CAPTURE_URL ?? 'http://127.0.0.1:3000';
const shotPath = path.join(root, 'tmp-volleyball-out-fx.png');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const outSfxHits = [];
page.on('request', (req) => {
  if (req.url().includes('/audio/sfx/out.ogg')) {
    outSfxHits.push(req.url());
  }
});

console.log('open', baseUrl);
await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.getByRole('button', { name: '測試模式' }).click();
await page.getByRole('button', { name: /沙灘排球|排球/ }).click();

// 跳過 intro（若有「開始」）
const startBtn = page.getByRole('button', { name: /開始/ });
if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
  await startBtn.click();
}

await page.waitForFunction(() => typeof window.__vbDebug?.forceOut === 'function', null, {
  timeout: 30_000,
});

await page.evaluate(() => {
  window.__vbDebug.forceOut();
});

const fx = page.locator('.volleyball-play__score-fx--out');
await fx.waitFor({ state: 'visible', timeout: 5000 });
const stampText = (await fx.innerText()).replace(/\s+/g, ' ').trim();
await page.screenshot({ path: shotPath, animations: 'disabled' });

console.log('fx text:', stampText);
console.log('out sfx requests:', outSfxHits.length);
console.log('screenshot:', shotPath);

if (!stampText.includes('出界')) {
  throw new Error(`出界大字沒出現：${stampText}`);
}

if (outSfxHits.length < 1) {
  throw new Error('沒請求 /audio/sfx/out.ogg');
}

await browser.close();
console.log('OK');
