# Cabo

A web version of the [Cabo card game](https://en.wikipedia.org/wiki/Cabo_(game)). Single-player vs AI bots, or multiplayer with friends via a shareable URL room code.

## Project layout

- [cobo/](cobo) — React + Vite + TypeScript client (Framer Motion for animations, Zustand for state)
- [server/](server) — Node + Socket.IO authoritative game server (TypeScript). In production mode it also serves the built client, so the whole app runs from a single port.

The game engine lives in two copies: [cobo/src/engine](cobo/src/engine) and [server/src/engine](server/src/engine). They're kept in sync manually; if you change one, copy to the other.

## TL;DR — share with friends right now

One command. From the repo root:

```bash
cd server
npm install            # first time only
npm run share
```

It builds the client, starts the server on `:8787` serving both the client and the Socket.IO endpoint, then opens a free public tunnel via **localtunnel**. You get a URL like:

```
🌐 Public URL: https://small-bears-shout.loca.lt
```

Open that URL on your laptop, click **Play with friends → Create room**, copy the share URL (it will use the same `*.loca.lt` host), send it to your friends anywhere on the internet, and play.

> First-time visitors will see a localtunnel intro page warning about the tunnel — they click "Click to Continue" once. After that the app loads normally.

If the tunnel host gets blocked / changes, see [Alternatives below](#deploying-anywhere-else).

## How to play

### Single-player

1. Open the menu, pick 1–3 bots, click **Play vs bots**.
2. Tap any 2 of your 4 cards to peek at them, then click **Start round** (or just **Skip peek & start** if you want to dive in cold).
3. On your turn:
   - Click the deck to draw a card. Then swap it into your hand or discard it.
   - Discarding an action card triggers its effect (7/8 peek own, 9/10 spy opponent, J/Q blind swap, ♠/♣ K peek-and-swap).
   - Or call **CABO!** if you think you're winning — this triggers a final round and ends the game.
4. Snap an out-of-turn card from your hand if it matches the top of the discard pile (click your card). A wrong snap costs you a penalty card.
5. After the round, click **Play again** to continue with running scores.

Scoring: A=1, 2–10 face value, J/Q=10, K=0. Lowest total wins. If you called Cabo but didn't win, you take a +5 penalty.

### Multiplayer

1. **Host**: open the app, click **Play with friends**, type your name, click **Create room**.
2. **Copy that URL** and send it to your friends.
3. Friends open the URL, type their name, click **Join**.
4. When at least 2 players are in, the host clicks **Start game**.
5. Each player peeks at any 2 of their own cards; the host clicks **Start round** when ready.
6. The game plays the same as single-player, but turns rotate through real players. Up to 4 per room.

## Local development

Two terminals (HMR for the client, watch mode for the server):

```bash
# terminal 1
cd server
npm install
npm run dev          # tsx watch, :8787, no static serving

# terminal 2
cd cobo
npm install
npm run dev          # vite, :5173, HMR
# open http://localhost:5173
```

In this mode the client connects to the dev server at `http://<hostname>:8787` (so LAN phones work via the laptop's LAN IP).

## Serving everything from one port (production-style)

If you don't need HMR — just want the whole game on one port that you can tunnel/deploy:

```bash
cd server
npm run serve        # builds the client, then runs the server serving cobo/dist
# open http://localhost:8787
```

This is what `npm run share` does under the hood, plus the tunnel.

## Playing across devices

### Same Wi-Fi (LAN — phone, tablet, another laptop)

1. Find your computer's LAN IP. On macOS:
   ```bash
   ipconfig getifaddr en0   # Wi-Fi
   ```
   You'll get something like `192.168.1.42`.
2. Run `npm run serve` (or `npm run share`) in `server/`.
3. On the phone, open `http://192.168.1.42:8787`.

If the phone can't reach the laptop, your firewall is the usual culprit. On macOS: System Settings → Network → Firewall → either turn it off temporarily or allow Node. Both devices must be on the same Wi-Fi network (not guest networks, not corporate, not VPNs).

### Real internet (different networks, anyone anywhere)

**The easy way** — `npm run share` (see TL;DR above). Friends just open the printed URL.

### Deploying anywhere else

If you want a stable URL (no localtunnel intro page, no expiring host), deploy the server.

**Cloudflare Tunnel** (free, ten seconds, no signup):
```bash
brew install cloudflared
cd server
npm run serve &                                    # all-in-one server on :8787
cloudflared tunnel --url http://localhost:8787
```
You get a public `https://random-words.trycloudflare.com` URL. No env vars to set — the client uses same-origin.

**ngrok** (free with account):
```bash
brew install ngrok
ngrok config add-authtoken <your-token>
cd server && npm run serve &
ngrok http 8787
```

**Cloud host** (permanent URL):
- **Render** / **Railway** / **Fly.io** — free tiers fit this app easily.
- Procfile / start command: `npm run serve` (build:client + start), exposing `$PORT`.
- The server already reads `process.env.PORT` and binds to `0.0.0.0`, so it works out of the box.
- No env vars needed in the client — same-origin sockets work.

### Env var override

If you want the client to talk to a different socket host than the page origin (for split client/server hosting):

```bash
VITE_SERVER_URL=https://your-server.example.com npm run build
```

## Tests

A small smoke test for the multiplayer server:

```bash
cd server
node test-2p.mjs
```

It opens two sockets, creates a room, joins, plays a quick round, prints the result.
