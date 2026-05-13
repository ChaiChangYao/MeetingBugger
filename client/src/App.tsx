import { useEffect, useMemo, useRef, useState } from "react";
import AvatarCard from "./components/AvatarCard";
import JoinForm from "./components/JoinForm";
import Leaderboard from "./components/Leaderboard";
import OnboardingCard from "./components/OnboardingCard";
import VerdictPopup from "./components/VerdictPopup";
import Yapometer from "./components/Yapometer";
import { createAudioMeter } from "./lib/audioMeter";
import { getRandomBouncerLine } from "./lib/bouncerLines";
import { RealtimeVoiceController } from "./lib/realtimeVoice";
import { getSocket } from "./lib/socket";
import { createSoundController, SoundMode } from "./lib/sounds";
import { Participant, RoomState, TranscriptLine, ViolationPayload, ViolationType } from "./lib/types";
import { ViolationDetector } from "./lib/violationDetector";

const YAP_TARGET_MS = 10_000;

const getStatusByViolation = (
  participantId: string,
  activeSpeakerId: string | null,
  lastViolation: ViolationPayload | null
): "idle" | "yapping" | "bounced" | "too_soft" | "illegible" => {
  if (lastViolation?.participantId === participantId) {
    if (lastViolation.violationType === "too_soft") return "too_soft";
    if (lastViolation.violationType === "illegible") return "illegible";
    return "bounced";
  }
  if (participantId === activeSpeakerId) return "yapping";
  return "idle";
};

export default function App(): JSX.Element {
  const socket = useMemo(() => getSocket(), []);
  const [selfName, setSelfName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [joined, setJoined] = useState(false);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState("Voice not connected");
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [micRms, setMicRms] = useState(0);
  const [micPitchHz, setMicPitchHz] = useState<number | null>(null);
  const [micSpeaking, setMicSpeaking] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [meterError, setMeterError] = useState("");
  const [demoMode, setDemoMode] = useState(true);
  const [soundMode, setSoundMode] = useState<SoundMode>("airhorn");
  const [soundMuted, setSoundMuted] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [sensitivity, setSensitivity] = useState(0.04);
  const [yapProgressMs, setYapProgressMs] = useState(0);
  const [lastViolation, setLastViolation] = useState<ViolationPayload | null>(null);
  const [demoParticipants, setDemoParticipants] = useState<Participant[]>([]);
  const [autoSpeakerGuess, setAutoSpeakerGuess] = useState(true);
  const [micPeakPct, setMicPeakPct] = useState(0);
  const statsTickRef = useRef(0);
  const pitchProfilesRef = useRef<Record<string, { avgHz: number; samples: number }>>({});
  const lastAutoAssignRef = useRef(0);
  const activeSpeakerRef = useRef<string | null>(null);
  const participantsRef = useRef<Participant[]>([]);

  const detectorRef = useRef(new ViolationDetector());
  const soundRef = useRef(createSoundController());
  const voiceRef = useRef<RealtimeVoiceController | null>(null);
  const meterRef = useRef(
    createAudioMeter({
      speakingThreshold: sensitivity,
      onSample: ({ rms, isSpeaking, pitchHz }) => {
        setMicRms(rms);
        setMicSpeaking(isSpeaking);
        setMicPitchHz(pitchHz);
      },
      onError: (message) => {
        setMeterError(message);
      }
    })
  );

  const participants = roomState?.participants.length
    ? roomState.participants
    : demoMode
      ? demoParticipants
      : [];

  const myParticipant = participants.find((participant) => participant.username === selfName) ?? null;
  const activeSpeakerId = roomState?.activeSpeakerId ?? null;
  const liveVolumePct = Math.min(100, Math.round((micRms / Math.max(0.006, sensitivity * 0.75)) * 100));

  useEffect(() => {
    activeSpeakerRef.current = activeSpeakerId;
    participantsRef.current = participants;
  }, [activeSpeakerId, participants]);

  const selectSpeaker = (speakerId: string | null): void => {
    if (roomName) {
      socket.emit("host:setActiveSpeaker", { roomName, speakerId });
      return;
    }
    setRoomState((prev) => (prev ? { ...prev, activeSpeakerId: speakerId, updatedAt: Date.now() } : prev));
  };

  const claimSpeaker = (): void => {
    if (roomName) {
      socket.emit("speaker:claim", { roomName });
      return;
    }
    const fallbackId = myParticipant?.id ?? participants[0]?.id ?? null;
    selectSpeaker(fallbackId);
  };

  useEffect(() => {
    socket.on("room:state", (state) => {
      setRoomState(state);
      setJoined(true);
    });
    socket.on("violation:triggered", (payload) => {
      setLastViolation(payload);
      const violatedName =
        participants.find((participant) => participant.id === payload.participantId)?.username ?? "Mystery Yapper";
      const text = `🚨 BOUNCED: ${violatedName} — ${payload.reason}`;
      setVerdict(text);
      window.setTimeout(() => setVerdict(null), 2600);
    });
    socket.on("room:error", ({ error }) => setVerdict(error));
    return () => {
      socket.off("room:state");
      socket.off("violation:triggered");
      socket.off("room:error");
    };
  }, [participants, socket]);

  useEffect(() => {
    voiceRef.current = new RealtimeVoiceController({
      muted: voiceMuted,
      onStatus: setVoiceStatus,
      onTranscript: (text, lowConfidence) => {
        const speakerId = activeSpeakerRef.current;
        const people = participantsRef.current;
        setTranscript((prev) =>
          [
            ...prev.slice(-8),
            {
              id: crypto.randomUUID(),
              speakerId,
              speakerName: speakerId
                ? people.find((participant) => participant.id === speakerId)?.username ?? "Unknown"
                : "Mystery Yapper",
              text,
              lowConfidence,
              timestamp: Date.now()
            }
          ].slice(-9)
        );
      }
    });
    return () => {
      voiceRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    voiceRef.current?.setMuted(voiceMuted);
  }, [voiceMuted]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!joined) return;
      if (event.key === "Escape") {
        selectSpeaker(null);
      }
      if (event.key === "1" || event.key === "2" || event.key === "3") {
        const index = Number(event.key) - 1;
        const target = participants[index];
        if (target) {
          selectSpeaker(target.id);
        }
      }
      if (event.key === " ") {
        event.preventDefault();
        claimSpeaker();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [claimSpeaker, joined, participants, roomName, selectSpeaker, socket]);

  useEffect(() => {
    meterRef.current.setSensitivity(sensitivity);
  }, [sensitivity]);

  useEffect(() => {
    setMicPeakPct((prev) => (liveVolumePct > prev ? liveVolumePct : prev));
  }, [liveVolumePct]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setMicPeakPct((prev) => Math.max(0, prev - 3));
    }, 120);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!micPitchHz || !micSpeaking || !activeSpeakerId) return;
    const existing = pitchProfilesRef.current[activeSpeakerId] ?? { avgHz: micPitchHz, samples: 0 };
    const nextSamples = existing.samples + 1;
    const nextAvg = (existing.avgHz * existing.samples + micPitchHz) / nextSamples;
    pitchProfilesRef.current[activeSpeakerId] = { avgHz: nextAvg, samples: nextSamples };
  }, [activeSpeakerId, micPitchHz, micSpeaking]);

  useEffect(() => {
    if (!autoSpeakerGuess || !micSpeaking || !micPitchHz || participants.length < 2) return;
    const now = Date.now();
    if (now - lastAutoAssignRef.current < 1200) return;
    const candidates = participants
      .map((participant) => {
        const profile = pitchProfilesRef.current[participant.id];
        if (!profile || profile.samples < 4) return null;
        return {
          participantId: participant.id,
          distance: Math.abs(profile.avgHz - micPitchHz)
        };
      })
      .filter((entry): entry is { participantId: string; distance: number } => Boolean(entry))
      .sort((a, b) => a.distance - b.distance);
    const best = candidates[0];
    if (!best || best.distance > 55) return;
    if (best.participantId === activeSpeakerId) return;
    lastAutoAssignRef.current = now;
    selectSpeaker(best.participantId);
  }, [activeSpeakerId, autoSpeakerGuess, micPitchHz, micSpeaking, participants]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const recentTranscript = transcript.slice(-3).map((line) => line.text).join(" ");
      const claiming = participants.some((participant) => participant.id === activeSpeakerId && participant.isClaimingSpeaker);
      const violation = detectorRef.current.evaluate({
        now: Date.now(),
        activeSpeakerId,
        isSpeakerClaiming: claiming,
        rms: micRms,
        transcriptText: recentTranscript
      });
      setYapProgressMs(detectorRef.current.getYapProgressMs(activeSpeakerId, Date.now()));

      if (!violation) return;
      fireViolation(violation.type, violation.reason, violation.speakerId);
    }, 200);
    return () => window.clearInterval(id);
  }, [activeSpeakerId, micRms, participants, transcript]);

  useEffect(() => {
    if (!activeSpeakerId || micRms < sensitivity) return;
    const now = Date.now();
    if (now - statsTickRef.current < 1000) return;
    statsTickRef.current = now;
    const target = participants.find((participant) => participant.id === activeSpeakerId);
    if (!target) return;
    if (roomName) {
      socket.emit("stats:update", {
        roomName,
        participantId: activeSpeakerId,
        stats: {
          totalTalkMs: target.stats.totalTalkMs + 1000,
          longestYapMs: Math.max(target.stats.longestYapMs, yapProgressMs)
        }
      });
      return;
    }
    setDemoParticipants((prev) =>
      prev.map((participant) =>
        participant.id === activeSpeakerId
          ? {
              ...participant,
              stats: {
                ...participant.stats,
                totalTalkMs: participant.stats.totalTalkMs + 1000,
                longestYapMs: Math.max(participant.stats.longestYapMs, yapProgressMs)
              }
            }
          : participant
      )
    );
  }, [activeSpeakerId, micRms, participants, roomName, sensitivity, socket, yapProgressMs]);

  const fireViolation = (type: ViolationType, reason: string, participantId: string | null): void => {
    const payload: ViolationPayload = {
      roomName: roomName || "demo-room",
      participantId,
      violationType: type,
      reason,
      timestamp: Date.now()
    };
    setLastViolation(payload);
    if (!soundMuted) soundRef.current.play(soundMode);
    voiceRef.current?.sayViolation(type);

    const target = participants.find((participant) => participant.id === participantId);
    const targetName = target?.username ?? "Mystery Yapper";
    setVerdict(`🚨 BOUNCED: ${targetName} — ${reason}`);
    window.setTimeout(() => setVerdict(null), 3000);

    if (participantId && roomName) {
      const nextStats = {
        bounces: (target?.stats.bounces ?? 0) + 1,
        illegibleCount: (target?.stats.illegibleCount ?? 0) + (type === "illegible" ? 1 : 0),
        tooSoftCount: (target?.stats.tooSoftCount ?? 0) + (type === "too_soft" ? 1 : 0),
        longestYapMs: Math.max(target?.stats.longestYapMs ?? 0, yapProgressMs)
      };
      socket.emit("stats:update", { roomName, participantId, stats: nextStats });
    }
    if (roomName) {
      socket.emit("violation:triggered", payload);
    }
    if (!roomName && participantId) {
      setDemoParticipants((prev) =>
        prev.map((participant) =>
          participant.id === participantId
            ? {
                ...participant,
                stats: {
                  ...participant.stats,
                  bounces: participant.stats.bounces + 1,
                  illegibleCount: participant.stats.illegibleCount + (type === "illegible" ? 1 : 0),
                  tooSoftCount: participant.stats.tooSoftCount + (type === "too_soft" ? 1 : 0),
                  longestYapMs: Math.max(participant.stats.longestYapMs, yapProgressMs)
                }
              }
            : participant
        )
      );
    }
  };

  const join = (meetingName: string, username: string): void => {
    setSelfName(username.trim());
    setRoomName(meetingName.trim());
    socket.emit("room:join", { roomName: meetingName.trim(), username: username.trim() });
  };

  const startHostMic = async (): Promise<void> => {
    if (roomName) {
      socket.emit("host:micStatus", { roomName });
    }
    const stream = await meterRef.current.start();
    if (stream) {
      setMicReady(true);
      setIsRecordingVoice(true);
      await voiceRef.current?.connect(stream);
    } else {
      setMicReady(false);
      setIsRecordingVoice(false);
    }
  };

  const stopHostMic = (): void => {
    meterRef.current.stop();
    setMicReady(false);
    setIsRecordingVoice(false);
  };

  const toggleHostMic = (): void => {
    if (isRecordingVoice) {
      stopHostMic();
      return;
    }
    void startHostMic();
  };

  const simulateParticipants = (): void => {
    const now = Date.now();
    setDemoParticipants([
      {
        id: "demo-1",
        username: "Kai",
        avatarColor: "#ff5d8f",
        joinedAt: now - 10000,
        isHostMic: true,
        isClaimingSpeaker: false,
        stats: { totalTalkMs: 12000, bounces: 1, longestYapMs: 10000, illegibleCount: 0, tooSoftCount: 0 }
      },
      {
        id: "demo-2",
        username: "Zee",
        avatarColor: "#00d2ff",
        joinedAt: now - 8000,
        isHostMic: false,
        isClaimingSpeaker: false,
        stats: { totalTalkMs: 4300, bounces: 2, longestYapMs: 5400, illegibleCount: 1, tooSoftCount: 0 }
      },
      {
        id: "demo-3",
        username: "Milo",
        avatarColor: "#ffd93d",
        joinedAt: now - 5000,
        isHostMic: false,
        isClaimingSpeaker: false,
        stats: { totalTalkMs: 7000, bounces: 1, longestYapMs: 6200, illegibleCount: 1, tooSoftCount: 1 }
      }
    ]);
    setRoomState({
      roomName: roomName || "demo-room",
      participants: [],
      activeSpeakerId: "demo-1",
      hostMicParticipantId: "demo-1",
      updatedAt: Date.now()
    });
    setJoined(true);
  };

  if (!joined) {
    return (
      <main className="page">
        <h1 className="mega-title">MEETING BOUNCER</h1>
        <p className="tagline">Chaotic meeting referee for certified yappers.</p>
        <div className="grid-two">
          <JoinForm onJoin={join} />
          <OnboardingCard />
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <h1 className="mega-title">MEETING BOUNCER</h1>
      <p className="room-pill">ROOM: {roomName || roomState?.roomName || "demo-room"}</p>
      <p className="status-line">{voiceStatus}</p>
      <p className="status-line">
        Voice capture: {isRecordingVoice ? "RECORDING VOICE" : "NOT RECORDING VOICE"}
      </p>

      <section className="control-row">
        <button className="btn" onClick={toggleHostMic}>
          {isRecordingVoice ? "Stop host mic recording" : "Use this device as host mic"}
        </button>
        <button className="btn" onClick={claimSpeaker}>
          I&apos;M TALKING
        </button>
        <button className="btn" onClick={() => soundRef.current.play(soundMode)}>
          Test airhorn
        </button>
      </section>

      <section className="grid-three">
        {participants.map((participant) => (
          <AvatarCard
            key={participant.id}
            participant={participant}
            active={participant.id === activeSpeakerId}
            state={getStatusByViolation(participant.id, activeSpeakerId, lastViolation)}
            onClick={() => selectSpeaker(participant.id)}
          />
        ))}
      </section>

      <section className="grid-two">
        <Yapometer
          progressMs={yapProgressMs}
          targetMs={YAP_TARGET_MS}
          liveVolumePct={liveVolumePct}
          livePeakPct={micPeakPct}
          isSpeaking={micSpeaking}
        />
        <Leaderboard participants={participants} />
      </section>

      <section className="grid-two">
        <div className="card stack">
          <h3 className="section-title">Transcript</h3>
          {transcript.length === 0 ? <p>No transcript yet. Start yapping.</p> : null}
          {transcript.map((line) => (
            <p key={line.id} className={line.lowConfidence ? "low-confidence" : ""}>
              <strong>{line.speakerName}: </strong>
              {line.text}
            </p>
          ))}
        </div>

        <div className="card stack">
          <h3 className="section-title">Demo Controls</h3>
          <label className="toggle">
            <input type="checkbox" checked={demoMode} onChange={(event) => setDemoMode(event.target.checked)} />
            Demo Mode
          </label>
          <button className="btn" onClick={simulateParticipants}>
            Simulate 3 participants
          </button>
          <button className="btn" onClick={() => fireViolation("dominating", "10.8s nonstop yap", participants[0]?.id ?? null)}>
            Simulate dominating yap
          </button>
          <button className="btn" onClick={() => fireViolation("too_soft", "audio too soft", participants[1]?.id ?? null)}>
            Simulate too soft
          </button>
          <button className="btn" onClick={() => fireViolation("illegible", "illegible yap detected", participants[2]?.id ?? null)}>
            Simulate gibberish
          </button>
          <button className="btn" onClick={() => setVerdict(`Bouncer says: ${getRandomBouncerLine()}`)}>
            Trigger random bouncer line
          </button>
          <label className="stack">
            <span className="label">Mic sensitivity</span>
            <input
              type="range"
              min={0.01}
              max={0.12}
              step={0.005}
              value={sensitivity}
              onChange={(event) => setSensitivity(Number(event.target.value))}
            />
          </label>
          <label className="stack">
            <span className="label">Interruption sound</span>
            <select value={soundMode} onChange={(event) => setSoundMode(event.target.value as SoundMode)} className="input">
              <option value="airhorn">Airhorn</option>
              <option value="gameshow_fail">Game show fail</option>
              <option value="vine_boom">Vine boom-ish</option>
              <option value="random">Random</option>
            </select>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={soundMuted} onChange={(event) => setSoundMuted(event.target.checked)} />
            Sound muted
          </label>
          <label className="toggle">
            <input type="checkbox" checked={voiceMuted} onChange={(event) => setVoiceMuted(event.target.checked)} />
            Voice muted
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={autoSpeakerGuess}
              onChange={(event) => setAutoSpeakerGuess(event.target.checked)}
            />
            Experimental auto speaker guess (same mic)
          </label>
          <div className="mic-meter-wrap" aria-label="Live microphone meter">
            <div className="mic-meter-bar" style={{ width: `${liveVolumePct}%` }} />
          </div>
          <p className="text-xs font-bold">Mic RMS: {micRms.toFixed(3)}</p>
          <p className="text-xs font-bold">Mic pitch: {micPitchHz ? `${Math.round(micPitchHz)} Hz` : "n/a"}</p>
          <p className="text-xs font-bold">{micSpeaking ? "Speaking detected" : "Silence detected"}</p>
          {micRms > sensitivity && !activeSpeakerId ? (
            <p className="text-xs font-bold text-red-700">Mystery Yapper detected: assign a speaker.</p>
          ) : null}
          {meterError ? <p className="text-xs text-red-700">{meterError}</p> : null}
        </div>
      </section>

      <VerdictPopup text={verdict} />
      <div className="shortcut-hint">Hotkeys: 1/2/3 select speaker, Space claim, Esc clear.</div>
    </main>
  );
}
