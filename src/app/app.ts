// Wires the sim, driver, renderers, audio, input and UI together.
import { Game, type SimEvent } from '../sim/game';
import { Driver } from './driver';
import { ClassicRenderer } from '../render/classic/classic';
import type { Renderer } from '../render/renderer';
import { AudioEngine } from '../audio/engine';
import { Controls, type UiAction } from '../input/controls';
import { Ui } from '../ui/ui';
import { HighScores, loadSettings, saveSettings, type Settings } from '../storage/storage';
import type { Key } from '../sim/input';

export class App {
  readonly settings: Settings = loadSettings();
  readonly scores = new HighScores();
  readonly game: Game;
  readonly driver: Driver;
  private audio: AudioEngine | null = null;
  private classic = new ClassicRenderer();
  private hd: Renderer | null = null;
  private hdLoading: Promise<Renderer | null> | null = null;
  private active: Renderer;
  private readonly stage: HTMLElement;
  private readonly ui: Ui;
  private readonly controls: Controls;
  private touchEl: HTMLElement | null = null;
  private last = performance.now();
  private start = performance.now();
  private assisted = false;
  private wasInGame = false;

  constructor(root: HTMLElement) {
    this.stage = document.createElement('div');
    this.stage.className = 'stage';
    root.appendChild(this.stage);

    this.game = new Game((Math.random() * 0x7fffffff) | 0, {
      highScores: () => this.scores.list(),
      isHighScore: (s) => this.scores.qualifies(s),
    }, { turnBuffer: this.settings.turnBuffer });

    this.driver = new Driver(this.game, (e) => this.audio?.command(e.cmd, e.arg));
    this.driver.speed = this.settings.speed;

    this.active = this.classic;
    this.stage.appendChild(this.classic.canvas);

    this.ui = new Ui(root, this.settings, () => this.scores.list(), {
      start: (n) => this.startGame(n),
      resume: () => this.resume(),
      quit: () => this.quit(),
      settingsChanged: (s, k) => this.applySetting(s, k),
      resetScores: () => {
        this.scores.reset();
        this.ui.toast('High scores cleared');
      },
      submitInitials: (s) => this.submitInitials(s),
      typingInitials: (s) => this.game.showInitials(s),
      unlock: () => this.unlockAudio(),
    });

    const app = this;
    this.controls = new Controls({
      press: (k: Key) => this.game.input.press(k),
      release: (k: Key) => this.game.input.release(k),
      action: (a) => this.action(a),
      get menuOpen() {
        return app.ui.menuOpen;
      },
    });

    this.applyAll();
    this.ui.show('boot');

    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.autoPause();
    });
    addEventListener('blur', () => this.autoPause());
    this.resize();
    requestAnimationFrame((t) => this.frame(t));
    // Keep the sim alive where rAF is suspended but the page is still shown
    // (some embedded/background views); harmless elsewhere.
    setInterval(() => {
      if (performance.now() - this.last > 200) this.frame(performance.now(), false);
    }, 100);
  }

  // --- Actions ----------------------------------------------------------------

  private action(a: UiAction): void {
    switch (a) {
      case 'pause':
        if (this.ui.screen == 'pause') this.resume();
        else if (this.ui.screen == null && this.game.inGame && this.game.scene != 'initials') this.pause();
        else if (this.ui.screen == 'settings' || this.ui.screen == 'help' || this.ui.screen == 'scores') this.ui.back();
        break;
      case 'back':
        this.ui.back();
        break;
      case 'confirm':
        this.ui.confirm();
        break;
      case 'skip':
        if (this.driver.skip()) this.ui.showSkipHint(false);
        break;
      case 'toggleGraphics':
        this.settings.graphics = this.settings.graphics == 'hd' ? 'classic' : 'hd';
        this.applySetting(this.settings, 'graphics');
        this.ui.toast(this.settings.graphics == 'hd' ? 'Remastered graphics' : 'Classic graphics');
        if (this.ui.screen == 'settings') this.ui.show('settings');
        break;
      case 'mute':
        this.settings.muted = !this.settings.muted;
        this.applySetting(this.settings, 'muted');
        this.ui.toast(this.settings.muted ? 'Sound muted' : 'Sound on');
        break;
    }
  }

  private startGame(players: number): void {
    this.assisted = this.settings.turnBuffer > 0 || this.settings.speed != 1;
    this.game.requestStart(players);
    this.ui.show(null);
  }

  private pause(): void {
    this.driver.paused = true;
    this.audio?.setPaused(true);
    this.controls.releaseAll();
    this.game.input.releaseAll();
    this.ui.show('pause');
  }

  private resume(): void {
    this.driver.paused = false;
    this.audio?.setPaused(false);
    this.ui.show(null);
  }

  private autoPause(): void {
    this.controls.releaseAll();
    this.game.input.releaseAll();
    if (this.ui.screen == null && this.game.inGame && this.game.scene != 'initials') this.pause();
  }

  private quit(): void {
    this.game.quit();
    this.driver.paused = false;
    this.audio?.setPaused(false);
    this.ui.show(null);
  }

  private submitInitials(s: string): void {
    const p = this.game.pendingInitials;
    if (p) this.scores.add({ initials: s, score: p.score, assisted: this.assisted || undefined, date: new Date().toISOString() });
    this.game.submitInitials(s);
    this.ui.show(null);
  }

  private async unlockAudio(): Promise<void> {
    if (!this.audio) {
      try {
        this.audio = new AudioEngine();
        this.audio.setHdFactory(async (engine) => (await import('../audio/hd/jazz')).createJazz(engine));
        this.applyVolumes();
        await this.audio.setMode(this.settings.audio, this.game.sound.tune);
      } catch (e) {
        console.warn('Audio unavailable', e);
      }
    }
    await this.audio?.unlock();
  }

  // --- Settings -----------------------------------------------------------------

  private applyAll(): void {
    for (const k of Object.keys(this.settings) as (keyof Settings)[]) this.applySetting(this.settings, k, false);
  }

  private applySetting(s: Settings, key: keyof Settings, save = true): void {
    switch (key) {
      case 'masterVolume':
      case 'musicVolume':
      case 'sfxVolume':
      case 'muted':
        this.applyVolumes();
        break;
      case 'audio':
        this.audio?.setMode(s.audio, this.game.sound.tune);
        break;
      case 'graphics':
        this.setGraphics(s.graphics);
        break;
      case 'crt':
        this.stage.classList.toggle('crt', s.crt);
        break;
      case 'turnBuffer':
        this.game.options.turnBuffer = s.turnBuffer;
        if (s.turnBuffer > 0 && this.game.inGame) this.assisted = true;
        break;
      case 'speed':
        this.driver.speed = s.speed;
        if (s.speed != 1 && this.game.inGame) this.assisted = true;
        break;
      case 'touchControls':
        this.setTouch();
        break;
      case 'reducedMotion':
      case 'quality':
        (this.hd as unknown as { configure?(s: Settings): void } | null)?.configure?.(s);
        break;
    }
    if (save) saveSettings(s);
  }

  private applyVolumes(): void {
    const s = this.settings;
    this.audio?.setVolumes(s.masterVolume, s.musicVolume, s.sfxVolume, s.muted);
  }

  private setTouch(): void {
    const mode = this.settings.touchControls;
    const on = mode == 'on' || (mode == 'auto' && matchMedia('(pointer: coarse)').matches);
    if (on && !this.touchEl) this.touchEl = this.controls.mountTouch(document.body);
    if (this.touchEl) this.touchEl.hidden = !on;
    document.body.classList.toggle('has-touch', on);
  }

  private setGraphics(mode: 'hd' | 'classic'): void {
    if (mode == 'classic') return this.useRenderer(this.classic);
    if (this.hd) return this.useRenderer(this.hd);
    if (!this.hdLoading)
      this.hdLoading = import('../render/hd/hd')
        .then((m) => {
          this.hd = new m.HdRenderer(this.settings);
          return this.hd;
        })
        .catch((e) => {
          console.error('3D renderer failed to load', e);
          this.ui.toast('3D graphics unavailable on this device');
          return null;
        });
    this.hdLoading.then((r) => {
      if (r && this.settings.graphics == 'hd') this.useRenderer(r);
    });
  }

  private useRenderer(r: Renderer): void {
    if (this.active === r) return;
    this.active.deactivate();
    this.active.canvas.remove();
    this.active = r;
    this.stage.appendChild(r.canvas);
    this.stage.dataset.mode = r === this.classic ? 'classic' : 'hd';
    r.activate(this.game);
    this.resize();
  }

  private resize(): void {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.active.resize(this.stage.clientWidth, this.stage.clientHeight, dpr);
  }

  // --- Frame loop ----------------------------------------------------------------

  private frame(now: number, raf = true): void {
    const dt = now - this.last;
    this.last = now;
    this.controls.pollGamepads();
    const events = this.driver.update(dt);
    if (this.driver.skipped) this.audio?.resync(this.game.sound.tune);
    this.handleEvents(events);
    this.syncUi();
    this.active.render({
      game: this.game,
      prev: this.driver.prev,
      alpha: this.driver.alpha,
      dt: dt / 1000,
      time: (now - this.start) / 1000,
      events,
      paused: this.driver.paused,
    });
    if (raf) requestAnimationFrame((t) => this.frame(t));
  }

  private handleEvents(events: SimEvent[]): void {
    for (const e of events) {
      if (e.type == 'gameStart') this.wasInGame = true;
    }
  }

  private syncUi(): void {
    const g = this.game;
    if (g.pendingInitials && this.ui.screen != 'initials') {
      this.ui.show('initials');
      this.ui.setInitialsScore(g.pendingInitials.score, g.pendingInitials.player, g.main.nplayers);
    }
    if (g.scene == 'attract' && this.wasInGame && this.ui.screen == null) {
      this.wasInGame = false;
      this.ui.show('menu');
    }
    this.ui.showSkipHint(g.skippable && this.ui.screen == null && !this.driver.paused);
    const hd = this.active !== this.classic;
    const playing = g.inGame && g.scene != 'initials';
    this.ui.setHudVisible(hd && playing);
    if (hd && playing) {
      const m = g.main;
      this.ui.updateHud({
        score1: g.scores.score1,
        score2: g.scores.score2,
        players: m.nplayers,
        cur: m.curplayer,
        lives: m.gamedat[m.curplayer].lives,
        level: m.gamedat[m.curplayer].level,
      });
    }
  }
}
