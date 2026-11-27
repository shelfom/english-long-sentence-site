export type Cue = 'key' | 'type' | 'enter' | 'cut' | 'round' | 'square' | 'add' | 'swap' | 'core' | 'translate';

type Strike = 'light' | 'firm' | 'return';
type Hit = [seconds: number, strike: Strike];
const cues: Record<Cue, Hit[]> = {
  key: [[0, 'light']],
  type: [[0, 'light'], [.043, 'light'], [.095, 'firm']],
  enter: [[0, 'firm'], [.037, 'light'], [.083, 'return']],
  cut: [[0, 'firm'], [.037, 'light'], [.079, 'return']],
  round: [[0, 'light'], [.041, 'light'], [.078, 'firm']],
  square: [[0, 'firm'], [.039, 'light'], [.082, 'firm']],
  add: [[0, 'light'], [.042, 'firm'], [.088, 'light']],
  swap: [[0, 'light'], [.043, 'firm'], [.091, 'light']],
  core: [[0, 'firm'], [.046, 'firm'], [.095, 'return']],
  translate: [[0, 'light'], [.049, 'light'], [.096, 'return']],
};

let context: AudioContext | undefined;
let master: GainNode | undefined;
let samples: Record<Strike, AudioBuffer> | undefined;
let enabled = false;
let firstPending: Cue | undefined;
let resuming: Promise<void> | undefined;
const playing = new Set<AudioBufferSourceNode>();

// Two noise transients model the typebar hitting paper and the key spring returning.
// Broad filters on noise give the key a physical body without generating a pitched note.
function keySample(ctx: AudioContext, strike: Strike) {
  const deep = strike === 'return';
  const decay = deep ? .0095 : strike === 'firm' ? .006 : .0041;
  const release = deep ? .026 : .013;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * (release + decay * 6)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const pole = (hz: number) => 1 - Math.exp(-2 * Math.PI * hz / ctx.sampleRate);
  const bodyCut = pole(deep ? 750 : 1250), tipCut = pole(deep ? 2900 : 4600);
  let low = 0, mid = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / ctx.sampleRate, noise = Math.random() * 2 - 1;
    low += bodyCut * (noise - low);
    mid += tipCut * (noise - mid);
    const attack = Math.min(1, t / .0007) * Math.exp(-t / decay);
    const rebound = t < release ? 0 : .32 * Math.min(1, (t - release) / .0006) * Math.exp(-(t - release) / .0034);
    data[i] = (2.8 * low + 1.5 * (mid - low)) * attack + 1.7 * (noise - mid) * rebound;
  }
  return buffer;
}

// Safari can unlock after React has rendered the first cut. Keep that first action,
// and drop overlapping hits while waiting so a delayed unlock never plays a backlog.
function resume(ctx: AudioContext) {
  if (resuming || ctx.state === 'closed') return;
  resuming = ctx.resume().then(() => {
    const cue = firstPending;
    firstPending = undefined;
    if (cue && ctx.state === 'running') playCue(cue);
  }).catch(() => { firstPending = undefined; }).finally(() => { resuming = undefined; });
}

export function enableCues(on: boolean) {
  enabled = on;
  if (!on) {
    firstPending = undefined;
    if (master) master.gain.value = 0;
    for (const node of playing) node.stop();
    playing.clear();
    return;
  }
  if (typeof window === 'undefined') return;
  if (!context) {
    const Audio = window.AudioContext || (window as typeof window & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
    if (!Audio) return;
    try {
      context = new Audio();
      master = context.createGain();
      master.connect(context.destination);
      samples = {light: keySample(context, 'light'), firm: keySample(context, 'firm'), return: keySample(context, 'return')};
    } catch { return; }
  }
  if (master) master.gain.value = .23;
  if (context.state !== 'running') resume(context);
}

export function playCue(cue: Cue) {
  if (!enabled || !context || !master || !samples || document.hidden) return;
  const ctx = context;
  if (ctx.state !== 'running') {
    firstPending ??= cue;
    resume(ctx);
    return;
  }
  const now = ctx.currentTime;
  for (const [delay, strike] of cues[cue]) {
    const key = ctx.createBufferSource();
    key.buffer = samples[strike];
    key.playbackRate.value = .95 + Math.random() * .1;
    key.connect(master);
    playing.add(key);
    key.onended = () => { key.disconnect(); playing.delete(key); };
    key.start(now + delay);
  }
}
