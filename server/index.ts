import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { getRealtimeToken } from "./openaiRealtime.js";
import {
  USERNAME_MAX,
  ROOM_NAME_MAX,
  clearExpiredClaims,
  getRoomState,
  joinRoom,
  leaveRoom,
  sanitizeRoomName,
  sanitizeUsername,
  setActiveSpeaker,
  setClaimSpeaker,
  toggleClaimSpeaker,
  setHostMic,
  updateParticipantStats
} from "./rooms.js";
import { ParticipantStats, ViolationPayload } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistDir = path.resolve(__dirname, "../client");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*"
  }
});

app.use(express.json());

const requestCounts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15_000;
const MAX_PER_WINDOW = 80;

const basicRateLimit = (ip: string): boolean => {
  const now = Date.now();
  const existing = requestCounts.get(ip);
  if (!existing || existing.resetAt <= now) {
    requestCounts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  existing.count += 1;
  requestCounts.set(ip, existing);
  return existing.count <= MAX_PER_WINDOW;
};

app.use((req, res, next) => {
  const ip = req.ip || "unknown";
  if (!basicRateLimit(ip)) {
    res.status(429).json({ error: "Too many requests." });
    return;
  }
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

app.get("/api/realtime-token", getRealtimeToken);

io.on("connection", (socket) => {
  socket.on("room:join", ({ roomName, username }: { roomName: string; username: string }) => {
    const cleanRoom = sanitizeRoomName(roomName);
    const cleanUser = sanitizeUsername(username);
    if (!cleanRoom || !cleanUser || cleanRoom.length > ROOM_NAME_MAX || cleanUser.length > USERNAME_MAX) {
      socket.emit("room:error", { error: "Invalid room or username." });
      return;
    }
    socket.data.roomName = cleanRoom;
    socket.join(cleanRoom);
    const state = joinRoom(cleanRoom, socket.id, cleanUser);
    io.to(cleanRoom).emit("room:state", state);
  });

  socket.on("room:leave", () => {
    const roomName = socket.data.roomName as string | undefined;
    if (!roomName) {
      return;
    }
    socket.leave(roomName);
    const state = leaveRoom(roomName, socket.id);
    if (state) {
      io.to(roomName).emit("room:state", state);
    }
  });

  socket.on("host:setActiveSpeaker", ({ roomName, speakerId }: { roomName: string; speakerId: string | null }) => {
    const cleanRoom = sanitizeRoomName(roomName);
    const state = setActiveSpeaker(cleanRoom, speakerId ?? null);
    if (state) {
      io.to(cleanRoom).emit("room:state", state);
    }
  });

  socket.on("speaker:claim", ({ roomName }: { roomName: string }) => {
    const cleanRoom = sanitizeRoomName(roomName);
    const state = setClaimSpeaker(cleanRoom, socket.id);
    if (state) {
      io.to(cleanRoom).emit("room:state", state);
    }
  });

  socket.on("speaker:toggleClaim", ({ roomName }: { roomName: string }) => {
    const cleanRoom = sanitizeRoomName(roomName);
    const state = toggleClaimSpeaker(cleanRoom, socket.id);
    if (state) {
      io.to(cleanRoom).emit("room:state", state);
    }
  });

  socket.on("host:micStatus", ({ roomName }: { roomName: string }) => {
    const cleanRoom = sanitizeRoomName(roomName);
    const state = setHostMic(cleanRoom, socket.id);
    if (state) {
      io.to(cleanRoom).emit("room:state", state);
    }
  });

  socket.on(
    "stats:update",
    ({ roomName, participantId, stats }: { roomName: string; participantId: string; stats: Partial<ParticipantStats> }) => {
      const cleanRoom = sanitizeRoomName(roomName);
      const state = updateParticipantStats(cleanRoom, participantId, stats);
      if (state) {
        io.to(cleanRoom).emit("room:state", state);
      }
    }
  );

  socket.on("violation:triggered", (payload: ViolationPayload) => {
    const cleanRoom = sanitizeRoomName(payload.roomName);
    io.to(cleanRoom).emit("violation:triggered", payload);
  });

  socket.on("disconnect", () => {
    const roomName = socket.data.roomName as string | undefined;
    if (!roomName) {
      return;
    }
    const state = leaveRoom(roomName, socket.id);
    if (state) {
      io.to(roomName).emit("room:state", state);
    }
  });
});

setInterval(() => {
  clearExpiredClaims();
}, 500);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(clientDistDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDistDir, "index.html"));
  });
}

const port = Number(process.env.PORT ?? 3000);
httpServer.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Meeting Bouncer server listening on ${port}`);
});
