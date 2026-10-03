import type { AudioBackend, AudioEngine } from '../engine';

export async function createJazz(_engine: AudioEngine): Promise<AudioBackend> {
  throw new Error('not implemented yet');
}
