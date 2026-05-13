import { Request, Response } from "express";

const OPENAI_REALTIME_SESSIONS_URL = "https://api.openai.com/v1/realtime/sessions";
const REALTIME_MODEL_CANDIDATES = ["gpt-realtime-2", "gpt-realtime"];

const MEETING_BOUNCER_INSTRUCTIONS = [
  "You are Meeting Bouncer, a comedic game-show referee for meetings.",
  "Only speak when asked to roast a violation.",
  "Return exactly one short line with at most 12 words.",
  "Tone: playful Gen Alpha roast.",
  "No slurs, hate, protected-class insults, sexual content, or real harassment."
].join(" ");

export const getRealtimeToken = async (_req: Request, res: Response): Promise<void> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: "OPENAI_API_KEY is not configured on the server."
    });
    return;
  }

  try {
    // Security note:
    // We request an ephemeral Realtime session key here on the server because
    // permanent OPENAI_API_KEY must never be sent to browsers or bundled client code.
    let session: Record<string, any> | null = null;
    let lastErrorBody = "No response body";
    let lastStatus = 502;

    for (const model of REALTIME_MODEL_CANDIDATES) {
      const upstreamResponse = await fetch(OPENAI_REALTIME_SESSIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          voice: "alloy",
          instructions: MEETING_BOUNCER_INSTRUCTIONS,
          // Transcription model availability varies by account/API tier.
          // We omit explicit transcription model selection here so session creation
          // is broadly compatible; client logic already tolerates missing transcript
          // events and continues via local speech detection + fallback voice mode.
          turn_detection: {
            type: "server_vad",
            threshold: 0.55,
            prefix_padding_ms: 250,
            silence_duration_ms: 700
          }
        })
      });

      if (upstreamResponse.ok) {
        session = (await upstreamResponse.json()) as Record<string, any>;
        break;
      }

      lastStatus = upstreamResponse.status;
      lastErrorBody = await upstreamResponse.text();
    }

    if (!session) {
      res.status(lastStatus).json({
        error: `Failed to create realtime session. ${lastErrorBody}`
      });
      return;
    }

    const clientSecret = session?.client_secret?.value ?? null;

    res.json({
      client_secret: clientSecret,
      session_id: session?.id ?? null,
      model: session?.model ?? "gpt-realtime",
      instructions: MEETING_BOUNCER_INSTRUCTIONS
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
};
