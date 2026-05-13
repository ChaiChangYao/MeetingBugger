export interface AudioSample {
  rms: number;
  isSpeaking: boolean;
  pitchHz: number | null;
  timestamp: number;
}

export interface AudioMeterController {
  start: () => Promise<MediaStream | null>;
  stop: () => void;
  setSensitivity: (value: number) => void;
  getStream: () => MediaStream | null;
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

  const estimatePitchHz = (data: Uint8Array, sampleRate: number): number | null => {
    const size = data.length;
    const buffer = new Float32Array(size);
    for (let i = 0; i < size; i += 1) {
      buffer[i] = data[i] / 128 - 1;
    }

    let rms = 0;
    for (let i = 0; i < size; i += 1) {
      rms += buffer[i] * buffer[i];
    }
    rms = Math.sqrt(rms / size);
    if (rms < 0.01) return null;

    const minLag = Math.floor(sampleRate / 400);
    const maxLag = Math.floor(sampleRate / 60);
    let bestLag = -1;
    let bestCorr = 0;

    for (let lag = minLag; lag <= maxLag; lag += 1) {
      let corr = 0;
      for (let i = 0; i < size - lag; i += 1) {
        corr += buffer[i] * buffer[i + lag];
      }
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }

    if (bestLag <= 0) return null;
    const pitch = sampleRate / bestLag;
    if (pitch < 60 || pitch > 400) return null;
    return pitch;
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
          const pitchHz = audioCtx ? estimatePitchHz(data, audioCtx.sampleRate) : null;
          const now = Date.now();
          if (rms > sensitivity) {
            if (!speakingSince) speakingSince = now;
          } else {
            speakingSince = 0;
          }
          const isSpeaking = speakingSince > 0 && now - speakingSince >= 250;
          options.onSample({ rms, isSpeaking, pitchHz, timestamp: now });
        }, 100);
        return stream;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to access microphone.";
        options.onError(message);
        return null;
      }
    },
    stop: teardown,
    setSensitivity: (value) => {
      sensitivity = value;
    },
    getStream: () => {
      return stream;
    }
  };
};
