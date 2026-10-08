[简体中文](README.zh-CN.md) | English

# cube-ball-maze-Wangravity

[![Validate game](https://github.com/Sean-xzx/cube-ball-maze-Wangravity/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Sean-xzx/cube-ball-maze-Wangravity/actions/workflows/ci.yml)

A personal browser maze game: guide a steel ball with phone tilt, touch dragging, or desktop keys.

Repository/project name: `cube-ball-maze-Wangravity`; npm package name: `cube-ball-maze-wangravity`. The in-game WANGRAVITY branding and legacy storage/resource names remain unchanged to preserve core behavior.

## Scope and Features

This is a small vanilla JavaScript game, not a reusable engine or a production account service. It includes a tutorial and five handcrafted 15 x 15 maps, Three.js visuals, optional Canvas 2D rendering, calibration, coins, static/patrolling/chasing traps, paired portals, per-attempt countdowns, results, local best times, and an elite leaderboard interface. Synthesized effects are included. The BGM toggle requires an owner-supplied music file; music and the calibration illustration are excluded from this public release because redistribution rights are unconfirmed.

[Existing hosted game](https://sean-xzx.github.io/wangravity/) is a separately deployed build: it does not prove cloud synchronization works or the latest source is deployed.

![Mobile 3D result screen](docs/images/summary.png)

Actual Chromium mobile-viewport screenshot from the fresh remote clone's controlled six-map verification. The displayed time/rating use test-only goal setup, not a human record or evidence of global cloud synchronization.

| Map | Time per attempt | Life rating budget | Coins | Additional mechanics |
| --- | --- | --- | --- | --- |
| Tutorial | 24 s | 2 | 0 | Basic movement and exit |
| 1 | 36 s | 3 | 0 | Corridor maze |
| 2 | 48 s | 4 | 2 | Static traps |
| 3 | 72 s | 5 | 2 | Static and patrolling traps |
| 4 | 144 s | 15 | 2 | Traps; portals activate after all coins |
| 5 | 216 s | 30 | 3 | Patrolling/chasing traps; portals active at entry |

Three rating conditions: reaching the exit, collecting every coin, and staying within the life budget. Used lives are deaths plus one. A previous successful clear unlocks challenger mode and grants the life condition automatically. Time orders elite records, not a separate rating star. Coins are optional for clearing. Switching maps resets that map's death count. Failure resets its countdown and coins without showing the tip again.

## Requirements

- Verified locally: Windows, Node.js 22.23.2, npm 10.9.8. Use Node.js 22.12 or newer; `.nvmrc` selects the tested version.
- Also verified in GitHub Actions: Ubuntu 24.04 with the same Node.js/npm versions; see the CI badge and validation log.
- Git must be on PATH for cloning and the release preflight.
- Internet for initial npm install and Chromium download. No paid service is required for local play or automated verification.
- Keep ports 4195 and 4196 free for browser and isolated development-API tests, respectively.
- Canvas-capable browser; full graphics additionally need WebGL. Chromium is the automated target.
- Phone tilt requires a physical sensor, HTTPS and browser permission. A phone's LAN HTTP URL is not a secure sensor origin. Physical Android/iOS behavior has not been verified in this cleanup.

## Quick Start

```bash
git clone https://github.com/Sean-xzx/cube-ball-maze-Wangravity.git
cd cube-ball-maze-Wangravity
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://127.0.0.1:5173/`. Click Start, enter a nickname, optionally choose a ball color, and confirm calibration. Dismiss the tutorial tip to start its countdown. Use arrow keys or WASD; touch devices can drag inside the maze. Walls may guide the ball. Enter the black exit: success shows elapsed time, best time, coins, used lives and rating. The level menu opens all six maps. Opening the leaderboard pauses play and the countdown.

Do not expose the development server or its unauthenticated data API to the Internet. A nickname is a lookup key, not authentication: never enter a real password.

## Build and Verify

```bash
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

Open `http://127.0.0.1:4173/` for built assets. Browser verification starts its own preview on port 4195; keep it free. A passing run reports `PASS desktop-3d`, `PASS mobile-3d` and `PASS mobile-lite`. Screenshots go to ignored `test-results/`. Controlled debug state exercises the exit path; this is not a timed human playthrough. External services are mocked as unavailable; no test scores reach the shared cloud. See [validation evidence and limits](docs/VALIDATION.md).

For a smaller clean-checkout smoke run after building, use `npm run test:browser -- --lite`; it checks only the lightweight scenario. Full desktop 3D verification can take several minutes with software GPU rendering.

Append `?quality=lite` for Canvas 2D or `?quality=auto` for automatic lightweight rendering on small/touch screens. The ordinary URL selects 3D, falling back to 2D if initialization fails.

## Configuration and Resources

Gameplay needs no `.env`. Legacy cloud defaults are disabled and contain no write credential. Never put private write credentials in browser JavaScript. [Resources and rights](docs/RESOURCES.md) lists optional music/icon restoration paths and checksums. The game runs without them, but BGM is silent and the calibration illustration is unavailable. Local account/leaderboard JSON is private operational data, excluded from publication; the development API creates a missing `data/` directory when first written.

Browser `localStorage` saves nickname, avatar, best times, leaderboard cache and BGM preference. Legacy `wristbound-*` keys remain for compatibility; clear site storage for an empty profile. Vite development middleware exposes `/api/player/:name` and `/api/leaderboard/records` backed by local JSON. These APIs are absent from `vite preview` and static hosting. Cloud merge code is a prototype: this cleanup does not certify global persistence, security or availability. A saved profile does not resume ball position or an in-progress timer.

On 2026-10-08 the former cloud read endpoint returned HTTP 404; its defaults were subsequently disabled. No external writes were tested. The game UI is primarily Chinese. Shared global accounts/leaderboards require a separately implemented authenticated backend; static hosting alone does not provide them.

## Structure and Data Flow

```text
index.html + style.css -> src/main.js -> Game.js
InputManager -> tilt/drag/keys -> Physics -> position/collision events
LevelData -> Game + Physics + Renderer/LiteRenderer
Game -> HUD/results + AudioManager + Transition + local/network storage
vite.config.js -> dev-only APIs; Vite -> dist/ static build
tests/ + scripts/ -> verification; .github/workflows/ci.yml -> CI
```

`Game.js` owns state, timers, mechanics and persistence. `Physics.js` is a 2D simulation independent of graphics. `Renderer.js` visualizes it in Three.js; `LiteRenderer.js` draws the same game on Canvas. `Transition.js` animates a CSS cube between maps, separately from Three.js. [Architecture](docs/ARCHITECTURE.md) explains files and relationships.

## Known Limits and Status

This personal project has no maintenance SLA. Maps, physics and rendering are preserved; security-only changes disable legacy cloud defaults and restrict the development server. No rotating gates are active. The leaderboard retains up to 50 records per map, one best entry per normalized nickname. It is not authenticated or protected against cheating. Global touch-scroll prevention can interfere with mobile leaderboard scrolling.

After compatible dependency updates, npm audit reported zero known vulnerabilities on 2026-10-08 (Vite 8.3.3; Three.js remains 0.184.0). This is not proof that all application vulnerabilities are absent. The dev server defaults to loopback; its API rejects cross-origin requests, non-JSON writes and bodies above 64 KiB, but is still not a production service. The 3D build has a chunk-size warning. Websites cannot force hardware vibration intensity; browser support varies. Sensors, vibration, perceived audio balance and mobile performance need real-device checks. Older repositories/deployments may still expose the former capability; revocation is unverified. See [security notes](SECURITY.md) and [handoff](docs/DELIVERY_HANDOFF.md).

## Development and Feedback

Run tests and browser checks before changes. `window.__cubeMazeGame` is an internal debug handle, not a stable API. Report issues via [GitHub Issues](https://github.com/Sean-xzx/cube-ball-maze-Wangravity/issues) with device/browser, map, steps and expected/actual behavior; remove secrets from logs. Preserve map/physics behavior unless a gameplay change is intended. CI checks tests, builds, browser flows and release gates. A locally configured workflow is not a successful remote run.

## License and Credits

Code uses the owner-confirmed [MIT License](LICENSE). The owner's music/icon originals are preserved privately, not distributed or licensed by this release. See [resource provenance](docs/RESOURCES.md). [Three.js](https://github.com/mrdoob/three.js), [Vite](https://github.com/vitejs/vite) and [Playwright](https://github.com/microsoft/playwright) retain their upstream licenses.
