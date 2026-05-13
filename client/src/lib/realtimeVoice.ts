import { getRandomBouncerLine } from "./bouncerLines";
import { ViolationType } from "./types";

interface RealtimeTokenResponse {
  client_secret: string | null;
  session_id: string | null;
  model: string;
}

interface VoiceOptions {
  onStatus: (status: string) => void;
  onTranscript: (text: string, lowConfidence: boolean) => void;
  muted: boolean;
  onAutoSpeakerHint?: (hint: string) => void;
  onSpeechActivity?: (isSpeaking: boolean) => void;
}

export class RealtimeVoiceController {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private fallbackMode = false;
  private options: VoiceOptions;
  private connected = false;

  constructor(options: VoiceOptions) {
    this.options = options;
  }

  setMuted(muted: boolean): void {
    this.options.muted = muted;
  }

  private async fetchToken(): Promise<RealtimeTokenResponse> {
    const response = await fetch("/api/realtime-token");
    if (!response.ok) {
      throw new Error("Realtime token unavailable");
    }
    return (await response.json()) as RealtimeTokenResponse;
  }

  async connect(micStream?: MediaStream): Promise<void> {
    try {
      if (this.connected) {
        this.options.onStatus("Realtime voice connected");
        return;
      }
      const token = await this.fetchToken();
      if (!token.client_secret) {
        throw new Error("Missing client secret");
      }

      // Ephemeral token flow:
      // 1) Browser asks our backend for a short-lived client secret.
      // 2) Backend uses OPENAI_API_KEY server-side to mint that secret.
      // 3) Browser only ever sees this temporary secret, never the real API key.
      this.peerConnection = new RTCPeerConnection();
      this.audioEl = document.createElement("audio");
      this.audioEl.autoplay = true;
      this.peerConnection.ontrack = (event) => {
        if (!this.audioEl) return;
        this.audioEl.srcObject = event.streams[0];
      };

      if (micStream) {
        for (const track of micStream.getAudioTracks()) {
          this.peerConnection.addTrack(track, micStream);
        }
      }

      this.dataChannel = this.peerConnection.createDataChannel("oai-events");
      this.dataChannel.onopen = () => {
        this.dataChannel?.send(
          JSON.stringify({
            type: "session.update",
            session: {
              modalities: ["audio", "text"],
              input_audio_transcription: { model: "gpt-realtime-whisper" },
              turn_detection: {
                type: "server_vad",
                threshold: 0.55,
                silence_duration_ms: 700
              }
            }
          })
        );
      };
      this.dataChannel.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as Record<string, unknown>;
          const type = String(payload.type ?? "");
          if (type === "input_audio_buffer.speech_started") {
            this.options.onSpeechActivity?.(true);
          }
          if (type === "input_audio_buffer.speech_stopped") {
            this.options.onSpeechActivity?.(false);
          }
          if (type === "response.audio_transcript.delta" || type === "response.audio_transcript.done") {
            const text = String(payload.delta ?? payload.transcript ?? "");
            if (text) {
              this.options.onSpeechActivity?.(true);
              this.options.onTranscript(text, false);
            }
          }
          if (type === "conversation.item.input_audio_transcription.completed") {
            const text = String(payload.transcript ?? "");
            if (text) {
              this.options.onSpeechActivity?.(true);
              this.options.onTranscript(text, false);
            }
          }
          if (type === "response.text.delta" && typeof payload.delta === "string" && payload.delta.includes("speaker")) {
            this.options.onAutoSpeakerHint?.(payload.delta);
          }
        } catch {
          // Ignore malformed data channel payloads.
        }
      };

      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true
      });
      await this.peerConnection.setLocalDescription(offer);

      // WebRTC SDP exchange against OpenAI Realtime endpoint.
      // If this handshake fails, the app gracefully falls back to speechSynthesis.
      const response = await fetch("https://api.openai.com/v1/realtime?model=gpt-realtime-2", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.client_secret}`,
          "Content-Type": "application/sdp"
        },
        body: offer.sdp ?? ""
      });
      if (!response.ok) {
        throw new Error("Realtime SDP handshake failed");
      }
      const answerSdp = await response.text();
      await this.peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });
      this.connected = true;
      this.options.onStatus("Realtime voice connected");
    } catch {
      this.fallbackMode = true;
      this.options.onStatus("Voice fallback mode");
    }
  }

  sayViolation(violationType: ViolationType): void {
    if (this.options.muted) {
      return;
    }
    const line = getRandomBouncerLine(violationType);
    if (this.fallbackMode || !this.dataChannel || this.dataChannel.readyState !== "open") {
      const utterance = new SpeechSynthesisUtterance(line);
      utterance.rate = 1.08;
      utterance.pitch = 1.05;
      speechSynthesis.speak(utterance);
      return;
    }

    this.dataChannel.send(
      JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          instructions: `Say exactly one playful roast line (max 12 words): "${line}"`,
          max_output_tokens: 40
        }
      })
    );
  }

  disconnect(): void {
    this.dataChannel?.close();
    this.peerConnection?.close();
    this.peerConnection = null;
    this.dataChannel = null;
    this.audioEl = null;
    this.connected = false;
  }
}
