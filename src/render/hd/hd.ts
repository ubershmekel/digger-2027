// Temporary stand-in until the 3D renderer lands.
import { ClassicRenderer } from '../classic/classic';
import type { Settings } from '../../storage/storage';

export class HdRenderer extends ClassicRenderer {
  constructor(_s: Settings) {
    super();
  }
}
