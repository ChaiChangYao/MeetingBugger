import { ViolationType } from "./types";

export interface DetectorConfig {
  speakingThreshold: number;
  silenceMs: number;
  dominatingMs: number;
  dominatingCooldownMs: number;
  tooSoftMs: number;
  tooSoftRmsThreshold: number;
  gibberishMs: number;
  strongAudioThreshold: number;
  sparseWordsThreshold: number;
}

export interface DetectorFrame {
  now: number;
  activeSpeakerId: string | null;
  isSpeakerClaiming: boolean;
  rms: number;
  transcriptText: string;
}

export interface DetectorViolation {
  type: ViolationType;
  speakerId: string | null;
  reason: string;
}

interface SpeakerWindow {
  speakStartMs: number;
  lastVoiceMs: number;
  assignedStartMs: number;
}

const defaults: DetectorConfig = {
  speakingThreshold: 0.04,
  silenceMs: 1250,
  dominatingMs: 10_000,
  dominatingCooldownMs: 12_000,
  tooSoftMs: 4000,
  tooSoftRmsThreshold: 0.02,
  gibberishMs: 5000,
  strongAudioThreshold: 0.08,
  sparseWordsThreshold: 3
};

const countWords = (text: string): number =>
  text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

export const hasGibberishPattern = (text: string): boolean => {
  const normalized = text.toLowerCase().trim();
  if (!normalized) return false;
  if (/(blah\s+){2,}blah/.test(normalized)) return true;
  if (/\b(asdf|qwer|zxcv)\b/.test(normalized)) return true;
  if (/\b(\w{1,3})\1{3,}\b/.test(normalized)) return true;
  if (/(\b\w+\b)(\s+\1){3,}/.test(normalized)) return true;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length < 4) return false;
  const meaningful = tokens.filter((token) => /[aeiou]/.test(token) && token.length > 2).length;
  const ratio = meaningful / tokens.length;
  return ratio < 0.35;
};

export class ViolationDetector {
  private config: DetectorConfig;
  private windows = new Map<string, SpeakerWindow>();
  private cooldowns = new Map<string, number>();
  private lastActiveSpeakerId: string | null = null;

  constructor(config: Partial<DetectorConfig> = {}) {
    this.config = { ...defaults, ...config };
  }

  private canTrigger(type: ViolationType, speakerId: string | null, now: number): boolean {
    const key = `${type}:${speakerId ?? "mystery"}`;
    const expiry = this.cooldowns.get(key) ?? 0;
    if (expiry > now) return false;
    this.cooldowns.set(key, now + this.config.dominatingCooldownMs);
    return true;
  }

  private getWindow(speakerId: string, now: number): SpeakerWindow {
    const existing = this.windows.get(speakerId);
    if (existing) return existing;
    const created: SpeakerWindow = {
      speakStartMs: now,
      lastVoiceMs: now,
      assignedStartMs: now
    };
    this.windows.set(speakerId, created);
    return created;
  }

  private resetWindow(speakerId: string, now: number): void {
    this.windows.set(speakerId, {
      speakStartMs: now,
      lastVoiceMs: now,
      assignedStartMs: now
    });
  }

  onActiveSpeakerChanged(nextSpeakerId: string | null, now: number): void {
    if (nextSpeakerId !== this.lastActiveSpeakerId) {
      if (nextSpeakerId) {
        this.resetWindow(nextSpeakerId, now);
      }
      this.lastActiveSpeakerId = nextSpeakerId;
    }
  }

  resetCurrentYap(speakerId: string | null, now: number): void {
    if (!speakerId) return;
    this.resetWindow(speakerId, now);
  }

  evaluate(frame: DetectorFrame): DetectorViolation | null {
    const { now, activeSpeakerId, rms, transcriptText, isSpeakerClaiming } = frame;
    this.onActiveSpeakerChanged(activeSpeakerId, now);
    const isSpeaking = rms >= this.config.speakingThreshold;
    const words = countWords(transcriptText);
    const sparseTranscript = words < this.config.sparseWordsThreshold;

    if (!activeSpeakerId) {
      if (rms >= this.config.strongAudioThreshold && sparseTranscript && this.canTrigger("illegible", null, now)) {
        return { type: "illegible", speakerId: null, reason: "Mystery Yapper with unreadable speech." };
      }
      return null;
    }

    const window = this.getWindow(activeSpeakerId, now);
    if (!window.assignedStartMs) {
      window.assignedStartMs = now;
    }

    if (isSpeaking) {
      if (now - window.lastVoiceMs > this.config.silenceMs) {
        window.speakStartMs = now;
      }
      window.lastVoiceMs = now;
    } else if (now - window.lastVoiceMs > this.config.silenceMs) {
      window.speakStartMs = now;
    }

    const continuousTalkMs = Math.max(0, now - window.speakStartMs);
    const assignedDurationMs = Math.max(0, now - window.assignedStartMs);

    if (
      isSpeaking &&
      continuousTalkMs >= this.config.dominatingMs &&
      this.canTrigger("dominating", activeSpeakerId, now)
    ) {
      return {
        type: "dominating",
        speakerId: activeSpeakerId,
        reason: `${(continuousTalkMs / 1000).toFixed(1)}s nonstop yap`
      };
    }

    if (
      (isSpeakerClaiming || activeSpeakerId !== null) &&
      assignedDurationMs >= this.config.tooSoftMs &&
      rms <= this.config.tooSoftRmsThreshold &&
      sparseTranscript &&
      this.canTrigger("too_soft", activeSpeakerId, now)
    ) {
      return {
        type: "too_soft",
        speakerId: activeSpeakerId,
        reason: "audio too soft"
      };
    }

    if (
      rms >= this.config.strongAudioThreshold &&
      assignedDurationMs >= this.config.gibberishMs &&
      (sparseTranscript || hasGibberishPattern(transcriptText)) &&
      this.canTrigger("illegible", activeSpeakerId, now)
    ) {
      return {
        type: "illegible",
        speakerId: activeSpeakerId,
        reason: "illegible yap detected"
      };
    }

    return null;
  }

  getYapProgressMs(speakerId: string | null, now: number): number {
    if (!speakerId) return 0;
    const window = this.windows.get(speakerId);
    if (!window) return 0;
    return Math.max(0, now - window.speakStartMs);
  }
}

export const defaultDetectorConfig = defaults;
