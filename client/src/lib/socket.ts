import { io, Socket } from "socket.io-client";
import { RoomState, ViolationPayload } from "./types";

export interface ServerToClientEvents {
  "room:state": (state: RoomState) => void;
  "violation:triggered": (payload: ViolationPayload) => void;
  "room:error": (payload: { error: string }) => void;
}

export interface ClientToServerEvents {
  "room:join": (payload: { roomName: string; username: string }) => void;
  "room:leave": () => void;
  "speaker:claim": (payload: { roomName: string }) => void;
  "speaker:toggleClaim": (payload: { roomName: string }) => void;
  "host:setActiveSpeaker": (payload: { roomName: string; speakerId: string | null }) => void;
  "host:micStatus": (payload: { roomName: string }) => void;
  "violation:triggered": (payload: ViolationPayload) => void;
  "stats:update": (payload: { roomName: string; participantId: string; stats: Record<string, number> }) => void;
}

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export const getSocket = (): Socket<ServerToClientEvents, ClientToServerEvents> => {
  if (socket) {
    return socket;
  }
  socket = io("/", {
    transports: ["websocket", "polling"]
  });
  return socket;
};
