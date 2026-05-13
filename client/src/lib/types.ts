export type ViolationType = "dominating" | "too_soft" | "illegible";

export interface ParticipantStats {
  totalTalkMs: number;
  bounces: number;
  longestYapMs: number;
  illegibleCount: number;
  tooSoftCount: number;
}

export interface Participant {
  id: string;
  username: string;
  avatarColor: string;
  joinedAt: number;
  isHostMic: boolean;
  isClaimingSpeaker: boolean;
  stats: ParticipantStats;
}

export interface RoomState {
  roomName: string;
  participants: Participant[];
  activeSpeakerId: string | null;
  hostMicParticipantId: string | null;
  updatedAt: number;
}

export interface TranscriptLine {
  id: string;
  speakerId: string | null;
  speakerName: string;
  text: string;
  lowConfidence: boolean;
  timestamp: number;
}

export interface ViolationPayload {
  roomName: string;
  participantId: string | null;
  violationType: ViolationType;
  reason: string;
  timestamp: number;
}
