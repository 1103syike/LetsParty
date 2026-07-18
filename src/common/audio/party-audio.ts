/** 派對音訊：BGM 單軌循環 + SFX 短音（瀏覽器需使用者互動後才能播） */

export type PartySfxId =
  | 'click'
  | 'clickConfirm'
  | 'hover'
  | 'impact'
  | 'impactHeavy'
  | 'hitBall'
  | 'hitBallAlt'
  | 'out'
  | 'victory'
  | 'victoryAlt';

export type PartyBgmId = 'lobby' | 'loading' | 'rps' | 'arena' | 'volleyball';

const SFX_SRC: Record<PartySfxId, string> = {
  click: '/audio/sfx/click.ogg',
  clickConfirm: '/audio/sfx/click-confirm.ogg',
  hover: '/audio/sfx/hover.ogg',
  impact: '/audio/sfx/impact.ogg',
  impactHeavy: '/audio/sfx/impact-heavy.ogg',
  hitBall: '/audio/sfx/hit-ball.ogg',
  hitBallAlt: '/audio/sfx/hit-ball-alt.ogg',
  out: '/audio/sfx/out.ogg',
  victory: '/audio/sfx/victory.ogg',
  victoryAlt: '/audio/sfx/victory-alt.ogg',
};

const BGM_SRC: Record<PartyBgmId, string> = {
  lobby: '/audio/bgm/lobby.ogg',
  loading: '/audio/bgm/loading.ogg',
  rps: '/audio/bgm/rps.mp3',
  arena: '/audio/bgm/arena.ogg',
  volleyball: '/audio/bgm/volleyball.mp3',
};

const BGM_VOLUME = 0.42;
const SFX_VOLUME = 0.72;
const SFX_HOVER_VOLUME = 0.55;
/** hover 連掃按鈕時不要連珠砲 */
const HOVER_SFX_COOLDOWN_MS = 70;

class PartyAudio {
  private unlocked = false;

  private bgmEl: HTMLAudioElement | null = null;

  /** 目前該播的 BGM（即使被自動播放擋下也會記住，解鎖後重試） */
  private desiredBgmId: PartyBgmId | null = null;

  private unlockListenersBound = false;

  private lastHoverSfxAt = 0;

  /** 綁定第一次互動解鎖（自動播放政策） */
  bindAutoUnlock(): void {
    if (this.unlockListenersBound || typeof window === 'undefined') {
      return;
    }

    this.unlockListenersBound = true;

    const onInteract = (): void => {
      void this.unlock().then(() => {
        this.resumeBgmIfNeeded();
      });
    };

    window.addEventListener('pointerdown', onInteract, { once: true });
    window.addEventListener('keydown', onInteract, { once: true });
  }

  async unlock(): Promise<void> {
    if (this.unlocked) {
      this.resumeBgmIfNeeded();
      return;
    }

    try {
      const probe = new Audio(SFX_SRC.click);
      probe.volume = 0.001;
      await probe.play();
      probe.pause();
      this.unlocked = true;
      this.resumeBgmIfNeeded();
    } catch {
      // 還不能播，等下一次互動
    }
  }

  playSfx(id: PartySfxId): void {
    if (id === 'hover') {
      // 還沒解鎖前 hover 一定被瀏覽器擋，別空播
      if (!this.unlocked) {
        return;
      }

      const now = performance.now();
      if (now - this.lastHoverSfxAt < HOVER_SFX_COOLDOWN_MS) {
        return;
      }
      this.lastHoverSfxAt = now;
    } else {
      void this.unlock();
    }

    const audio = new Audio(SFX_SRC[id]);
    audio.volume = id === 'hover' ? SFX_HOVER_VOLUME : SFX_VOLUME;
    void audio.play().catch(() => undefined);
  }

  playBgm(id: PartyBgmId): void {
    this.desiredBgmId = id;

    if (this.bgmEl && this.desiredBgmId === id && !this.bgmEl.paused) {
      return;
    }

    if (this.bgmEl) {
      this.bgmEl.pause();
      this.bgmEl.src = '';
      this.bgmEl = null;
    }

    const audio = new Audio(BGM_SRC[id]);
    audio.loop = true;
    audio.volume = BGM_VOLUME;
    this.bgmEl = audio;

    void audio.play().catch(() => {
      // 被自動播放擋下：解鎖後 resumeBgmIfNeeded 會再播
    });
  }

  stopBgm(): void {
    this.desiredBgmId = null;

    if (this.bgmEl) {
      this.bgmEl.pause();
      this.bgmEl.src = '';
      this.bgmEl = null;
    }
  }

  /** 解鎖後把該播的 BGM 接回來 */
  resumeBgmIfNeeded(): void {
    if (!this.desiredBgmId) {
      return;
    }

    const id = this.desiredBgmId;

    if (this.bgmEl && !this.bgmEl.paused) {
      return;
    }

    // 重新 playBgm：清掉卡住的 paused element 再播
    this.desiredBgmId = id;

    if (this.bgmEl) {
      void this.bgmEl.play().then(() => {
        this.unlocked = true;
      }).catch(() => {
        // element 壞了就重建
        this.bgmEl = null;
        this.playBgm(id);
      });
      return;
    }

    this.playBgm(id);
  }
}

export const partyAudio = new PartyAudio();
