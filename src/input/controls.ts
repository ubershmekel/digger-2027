// Keyboard, gamepad and touch input. Game keys go to the sim's Input latch;
// everything else becomes a UI action.
import type { Key } from '../sim/input';

export type UiAction = 'pause' | 'skip' | 'toggleGraphics' | 'toggleSound' | 'mute' | 'confirm' | 'back';

export interface ControlsTarget {
  press(k: Key): void;
  release(k: Key): void;
  action(a: UiAction): void;
  /** When true (a menu is open), game keys are not forwarded to the sim. */
  readonly menuOpen: boolean;
}

const KEYMAP: Record<string, Key> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyA: 'left',
  KeyD: 'right',
  KeyW: 'up',
  KeyS: 'down',
  Numpad4: 'left',
  Numpad6: 'right',
  Numpad8: 'up',
  Numpad2: 'down',
  Space: 'fire',
  F1: 'fire',
  ControlLeft: 'fire',
  ControlRight: 'fire',
  KeyJ: 'fire',
  KeyZ: 'fire',
};

export class Controls {
  private held = new Set<Key>();
  private padPrev: boolean[] = [];
  private padDirs = new Set<Key>();

  constructor(private readonly t: ControlsTarget) {
    addEventListener('keydown', (e) => this.keydown(e), { capture: true });
    addEventListener('keyup', (e) => this.keyup(e), { capture: true });
    addEventListener('blur', () => this.releaseAll());
  }

  private keydown(e: KeyboardEvent): void {
    // Typing into a text field (initials) is never a game or shortcut key.
    if (e.target instanceof HTMLInputElement && e.target.type != 'range') return;
    const k = KEYMAP[e.code];
    if (e.code == 'F2' || e.code == 'F3') {
      e.preventDefault();
      if (!e.repeat) this.t.action(e.code == 'F2' ? 'toggleGraphics' : 'toggleSound');
      return;
    }
    if (e.code == 'Escape' || e.code == 'KeyP' || e.code == 'Pause') {
      if (!e.repeat) this.t.action(e.code == 'Escape' && this.t.menuOpen ? 'back' : 'pause');
      e.preventDefault();
      return;
    }
    if (this.t.menuOpen) return; // menus handle their own keys
    if (e.code == 'KeyM') {
      if (!e.repeat) this.t.action('mute');
      return;
    }
    // Only Fire (or Enter) counts toward skipping a cut-scene, so steering never skips by accident.
    if (!e.repeat && (k == 'fire' || e.code == 'Enter')) this.t.action('skip');
    if (k) {
      e.preventDefault();
      if (!this.held.has(k)) {
        this.held.add(k);
        this.t.press(k);
      }
    }
  }

  private keyup(e: KeyboardEvent): void {
    const k = KEYMAP[e.code];
    if (k && this.held.has(k)) {
      this.held.delete(k);
      this.t.release(k);
      e.preventDefault();
    }
  }

  releaseAll(): void {
    for (const k of this.held) this.t.release(k);
    this.held.clear();
    for (const k of this.padDirs) this.t.release(k);
    this.padDirs.clear();
  }

  /** Call once per frame. */
  pollGamepads(): void {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = Array.from(pads).find((p) => p && p.connected);
    if (!pad) return;
    const b = (i: number) => !!pad.buttons[i]?.pressed;
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    const want = new Set<Key>();
    // Pick the dominant axis so diagonals don't flicker between directions.
    if (b(14) || ax < -0.5) want.add('left');
    else if (b(15) || ax > 0.5) want.add('right');
    if (b(12) || ay < -0.5) want.add('up');
    else if (b(13) || ay > 0.5) want.add('down');
    if (b(0) || b(1) || b(2) || b(3) || b(7)) want.add('fire');
    const pressedNow = pad.buttons.map((x) => x.pressed);
    const edge = (i: number) => pressedNow[i] && !this.padPrev[i];
    if (edge(9)) this.t.action('pause');
    if (this.t.menuOpen) {
      if (edge(0)) this.t.action('confirm');
      if (edge(1)) this.t.action('back');
    } else {
      if ([0, 1, 2, 3, 7].some(edge)) this.t.action('skip');
      for (const k of want)
        if (!this.padDirs.has(k)) {
          this.padDirs.add(k);
          this.t.press(k);
        }
    }
    for (const k of [...this.padDirs])
      if (!want.has(k) || this.t.menuOpen) {
        this.padDirs.delete(k);
        this.t.release(k);
      }
    this.padPrev = pressedNow;
  }

  /** Builds the on-screen controls for touch devices. */
  mountTouch(root: HTMLElement): HTMLElement {
    const el = document.createElement('div');
    el.className = 'touch';
    el.innerHTML = `
      <div class="dpad">
        <button data-k="up" aria-label="Up">▲</button>
        <button data-k="left" aria-label="Left">◀</button>
        <button data-k="right" aria-label="Right">▶</button>
        <button data-k="down" aria-label="Down">▼</button>
      </div>
      <button class="fire" data-k="fire" aria-label="Fire">FIRE</button>
      <button class="tpause" aria-label="Pause">❚❚</button>`;
    root.appendChild(el);
    const active = new Map<number, Key>();
    const set = (id: number, k: Key | null) => {
      const old = active.get(id);
      if (old == k) return;
      if (old) {
        active.delete(id);
        if (![...active.values()].includes(old)) this.t.release(old);
      }
      if (k) {
        if (![...active.values()].includes(k)) {
          if (k == 'fire') this.t.action('skip');
          this.t.press(k);
        }
        active.set(id, k);
      }
    };
    const keyAt = (x: number, y: number): Key | null => {
      const b = document.elementFromPoint(x, y) as HTMLElement | null;
      const k = b?.closest<HTMLElement>('[data-k]')?.dataset.k;
      return (k as Key) ?? null;
    };
    el.addEventListener('pointerdown', (e) => {
      const tgt = e.target as HTMLElement;
      if (tgt.closest('.tpause')) {
        this.t.action('pause');
        return;
      }
      e.preventDefault();
      set(e.pointerId, keyAt(e.clientX, e.clientY));
    });
    el.addEventListener('pointermove', (e) => {
      if (active.has(e.pointerId) && active.get(e.pointerId) != 'fire') set(e.pointerId, keyAt(e.clientX, e.clientY));
    });
    const end = (e: PointerEvent) => set(e.pointerId, null);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    return el;
  }
}
