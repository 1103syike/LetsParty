/**
 * 下載開源免費音效／音樂到 public/audio（優先 CC0）
 * 用法：node scripts/fetch-audio-sources.mjs
 */
import { copyFileSync, createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const audioRoot = path.join(root, 'public', 'audio');

async function download(url, destAbs) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'LetsParty-audio-fetch/1.0' },
  });

  if (!res.ok || !res.body) {
    throw new Error(`${res.status} ${res.statusText}`);
  }

  mkdirSync(path.dirname(destAbs), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destAbs));
}

async function fetchOgaFiles(pageUrl) {
  const html = await (await fetch(pageUrl, {
    headers: { 'User-Agent': 'LetsParty-audio-fetch/1.0' },
  })).text();
  const matches = [...html.matchAll(/\/sites\/default\/files\/[^"'\\\s>]+\.(?:mp3|ogg|wav|flac)/gi)];
  // 略過 Drupal 預覽縮圖路徑，只要原始上傳檔
  const urls = matches
    .map((match) => `https://opengameart.org${match[0]}`)
    .filter((url) => !url.includes('/styles/') && !url.includes('/audio_preview/'));
  return [...new Set(urls)];
}

async function fetchKenneyZip(pageUrl) {
  const html = await (await fetch(pageUrl, {
    headers: { 'User-Agent': 'LetsParty-audio-fetch/1.0' },
  })).text();
  const absolute = html.match(/https?:\/\/[^"'\\\s]+kenney[^"'\\\s]+\.zip/i);
  if (absolute) {
    return absolute[0];
  }

  const relative = html.match(/\/media\/pages\/assets\/[^"'\\\s]+\.zip/i);
  return relative ? `https://kenney.nl${relative[0]}` : null;
}

const OGA_TRACKS = [
  {
    page: 'https://opengameart.org/content/funky-house',
    saveAs: 'bgm/volleyball.mp3',
    prefer: (url) => url.toLowerCase().includes('.mp3'),
    license: 'CC0 — Of Far Different Nature — Funky House',
  },
  {
    page: 'https://opengameart.org/content/talking-cute-chiptune',
    saveAs: 'bgm/rps.mp3',
    prefer: (url) => url.toLowerCase().includes('.mp3'),
    license: 'CC0 — Alex McCulloch (Pro Sensory) — Talking Cute',
  },
  {
    page: 'https://opengameart.org/content/tropical-loop',
    saveAs: 'bgm/arena.ogg',
    prefer: (url) => url.toLowerCase().includes('.ogg') || url.toLowerCase().includes('.wav'),
    license: 'CC0 — wipics — Tropical Loop',
  },
  {
    page: 'https://opengameart.org/content/feel-good-island-loop',
    saveAs: 'bgm/lobby.ogg',
    prefer: (url) => url.toLowerCase().includes('.ogg'),
    license: 'CC0 / OGA-BY 3.0 — Brandon Morris / AntumDeluge — Feel Good Island Loop',
  },
];

const KENNEY_PACKS = [
  {
    page: 'https://kenney.nl/assets/interface-sounds',
    saveAs: 'packs/kenney-interface-sounds.zip',
    license: 'CC0 — Kenney — Interface Sounds（點擊／UI）',
  },
  {
    page: 'https://kenney.nl/assets/impact-sounds',
    saveAs: 'packs/kenney-impact-sounds.zip',
    license: 'CC0 — Kenney — Impact Sounds（撞擊／碰撞）',
  },
  {
    page: 'https://kenney.nl/assets/music-jingles',
    saveAs: 'packs/kenney-music-jingles.zip',
    license: 'CC0 — Kenney — Music Jingles（勝利短樂）',
  },
  {
    page: 'https://kenney.nl/assets/rpg-audio',
    saveAs: 'packs/kenney-rpg-audio.zip',
    license: 'CC0 — Kenney — RPG Audio（含擊打／通用 SFX）',
  },
];

async function main() {
  mkdirSync(audioRoot, { recursive: true });
  const credits = [
    'LetsParty — 音訊來源與授權',
    '下載時間：' + new Date().toISOString(),
    '',
    '建議對應：',
    '- sfx/click* / hover / out ← Kenney Interface Sounds（out＝error_005）',
    '- sfx/impact* ← Kenney Impact Sounds（一拳擂台撞擊）',
    '- sfx/hit-ball* ← Kenney RPG Audio / Impact（沙灘排球擊球）',
    '- sfx/victory* ← Kenney Music Jingles',
    '- bgm/lobby + loading ← Feel Good Island Loop（載入中同大廳）',
    '- bgm/rps ← Talking Cute（騙騙猜拳）',
    '- bgm/arena ← Tropical Loop（一拳擂台）',
    '- bgm/volleyball ← Funky House（沙灘排球）',
    '',
  ];

  for (const track of OGA_TRACKS) {
    try {
      const files = await fetchOgaFiles(track.page);
      const url = files.find(track.prefer) ?? files[0];
      if (!url) {
        throw new Error('no file urls');
      }

      const dest = path.join(audioRoot, track.saveAs);
      console.log('download', url);
      await download(url, dest);
      credits.push(`OK  ${track.saveAs}`);
      credits.push(`    ${track.license}`);
      credits.push(`    ${track.page}`);
      credits.push(`    ${url}`);
      credits.push('');
    } catch (err) {
      console.warn('FAIL bgm', track.saveAs, err.message);
      credits.push(`FAIL ${track.saveAs} — ${err.message}`);
      credits.push(`    ${track.page}`);
      credits.push('');
    }
  }

  for (const pack of KENNEY_PACKS) {
    try {
      const zipUrl = await fetchKenneyZip(pack.page);
      if (!zipUrl) {
        throw new Error('zip link not found (可能要手動從官網下載)');
      }

      const dest = path.join(audioRoot, pack.saveAs);
      console.log('download pack', zipUrl);
      await download(zipUrl, dest);
      credits.push(`OK  ${pack.saveAs}`);
      credits.push(`    ${pack.license}`);
      credits.push(`    ${pack.page}`);
      credits.push(`    ${zipUrl}`);
      credits.push('');
    } catch (err) {
      console.warn('FAIL pack', pack.saveAs, err.message);
      credits.push(`FAIL ${pack.saveAs} — ${err.message}`);
      credits.push(`    請手動下載：${pack.page}`);
      credits.push(`    ${pack.license}`);
      credits.push('');
    }
  }

  // 載入中 BGM 與大廳相同
  const lobbyPath = path.join(audioRoot, 'bgm', 'lobby.ogg');
  const loadingPath = path.join(audioRoot, 'bgm', 'loading.ogg');

  if (existsSync(lobbyPath)) {
    copyFileSync(lobbyPath, loadingPath);
    credits.push('OK  bgm/loading.ogg（複製自 lobby.ogg）');
    credits.push('');
  }

  writeFileSync(path.join(audioRoot, 'CREDITS.txt'), `${credits.join('\n')}\n`, 'utf8');
  console.log('done → public/audio/CREDITS.txt');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
