import { ARENA_BUMP_ID } from '@/minigames/arena-bump/arena-bump-id';
import { arenaBumpCopy } from '@/minigames/arena-bump/locales/zh-TW';
import { ROCK_PAPER_SCISSORS_ID } from '@/minigames/rock-paper-scissors';
import { rpsCopy } from '@/minigames/rock-paper-scissors/locales/zh-TW';
import { volleyballCopy } from '@/minigames/volleyball/locales/zh-TW';
import { VOLLEYBALL_ID } from '@/minigames/volleyball/volleyball-id';

export interface MiniGameLoadingSlide {
  tip: string;
  imageSrc: string;
}

export interface MiniGameLoadingContent {
  name: string;
  intro: string;
  slides: readonly MiniGameLoadingSlide[];
}

function buildSlides(
  folder: string,
  tips: readonly string[],
): MiniGameLoadingSlide[] {
  return tips.map((tip, index) => ({
    tip,
    imageSrc: `/images/minigames/${folder}/slide-${String(index).padStart(2, '0')}.png`,
  }));
}

const FALLBACK: MiniGameLoadingContent = {
  name: '派對小遊戲',
  intro: '準備開戰！先看看玩法，載入完成後就能上場。',
  slides: buildSlides('rps', ['讀完小提示再按開始遊戲。', '先集滿皇冠的人獲勝！']),
};

const BY_ID: Record<string, MiniGameLoadingContent> = {
  [ROCK_PAPER_SCISSORS_ID]: {
    name: rpsCopy.name,
    intro: rpsCopy.loadingIntro,
    slides: buildSlides('rps', rpsCopy.loadingTips),
  },
  [ARENA_BUMP_ID]: {
    name: arenaBumpCopy.name,
    intro: arenaBumpCopy.loadingIntro,
    slides: buildSlides('arena-bump', arenaBumpCopy.loadingTips),
  },
  [VOLLEYBALL_ID]: {
    name: volleyballCopy.name,
    intro: volleyballCopy.loadingIntro,
    slides: buildSlides('volleyball', volleyballCopy.loadingTips),
  },
};

export function getMiniGameLoadingContent(gameId: string | null): MiniGameLoadingContent {
  if (!gameId) {
    return FALLBACK;
  }

  return BY_ID[gameId] ?? FALLBACK;
}

/** 截圖腳本／capture 頁共用：每關有幾張教學圖 */
export function getLoadingSlideCount(gameId: string): number {
  return getMiniGameLoadingContent(gameId).slides.length;
}

export function getLoadingSlideTip(gameId: string, slideIndex: number): string {
  const slides = getMiniGameLoadingContent(gameId).slides;

  if (slides.length === 0) {
    return '';
  }

  return slides[slideIndex % slides.length]!.tip;
}
