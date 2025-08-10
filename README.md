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

Server

- `server/server.js` Authoritative simulation (30 ticks/sec), delta & full snapshots, optional binary (`stateb`) stream, food spawn, collision, death events.

Client (modular)

- `public/index.html` Canvas + HUD skeleton
- `public/state.js` Central reactive state & config (fog, grid, chunk metadata)
- `public/net.js` Socket init, JSON + binary snapshot ingestion, interpolation buffer, RTT/jitter stats
- `public/events.js` Centralized DOM & input bindings (resize, mouse, keys, start button)
- `public/render.js` World layer rendering (grid, players, fog, HUD, leaderboard) – food rendering delegated
- `public/food.js` Food map chunk rebuild & efficient draw (lazy rebuild after mutations)
- `public/util.js` Shared helpers (clamp, FPS counter, name offscreen cache)
- `public/main.js` Bootstraps game, camera transform & smooth scale, draw loop orchestration

Removed legacy: `game-app.js` (monolithic prototype) replaced by the above modules.

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
