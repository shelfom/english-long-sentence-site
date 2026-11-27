export type Cue = 'type'|'enter'|'cut'|'round'|'square'|'add'|'swap'|'core'|'translate';

let context: AudioContext | undefined;
let master: GainNode | undefined;
let noise: AudioBuffer | undefined;
let enabled = false;

// Called from the same tap that starts the lesson or unmutes the room.
export function enableCues(on: boolean) {
  enabled = on;
  if (typeof window === 'undefined') return;
  if (on && !context) {
    const Audio = window.AudioContext || (window as typeof window & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
    if (!Audio) return;
    try {
      context = new Audio();
      master = context.createGain();
      master.connect(context.destination);
      noise = context.createBuffer(1, Math.ceil(context.sampleRate * .09), context.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    } catch { return; }
  }
  if (!context || !master) return;
  master.gain.value = on ? .29 : 0;
  if (on && context.state !== 'running') void context.resume().catch(() => {});
}

type Hit = [delay: number, pitch: number, endPitch: number, length: number];
const patterns: Record<Cue, Hit[]> = {
  type: [[0, 710, 270, .019], [.045, 820, 250, .017], [.091, 660, 235, .022]],
  enter: [[0, 580, 225, .029], [.045, 250, 85, .065]],
  cut: [[0, 1460, 420, .05], [.038, 200, 85, .035]],
  round: [[0, 415, 575, .064]],
  square: [[0, 780, 660, .025], [.055, 620, 460, .037]],
  add: [[0, 310, 280, .025], [.042, 425, 370, .027], [.088, 660, 530, .055]],
  swap: [[0, 510, 360, .031], [.061, 750, 530, .045]],
  core: [[0, 261, 264, .11], [.057, 523, 525, .15]],
  translate: [[0, 660, 660, .075], [.069, 880, 880, .13]],
};

export function playCue(cue: Cue) {
  if (!enabled || !context || !master || context.state !== 'running' || document.hidden) return;
  const ctx = context;
  for (const [delay, pitch, endPitch, length] of patterns[cue]) {
    const at = ctx.currentTime + delay;
    const env = ctx.createGain();
    env.gain.setValueAtTime(.001, at);
    env.gain.exponentialRampToValueAtTime(.33, at + .003);
    env.gain.exponentialRampToValueAtTime(.001, at + length);
    env.connect(master);
    const tone = ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(pitch, at);
    tone.frequency.exponentialRampToValueAtTime(endPitch, at + length);
    tone.connect(env);
    tone.start(at);
    tone.stop(at + length);
    tone.onended = () => { tone.disconnect(); env.disconnect(); };
    if (noise && (cue === 'type' || cue === 'enter' || cue === 'cut' || cue === 'add')) {
      const tap = ctx.createBufferSource();
      tap.buffer = noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = cue === 'cut' ? 3700 : 1900;
      tap.connect(filter).connect(env);
      tap.start(at);
      tap.stop(at + Math.min(.08, length));
      tap.onended = () => { tap.disconnect(); filter.disconnect(); };
    }
  }
}
