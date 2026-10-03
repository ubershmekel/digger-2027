// Audio mixing: one AudioContext, master/music/sfx buses, and two swappable
// backends that both consume the sim's sound commands.
import type { SoundCmd } from '../sim/sound';
import speakerUrl from './classic/speaker.worklet.ts?worker&url';

export interface AudioBackend {
  command(cmd: SoundCmd, arg: number): void;
  /** Bring music back in line with the sim after a mode switch or a skip (-1 = silence). */
  resync(tune: number): void;
  setPaused(paused: boolean): void;
  /** Stop everything immediately (used when switching away from this backend). */
  silence(): void;
}

export class AudioEngine {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly music: GainNode;
  readonly sfx: GainNode;
  private backends: Partial<Record<'hd' | 'classic', AudioBackend>> = {};
  private mode: 'hd' | 'classic' = 'hd';
  private ready: Promise<void>;
  private hdFactory: ((engine: AudioEngine) => Promise<AudioBackend>) | null = null;
  private paused = false;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.music = this.ctx.createGain();
    this.sfx = this.ctx.createGain();
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.ready = this.initClassic();
  }

  private async initClassic(): Promise<void> {
    try {
      await this.ctx.audioWorklet.addModule(speakerUrl);
      this.backends.classic = new ClassicAudio(this);
    } catch (e) {
      console.warn('Classic audio unavailable', e);
    }
  }

  /** Registers the HD backend loader; it is created lazily the first time it is needed. */
  setHdFactory(f: (engine: AudioEngine) => Promise<AudioBackend>): void {
    this.hdFactory = f;
  }

  /** Resumes the context unless the game deliberately paused it. */
  async unlock(): Promise<void> {
    if (!this.paused && this.ctx.state != 'running') await this.ctx.resume().catch(() => {});
  }

  setVolumes(master: number, music: number, sfx: number, muted: boolean): void {
    const t = this.ctx.currentTime;
    // Perceptual curve: squaring the slider value feels linear to the ear.
    this.master.gain.setTargetAtTime(muted ? 0 : master * master, t, 0.02);
    this.music.gain.setTargetAtTime(music * music, t, 0.02);
    this.sfx.gain.setTargetAtTime(sfx * sfx, t, 0.02);
  }

  async setMode(mode: 'hd' | 'classic', tune: number): Promise<void> {
    await this.ready;
    if (mode == 'hd' && !this.backends.hd && this.hdFactory) {
      const f = this.hdFactory;
      this.hdFactory = null;
      try {
        this.backends.hd = await f(this);
      } catch (e) {
        console.warn('HD audio unavailable, using classic', e);
      }
    }
    const prev = this.backends[this.mode];
    this.mode = mode;
    const next = this.backends[mode];
    if (prev && prev !== next) prev.silence();
    next?.resync(tune);
  }

  private get active(): AudioBackend | undefined {
    return this.backends[this.mode] ?? this.backends.classic;
  }

  command(cmd: SoundCmd, arg: number): void {
    this.active?.command(cmd, arg);
  }

  resync(tune: number): void {
    this.active?.resync(tune);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    for (const b of Object.values(this.backends)) b?.setPaused(paused);
    // Freezing the whole context pauses music and effects mid-note, sample-accurately.
    if (paused) void this.ctx.suspend().catch(() => {});
    else void this.ctx.resume().catch(() => {});
  }
}

/** The original PC-speaker sound, emulated in an AudioWorklet. */
class ClassicAudio implements AudioBackend {
  private node: AudioWorkletNode;

  constructor(engine: AudioEngine) {
    const ctx = engine.ctx;
    this.node = new AudioWorkletNode(ctx, 'digger-speaker', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    const split = ctx.createChannelSplitter(2);
    this.node.connect(split);
    split.connect(engine.music, 0);
    split.connect(engine.sfx, 1);
  }

  command(cmd: SoundCmd, arg: number): void {
    this.node.port.postMessage({ cmd, arg });
  }

  resync(tune: number): void {
    this.command('soundstop', 0);
    if (tune >= 0) this.command('music', tune);
  }

  setPaused(paused: boolean): void {
    this.node.port.postMessage({ cmd: 'pause', arg: paused ? 1 : 0 });
  }

  silence(): void {
    this.command('soundstop', 0);
  }
}
