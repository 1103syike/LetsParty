import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'models', 'animals');
mkdirSync(outDir, { recursive: true });

function findGlbUrl(polyId) {
  const html = execFileSync(
    'curl.exe',
    ['-sL', '-A', 'Mozilla/5.0', `https://poly.pizza/m/${polyId}`],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  );
  const match = html.match(/https:\/\/static\.poly\.pizza\/[a-f0-9-]+\.glb/i);
  if (!match) {
    throw new Error(`No glb url for ${polyId}`);
  }
  return match[0];
}

async function download(name, url) {
  const dest = path.join(outDir, `${name}.glb`);
  console.log('downloading', name, url);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    redirect: 'follow',
  });
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status} for ${name}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  console.log('saved', dest);
}

const targets = {
  cat: 'qKICY6xla2',
  horse: 'D3hAeqeDBE',
};

const resolved = {};
for (const [name, id] of Object.entries(targets)) {
  const url = findGlbUrl(id);
  resolved[name] = { id, url };
  await download(name, url);
}

writeFileSync(
  path.join(root, 'scripts', 'animal-sources.json'),
  `${JSON.stringify(resolved, null, 2)}\n`,
);
console.log('done', resolved);
