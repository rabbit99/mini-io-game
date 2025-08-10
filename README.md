# Mini IO Game

A minimal real-time multiplayer browser game inspired by cell-eating .io mechanics. Original implementation (no copied game assets or proprietary code).

## Features

- Realtime movement via Socket.IO
- Dynamic food spawning and consumption
- Growth & speed scaling (larger = slower)
- Simple player-vs-player consumption logic
- Leaderboard & HUD
- Responsive canvas with camera centered on player

## Run Locally

Install dependencies and start the server:

```bash
npm install
npm start
```

Then open http://localhost:3000

## Code Structure

Server Source

- `server/server.ts` Authoritative simulation (30 ticks/sec), delta & full snapshots, optional binary (`stateb`) stream, food spawn, collision, death events (compiled to `dist/server/server.js`).

Client Source (TypeScript under `src/client` -> compiled assets emitted to `public/`)

- `public/index.html` Canvas + HUD skeleton (loads compiled `main.js`)
- `src/client/state.ts` Central reactive state & config (fog, grid, chunk metadata)
- `src/client/net.ts` Socket init, JSON + binary snapshot ingestion, interpolation buffer, RTT/jitter stats
- `src/client/events.ts` Centralized DOM & input bindings (resize, mouse, keys, start / restart buttons)
- `src/client/render.ts` World layer rendering (grid, players, fog, HUD, leaderboard) – food rendering delegated
- `src/client/food.ts` Food map chunk rebuild & efficient draw (lazy rebuild after mutations)
- `src/client/util.ts` Shared helpers (clamp, FPS counter, name offscreen cache)
- `src/client/main.ts` Bootstraps game, camera transform & adaptive smooth scale, draw loop orchestration

Build Output (generated, git-ignored)

- `public/*.js`, `public/*.js.map`, `public/*.d.ts` are generated from `src/client`.

Legacy monolithic prototype and previous JS sources in `public/` were removed after the TypeScript modular migration.

## Architecture Diagram (ASCII)

```
			    +--------------------+
			    |    Client (UI)     |
			    |  index.html / DOM  |
			    +----------+---------+
						|
						v
 +----------------------+   +----------------------+   +-------------------+
 |   events.js          |   |      state.js        |   |     util.js       |
 |  (input -> actions)  |   |  (central mutable    |   |  (helpers: clamp, |
 |  mouse/keys/startBtn |-->|   app state object)  |<--|  FPS, name cache) |
 +-----------+----------+   +----------+-----------+   +-------------------+
		   |                         ^
		   v                         |
 +----------------------+              |
 |      net.js          |--------------+
 | Socket.IO client     |  writes snapshots / food
 | - JSON snapshots     |  updates app.foodMap
 | - Binary state (b)   |  RTT & jitter metrics
 +-----------+----------+
		   |
		   v
 +----------------------+      +----------------------+
 |     main.js          | ---> |     render.js        |
 | game loop (RAF)      |      | background / players |
 | camera transform     |      | fog / HUD / leaderboard
 | scale easing         |      +-----------+----------+
 +-----------+----------+                  |
		   |                             v
		   |                   +----------------------+
		   |                   |      food.js         |
		   |                   | chunk rebuild + draw |
		   |                   +----------------------+
		   |
		   v
    (Canvas 2D API draw)
```

Legend: solid arrows show primary data flow / invocation direction; net.js pushes authoritative updates into state; main.js pulls interpolated players from net.js and instructs rendering; food.js focuses on performance for food rendering.

## Data Flow (Input -> Simulation -> Render)

```
 [Mouse / Keys]
	   |
	   v (sample @ ~20Hz)
   events.js -> net.socket.emit('input',{dir,seq})
	   |
	   v
   Server (authoritative tick 30/s)
	   |  physics (move, collisions, eat)
	   |  spawn food / remove eaten
	   v
   Build per-player payload (delta or full)
	   |
	   +---- JSON 'state' -----> net.js (enqueue snapshot)
	   |
	   +---- Binary 'stateb' --> net.js (decode, snapshot)
						   |
						   v
					 Interpolation buffer
						   |
						   v (t = now - delay)
					 getInterpolatedPlayers()
						   |
						   v
   main.js: compute camera + scale -----+
								 |
								 v
					    render.js / food.js draw to canvas
								 |
								 v
							Fog + HUD overlay
```

Interpolation: client deliberately renders ~100ms in the past for smoothness, then lightly forward-extrapolates local player with last known velocity.

Food Pipeline: net.js mutates app.foodMap -> markFoodDirty() -> food.js decrements foodDirtyTimer -> when reaches 0 rebuild chunk canvases -> main.js draw loop selects chunk vs direct drawing based on count.

Latency Metrics: net.js emits pingCheck every 2s; RTT + jitter (std-dev approximation) displayed in HUD.

## Next Ideas

- Binary snapshot compression refinements (bit packing for flags, shared string tables)
- Spatial partitioning (quad tree or cell hashing) for server-side culling
- Predictive smoothing: client-side reconciliation of input sequence acks
- Split / eject mechanics (custom mass transfer)
- Persistent high-score board & daily stats
- Mobile / touch joystick & low-resolution dynamic scaling
- GPU instanced rendering path (WebGL) for large food counts
- Automated latency simulation & jitter buffer tuning

## License

MIT - You may use / modify with attribution. Avoid copying trademarked names or proprietary assets from existing games.
