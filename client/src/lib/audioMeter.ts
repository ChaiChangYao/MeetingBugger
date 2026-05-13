export interface AudioSample {
  rms: number;
  isSpeaking: boolean;
  timestamp: number;
}

export interface AudioMeterController {
  start: () => Promise<void>;
  stop: () => void;
  setSensitivity: (value: number) => void;
}

interface Options {
  speakingThreshold: number;
  onSample: (sample: AudioSample) => void;
  onError: (message: string) => void;
}

export const createAudioMeter = (options: Options): AudioMeterController => {
  let stream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let timer: number | null = null;
  let sensitivity = options.speakingThreshold;
  let speakingSince = 0;

  const teardown = (): void => {
    if (timer) window.clearInterval(timer);
    timer = null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    stream = null;
    if (audioCtx) {
      void audioCtx.close();
    }
    audioCtx = null;
    analyser = null;
  };

  const computeRms = (data: Uint8Array): number => {
    let sum = 0;
    for (const value of data) {
      const normalized = value / 128 - 1;
      sum += normalized * normalized;
    }
    return Math.sqrt(sum / data.length);
  };

  return {
    start: async () => {
      teardown();
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: true
          }
        });
        audioCtx = new AudioContext();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        timer = window.setInterval(() => {
          if (!analyser) return;
          analyser.getByteTimeDomainData(data);
          const rms = computeRms(data);
          const now = Date.now();
          if (rms > sensitivity) {
            if (!speakingSince) speakingSince = now;
          } else {
            speakingSince = 0;
          }
          const isSpeaking = speakingSince > 0 && now - speakingSince >= 250;
          options.onSample({ rms, isSpeaking, timestamp: now });
        }, 100);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to access microphone.";
        options.onError(message);
      }
    },
    stop: teardown,
    setSensitivity: (value) => {
      sensitivity = value;
    }
  };
};
