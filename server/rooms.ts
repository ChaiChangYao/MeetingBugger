import { Participant, ParticipantStats, RoomState } from "./types.js";

export const ROOM_NAME_MAX = 40;
export const USERNAME_MAX = 24;

const AVATAR_COLORS = [
  "#ff5d8f",
  "#00d2ff",
  "#ffd93d",
  "#98f5e1",
  "#c77dff",
  "#ff9f1c"
];

const DEFAULT_STATS: ParticipantStats = {
  totalTalkMs: 0,
  bounces: 0,
  longestYapMs: 0,
  illegibleCount: 0,
  tooSoftCount: 0
};

const stripHtml = (value: string): string => value.replace(/<[^>]*>/g, "");

export const sanitizeRoomName = (raw: string): string =>
  stripHtml(raw).trim().slice(0, ROOM_NAME_MAX);

export const sanitizeUsername = (raw: string): string =>
  stripHtml(raw).trim().slice(0, USERNAME_MAX);

interface RoomRecord {
  state: RoomState;
  claims: Map<string, number>;
}

const rooms = new Map<string, RoomRecord>();

const makeParticipant = (id: string, username: string, idx: number): Participant => ({
  id,
  username,
  avatarColor: AVATAR_COLORS[idx % AVATAR_COLORS.length],
  joinedAt: Date.now(),
  isHostMic: false,
  isClaimingSpeaker: false,
  stats: { ...DEFAULT_STATS }
});

export const getOrCreateRoom = (roomName: string): RoomRecord => {
  const key = sanitizeRoomName(roomName);
  const existing = rooms.get(key);
  if (existing) {
    return existing;
  }

  const record: RoomRecord = {
    state: {
      roomName: key,
      participants: [],
      activeSpeakerId: null,
      hostMicParticipantId: null,
      updatedAt: Date.now()
    },
    claims: new Map()
  };
  rooms.set(key, record);
  return record;
};

export const joinRoom = (roomName: string, socketId: string, username: string): RoomState => {
  const record = getOrCreateRoom(roomName);
  const cleanName = sanitizeUsername(username);
  const duplicate = record.state.participants.find((participant) => participant.id === socketId);
  if (!duplicate) {
    record.state.participants.push(
      makeParticipant(socketId, cleanName || `Guest-${record.state.participants.length + 1}`, record.state.participants.length)
    );
  }
  record.state.updatedAt = Date.now();
  return record.state;
};

export const leaveRoom = (roomName: string, socketId: string): RoomState | null => {
  const key = sanitizeRoomName(roomName);
  const record = rooms.get(key);
  if (!record) {
    return null;
  }
  record.state.participants = record.state.participants.filter((participant) => participant.id !== socketId);
  record.claims.delete(socketId);

  if (record.state.activeSpeakerId === socketId) {
    record.state.activeSpeakerId = null;
  }
  if (record.state.hostMicParticipantId === socketId) {
    record.state.hostMicParticipantId = null;
  }

  if (record.state.participants.length === 0) {
    rooms.delete(key);
    return null;
  }
  record.state.updatedAt = Date.now();
  return record.state;
};

export const setHostMic = (roomName: string, socketId: string): RoomState | null => {
  const key = sanitizeRoomName(roomName);
  const record = rooms.get(key);
  if (!record) {
    return null;
  }

  record.state.hostMicParticipantId = socketId;
  record.state.participants = record.state.participants.map((participant) => ({
    ...participant,
    isHostMic: participant.id === socketId
  }));
  record.state.updatedAt = Date.now();
  return record.state;
};

export const setActiveSpeaker = (roomName: string, speakerId: string | null): RoomState | null => {
  const key = sanitizeRoomName(roomName);
  const record = rooms.get(key);
  if (!record) {
    return null;
  }
  record.state.activeSpeakerId = speakerId;
  record.state.updatedAt = Date.now();
  return record.state;
};

export const setClaimSpeaker = (roomName: string, socketId: string, claimMs = 5000): RoomState | null => {
  const key = sanitizeRoomName(roomName);
  const record = rooms.get(key);
  if (!record) {
    return null;
  }

  const expiresAt = Date.now() + claimMs;
  record.claims.set(socketId, expiresAt);
  record.state.activeSpeakerId = socketId;

  record.state.participants = record.state.participants.map((participant) => ({
    ...participant,
    isClaimingSpeaker: participant.id === socketId
  }));
  record.state.updatedAt = Date.now();
  return record.state;
};

export const clearExpiredClaims = (): void => {
  const now = Date.now();
  for (const [roomKey, record] of rooms.entries()) {
    let changed = false;
    for (const [id, expiresAt] of record.claims.entries()) {
      if (expiresAt <= now) {
        record.claims.delete(id);
        changed = true;
      }
    }

    if (changed) {
      record.state.participants = record.state.participants.map((participant) => ({
        ...participant,
        isClaimingSpeaker: record.claims.has(participant.id)
      }));
      if (record.state.activeSpeakerId && !record.claims.has(record.state.activeSpeakerId)) {
        record.state.activeSpeakerId = null;
      }
      record.state.updatedAt = now;
      rooms.set(roomKey, record);
    }
  }
};

export const updateParticipantStats = (
  roomName: string,
  participantId: string,
  partialStats: Partial<ParticipantStats>
): RoomState | null => {
  const key = sanitizeRoomName(roomName);
  const record = rooms.get(key);
  if (!record) {
    return null;
  }
  record.state.participants = record.state.participants.map((participant) => {
    if (participant.id !== participantId) {
      return participant;
    }
    return {
      ...participant,
      stats: {
        ...participant.stats,
        ...partialStats
      }
    };
  });
  record.state.updatedAt = Date.now();
  return record.state;
};

export const getRoomState = (roomName: string): RoomState | null => {
  const key = sanitizeRoomName(roomName);
  const record = rooms.get(key);
  return record ? record.state : null;
};
