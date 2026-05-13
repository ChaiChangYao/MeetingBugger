export type SoundMode = "airhorn" | "gameshow_fail" | "vine_boom" | "random";

export interface SoundController {
  play: (mode: SoundMode) => void;
}

const createContext = (): AudioContext | null => {
  const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  return new Ctx();
};

const withContext = (fn: (ctx: AudioContext) => void): void => {
  const context = createContext();
  if (!context) return;
  void context.resume().then(() => fn(context));
};

const playAirhorn = (ctx: AudioContext): void => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(180, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(520, ctx.currentTime + 0.18);
  gain.gain.setValueAtTime(0.001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.7, ctx.currentTime + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.75);
};

const playGameShowFail = (ctx: AudioContext): void => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(440, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(240, ctx.currentTime + 0.35);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.52);
};

const playVineBoomish = (ctx: AudioContext): void => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(90, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(42, ctx.currentTime + 0.35);
  gain.gain.setValueAtTime(0.8, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.65);
};

export const createSoundController = (): SoundController => ({
  play: (mode) =>
    withContext((ctx) => {
      const selected =
        mode === "random"
          ? (["airhorn", "gameshow_fail", "vine_boom"][
              Math.floor(Math.random() * 3)
            ] as Exclude<SoundMode, "random">)
          : mode;

      if (selected === "airhorn") playAirhorn(ctx);
      if (selected === "gameshow_fail") playGameShowFail(ctx);
      if (selected === "vine_boom") playVineBoomish(ctx);
    })
});
