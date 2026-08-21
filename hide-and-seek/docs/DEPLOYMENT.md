# Deployment

The game is **one Node.js process**: it serves the static client *and* the
realtime game server (Socket.IO). No database, no build step, no CDN needed.

```bash
npm install --omit=dev
PORT=8080 node server/index.js
```

> **HTTPS note:** browsers only allow microphone access on `https://` pages
> (exception: `http://localhost`). Voice *listening* works without HTTPS, but
> transmitting needs it. Use any of the options below — they all give you TLS.

---

## Option A — free PaaS tier (fastest)

Works on Fly.io / Railway / Render free tiers (any service that runs a Node
app and exposes a port).

1. Push this folder to a git repo.
2. Create a new app (build: `npm install`, start: `npm start`).
3. Set `PORT` if the platform requires it (most inject one).
4. Share the resulting `https://yourapp.example.com` with friends.

Room capacity on a free instance comfortably covers several rooms of friends
(see [LIMITATIONS-AND-COST.md](LIMITATIONS-AND-COST.md) for numbers).

## Option B — small VPS + systemd (most control)

```bash
# on the server (Ubuntu/Debian example)
sudo apt install -y nodejs npm
git clone <your-repo> && cd hide-and-seek
npm install --omit=dev

sudo tee /etc/systemd/system/blackwood.service <<'EOF'
[Unit]
Description=Blackwood Hide&Seek
After=network.target

[Service]
WorkingDirectory=/opt/hide-and-seek
ExecStart=/usr/bin/node server/index.js
Environment=PORT=8080
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable --now blackwood
```

Put Caddy or nginx in front for TLS:

```
# Caddyfile — automatic HTTPS with Let's Encrypt
hide.yourdomain.com {
  reverse_proxy localhost:8080
}
```

nginx needs the usual `proxy_pass` **plus** WebSocket upgrade headers
(Socket.IO degrades to polling without them):

```nginx
location / {
  proxy_pass http://127.0.0.1:8080;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

## Option C — LAN party (zero internet)

`npm start` and open `http://<your-lan-ip>:8080` from any device on the same
network. The client and Three.js are vendored/served locally; only voice
needs internet (STUN). Without internet the game still runs — voice calls may
fail on some networks.

## Voice / TURN

WebRTC peer-to-peer voice works for most home networks using free public
STUN. Roughly 10–20 % of NAT pairings (carrier-grade NAT, strict corporate
firewalls) additionally need a **TURN relay**, which costs bandwidth. Set:

```bash
STUN_URLS=stun:stun.l.google.com:19302
# later, if you run coturn:
# STUN_URLS=stun:stun.example.com,turn:turn.example.com?transport=udp
```

Running your own [coturn](https://github.com/coturn/coturn) on a $5 VPS is
the standard cheap path — see LIMITATIONS-AND-COST.md.

## Operations

- `GET /api/health` → `{ ok, rooms, players }` for uptime monitors.
- `GET /api/config` → active STUN/voice settings.
- Rooms are in-memory: a server restart clears them (clients get kicked back
  to the home screen with a reconnect banner). For zero-downtime restarts
  across instances later, the RoomManager interface maps to Redis.
- Scale path: the app is single-process today; rooms are fully independent,
  so sharding rooms across processes/workers is a mechanical change.
