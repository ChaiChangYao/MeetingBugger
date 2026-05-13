# Meeting Bouncer

Meeting Bouncer is a funny browser demo where a meeting can "bounce" people for yapping too long, being too soft, or sounding illegible.  
It is intentionally chaotic and playful, like a game-show referee for your team call.

## What this app does

- Lets people join a room with only meeting name + username (no login).
- One person can use their laptop as the host microphone.
- Host can assign current speaker by clicking avatars or pressing `1`, `2`, `3`.
- Participants can also hit `I'M TALKING` (or `Space`) to claim speaker status briefly.
- Detects:
  - nonstop yapping
  - too soft speaking
  - illegible/gibberish speaking
- On violation it triggers:
  - generated interruption sound
  - voice roast (OpenAI Realtime when available)
  - red/animated avatar state
  - popup verdict
  - leaderboard updates

## Super quick local setup (beginner-friendly)

1. Install Node.js 20+.
2. Open terminal in this project folder.
3. Run:

```bash
npm install
```

4. Copy env template:

```bash
copy .env.example .env
```

5. Open `.env` and paste your OpenAI key:

```env
OPENAI_API_KEY=your_real_key_here
PORT=3000
```

6. Start app:

```bash
npm run dev
```

7. Open [http://localhost:3000](http://localhost:3000).

## Demo mode without API key (or without mic)

You can still demo everything even if no key or mic permission:

1. Keep `Demo Mode` enabled.
2. Click `Simulate 3 participants`.
3. Click simulate buttons:
   - `Simulate dominating yap`
   - `Simulate too soft`
   - `Simulate gibberish`
4. App falls back to browser speech mode and shows `Voice fallback mode`.

## Keyboard shortcuts

- `1 / 2 / 3`: select visible participants as active speaker
- `Space`: claim current speaker
- `Escape`: clear active speaker

## Render deployment (Node web service)

1. Push this project to GitHub.
2. In Render, click **New Web Service**.
3. Connect your repo.
4. Set:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
5. Add environment variable:
   - `OPENAI_API_KEY=...`
   - optional `PORT` (Render usually injects it)
6. Deploy.

## Known limitation (important)

This MVP uses one shared laptop microphone, so it cannot perfectly identify who is speaking automatically.  
Speaker identity is assisted by host click/hotkeys and participant claim button.  
True automatic speaker diarization is a v2 feature.

## Security note

- `OPENAI_API_KEY` is server-side only.
- Browser requests short-lived ephemeral Realtime tokens from `GET /api/realtime-token`.
- Client never receives your permanent API key.

## 60-second demo script

1. Start app with `npm run dev`.
2. Join room on three tabs/devices.
3. On host, click `Use this device as host mic`.
4. Use `1/2/3` to choose active speaker.
5. Talk nonstop for ~10 seconds or hit a simulate button.
6. Show:
   - sound interruption
   - voice roast (or fallback)
   - red bounce card + popup
   - Hall of Yap leaderboard changes

## Commands checklist

```bash
npm install
npm run dev
npm test
npm run build
npm start
```
