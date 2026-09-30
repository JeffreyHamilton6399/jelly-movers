export type DeviceKind = 'keyboard1' | 'keyboard2' | 'gamepad';

export interface Slot {
  index: number;
  device: DeviceKind | null;
  padIndex: number;
  joined: boolean;
}

export interface PlayerInput {
  moveX: number;
  jumpQueued: boolean;
  grabPressed: boolean;
}

const P1_KEYS = ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space', 'KeyE'];
const P2_KEYS = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Enter',
  'ShiftLeft',
  'ShiftRight',
];
const PREVENT_DEFAULT = new Set([...P1_KEYS, ...P2_KEYS, 'F1']);

export function deviceLabel(d: DeviceKind | null, padIndex: number): string | null {
  if (d === 'keyboard1') return 'WASD + Space + E';
  if (d === 'keyboard2') return 'Arrows + Enter + Shift';
  if (d === 'gamepad') return `Gamepad ${padIndex + 1}`;
  return null;
}

/**
 * Up to 4 local players. Slots 1/2 join via their keyboard keys,
 * any gamepad claims the lowest free slot when a button is pressed.
 */
export class InputManager {
  slots: Slot[] = [0, 1, 2, 3].map((i) => ({
    index: i,
    device: null,
    padIndex: -1,
    joined: false,
  }));
  /** filled during poll(), readable for the rest of the frame */
  frameEdges = new Set<string>();
  startRequested = false;
  onSlotChange?: () => void;
  onAnyInput?: () => void;

  private keys = new Set<string>();
  private edgeCodes: string[] = [];
  private padPrev = new Map<number, boolean[]>();
  private attached = false;

  private onKeyDown = (e: KeyboardEvent) => {
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    this.edgeCodes.push(e.code);
    this.onAnyInput?.();
    this.tryKeyboardJoin(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
  };

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.keys.clear();
    this.edgeCodes.length = 0;
  }

  resetSlots(): void {
    for (const s of this.slots) {
      s.device = null;
      s.padIndex = -1;
      s.joined = false;
    }
  }

  get joinedCount(): number {
    let n = 0;
    for (const s of this.slots) if (s.joined) n++;
    return n;
  }

  hasEdge(code: string): boolean {
    return this.frameEdges.has(code);
  }

  private tryKeyboardJoin(code: string): void {
    if (P1_KEYS.includes(code)) {
      const s = this.slots[0];
      if (!s.joined) {
        s.joined = true;
        s.device = 'keyboard1';
        s.padIndex = -1;
        this.onSlotChange?.();
      }
    } else if (P2_KEYS.includes(code)) {
      const s = this.slots[1];
      if (!s.joined) {
        s.joined = true;
        s.device = 'keyboard2';
        s.padIndex = -1;
        this.onSlotChange?.();
      }
    }
  }

  /** call once per frame before physics; returns inputs aligned to slot index */
  poll(): (PlayerInput | null)[] {
    this.frameEdges = new Set(this.edgeCodes);
    this.startRequested = false;
    const inputs: (PlayerInput | null)[] = [null, null, null, null];

    // ---- gamepads: join detection + edge tracking ----
    const pads =
      typeof navigator !== 'undefined' && navigator.getGamepads
        ? navigator.getGamepads()
        : [];
    for (const pad of pads) {
      if (!pad) continue;
      const idx = pad.index;
      const prev = this.padPrev.get(idx) ?? new Array<boolean>(pad.buttons.length).fill(false);
      let anyEdge = false;
      let startEdge = false;
      let jumpEdge = false;
      let grabEdge = false;
      for (let b = 0; b < pad.buttons.length; b++) {
        const pressed = pad.buttons[b]?.pressed ?? false;
        if (pressed && !prev[b]) {
          anyEdge = true;
          if (b === 9) startEdge = true;
          if (b === 0) jumpEdge = true;
          if (b === 1 || b === 2) grabEdge = true;
        }
        prev[b] = pressed;
      }
      this.padPrev.set(idx, prev);
      this.onAnyInput?.();
      if (!anyEdge) continue;

      const claimed = this.slots.some((s) => s.joined && s.device === 'gamepad' && s.padIndex === idx);
      if (!claimed) {
        const free = this.slots.find((s) => !s.joined);
        if (free) {
          free.joined = true;
          free.device = 'gamepad';
          free.padIndex = idx;
          this.onSlotChange?.();
        }
      }
      if (startEdge) this.startRequested = true;
      // stash pad edges for the slot that owns this pad
      const owner = this.slots.find((s) => s.joined && s.device === 'gamepad' && s.padIndex === idx);
      if (owner) {
        (pad as Gamepad & { _jmJump?: boolean; _jmGrab?: boolean })._jmJump = jumpEdge;
        (pad as Gamepad & { _jmJump?: boolean; _jmGrab?: boolean })._jmGrab = grabEdge;
      }
    }

    // ---- build inputs per slot ----
    for (const s of this.slots) {
      if (!s.joined) continue;
      const input: PlayerInput = { moveX: 0, jumpQueued: false, grabPressed: false };
      if (s.device === 'keyboard1') {
        let mx = 0;
        if (this.keys.has('KeyA')) mx -= 1;
        if (this.keys.has('KeyD')) mx += 1;
        input.moveX = mx;
        input.jumpQueued = this.frameEdges.has('Space') || this.frameEdges.has('KeyW');
        input.grabPressed = this.frameEdges.has('KeyE');
      } else if (s.device === 'keyboard2') {
        let mx = 0;
        if (this.keys.has('ArrowLeft')) mx -= 1;
        if (this.keys.has('ArrowRight')) mx += 1;
        input.moveX = mx;
        input.jumpQueued = this.frameEdges.has('Enter') || this.frameEdges.has('ArrowUp');
        input.grabPressed =
          this.frameEdges.has('ShiftLeft') || this.frameEdges.has('ShiftRight');
      } else if (s.device === 'gamepad') {
        const pad = pads[s.padIndex];
        if (pad) {
          const ax = pad.axes[0] ?? 0;
          let mx = Math.abs(ax) > 0.35 ? Math.sign(ax) : 0;
          if (pad.buttons[14]?.pressed) mx = -1;
          if (pad.buttons[15]?.pressed) mx = 1;
          input.moveX = mx;
          const stash = pad as Gamepad & { _jmJump?: boolean; _jmGrab?: boolean };
          input.jumpQueued = stash._jmJump ?? false;
          input.grabPressed = stash._jmGrab ?? false;
          stash._jmJump = false;
          stash._jmGrab = false;
        }
      }
      inputs[s.index] = input;
    }

    this.edgeCodes.length = 0;
    return inputs;
  }
}
