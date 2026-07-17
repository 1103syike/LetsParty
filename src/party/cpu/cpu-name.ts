import { cpuFunnyNamesCopy } from '@/locales/zh-TW/cpu-names';

export function pickRandomCpuDisplayName(usedNames: ReadonlySet<string>): string {
  const available = cpuFunnyNamesCopy.filter((name) => !usedNames.has(name));

  if (available.length === 0) {
    const fallbackIndex = usedNames.size % cpuFunnyNamesCopy.length;

    return `${cpuFunnyNamesCopy[fallbackIndex]}·${usedNames.size + 1}`;
  }

  const index = Math.floor(Math.random() * available.length);

  return available[index];
}
