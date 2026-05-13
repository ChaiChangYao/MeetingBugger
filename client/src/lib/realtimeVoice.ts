import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
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
  private session: RealtimeSession | null = null;
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
      let detail = `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as { error?: string };
        if (body?.error) {
          detail = body.error;
        }
      } catch {
        // Ignore parse failures and use status fallback.
      }
      throw new Error(`Realtime token unavailable: ${detail}`);
    }
    return (await response.json()) as RealtimeTokenResponse;
  }

  private wireLegacyDataChannel(channel: RTCDataChannel): void {
    channel.onmessage = (event) => {
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
      } catch {
        // Ignore malformed data channel payloads.
      }
    };
  }

  private async connectViaLegacyWebRtc(token: RealtimeTokenResponse, micStream?: MediaStream): Promise<void> {
    const peerConnection = new RTCPeerConnection();
    this.peerConnection = peerConnection;
    this.audioEl = document.createElement("audio");
    this.audioEl.autoplay = true;
    peerConnection.ontrack = (event) => {
      if (!this.audioEl) return;
      this.audioEl.srcObject = event.streams[0];
    };

    if (micStream) {
      for (const track of micStream.getAudioTracks()) {
        peerConnection.addTrack(track, micStream);
      }
    }

    this.dataChannel = peerConnection.createDataChannel("oai-events");
    this.wireLegacyDataChannel(this.dataChannel);

    const model = token.model || "gpt-realtime";
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true
    });
    await peerConnection.setLocalDescription(offer);

    const response = await fetch(`https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.client_secret}`,
        "Content-Type": "application/sdp"
      },
      body: offer.sdp ?? ""
    });

    const answerBody = await response.text();
    if (!response.ok) {
      throw new Error(`Legacy realtime SDP handshake failed: ${answerBody}`);
    }
    // Guard against race with disconnect() while awaiting network response.
    if (this.peerConnection !== peerConnection) {
      throw new Error("Legacy realtime connect cancelled");
    }
    await peerConnection.setRemoteDescription({ type: "answer", sdp: answerBody });
    this.connected = true;
    this.options.onStatus(`Realtime voice connected (${model}, legacy transport)`);
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

      const agent = new RealtimeAgent({
        name: "Meeting Bouncer Voice",
        instructions:
          "You are Meeting Bouncer, a comedic game-show referee. Only speak when asked to roast a violation. Return exactly one short line with at most 12 words. No hate, slurs, protected-class insults, sexual content, or harassment."
      });

      this.session = new RealtimeSession(agent, {
        model: token.model || "gpt-realtime"
      });

      this.session.on("transport_event", (event: unknown) => {
        const payload = event as Record<string, unknown>;
        const type = String(payload?.type ?? "");

        if (type === "input_audio_buffer.speech_started" || type === "audio_start") {
          this.options.onSpeechActivity?.(true);
        }
        if (type === "input_audio_buffer.speech_stopped" || type === "audio_stopped") {
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
      });

      if (micStream && micStream.getAudioTracks().length > 0) {
        // SDK-managed WebRTC captures mic internally.
        // We still pass through host mic stream in app for local meter/state.
      }

      try {
        await this.session.connect({
          apiKey: token.client_secret
        });
        this.connected = true;
        this.options.onStatus(`Realtime voice connected (${token.model || "gpt-realtime"})`);
      } catch (sdkError) {
        const sdkReason = sdkError instanceof Error ? sdkError.message : "Unknown SDK realtime failure";
        this.session?.close();
        this.session = null;
        this.options.onStatus(`SDK realtime failed, retrying legacy transport: ${sdkReason}`);
        await this.connectViaLegacyWebRtc(token, micStream);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown realtime failure";
      this.fallbackMode = true;
      this.options.onStatus(`Voice fallback mode: ${reason}`);
    }
  }

  sayViolation(violationType: ViolationType): void {
    if (this.options.muted) {
      return;
    }
    const line = getRandomBouncerLine(violationType);
    if (this.fallbackMode || !this.session) {
      if (!this.fallbackMode && this.dataChannel && this.dataChannel.readyState === "open") {
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
        return;
      }
      const utterance = new SpeechSynthesisUtterance(line);
      utterance.rate = 1.08;
      utterance.pitch = 1.05;
      speechSynthesis.speak(utterance);
      return;
    }
    this.session.sendMessage(`Say exactly one playful roast line (max 12 words): "${line}"`);
  }

  disconnect(): void {
    this.session?.close();
    this.session = null;
    this.dataChannel?.close();
    this.peerConnection?.close();
    this.peerConnection = null;
    this.dataChannel = null;
    this.audioEl = null;
    this.connected = false;
  }
}
