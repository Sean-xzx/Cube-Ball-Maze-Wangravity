[简体中文](README.zh-CN.md) | English

# Cube-Ball-Maze-Wangravity

A browser steel-ball maze combining tilt control, route planning and replay challenges. A personal game project exploring how physical interaction becomes a complete, testable web experience.

[![Validate game](https://github.com/Sean-xzx/Cube-Ball-Maze-Wangravity/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Sean-xzx/Cube-Ball-Maze-Wangravity/actions/workflows/ci.yml)

## Value

Six handcrafted maps bring a tilt-ball maze into the browser without a native app, progressing from basic movement to moving traps, coins and paired portals. Calibration, tips, results and best-time records turn movement into a repeatable challenge; keyboard and touch provide alternatives to phone sensors.

## My Contribution

- **Gameplay and product decisions:** directed iterative requirements for level progression, coin/portal rules, life-based ratings, calibration and leaderboard presentation.
- **Interaction and integration:** brought movement, transitions, nickname/color-avatar profiles, timed attempts and results into one playable flow, with persistent local best records.
- **Delivery and verification:** drove repository organization and reproducible checks for maps, physics, storage and browser flows. Implementation and verification used code assistance; third-party libraries are not claimed as original work.

## Methods

- **Unified input:** calibrated device orientation/motion, touch dragging and keys feed the same movement interface, mapping phone posture to fine ball control.
- **Separated simulation and graphics:** 2D acceleration, friction and collisions supply shared state to Three.js and Canvas renderers, without duplicating gameplay rules.
- **State-driven feedback:** hints, play, failure, results and leaderboard pauses coordinate timing and progression. Coins, life budgets and best times add goals beyond finding the exit.

These are engineering design choices, not claims of a new physics algorithm or experimentally established research novelty. [Architecture and exact gameplay rules](docs/ARCHITECTURE.md).

## Evidence

- **17 automated tests passed:** map invariants, physics events, isolated development-API persistence/errors, and repository/documentation contracts.
- **Six-map browser verification passed** in desktop 3D, mobile-viewport 3D and mobile Canvas modes: startup, input, leaderboard pause, nonblank rendering and results.
- Verified on **Windows and Ubuntu 24.04**, Node.js 22.23.2 / npm 10.9.8. [Successful remote CI](https://github.com/Sean-xzx/Cube-Ball-Maze-Wangravity/actions/runs/37741557408); [evidence and limits](docs/VALIDATION.md).

![Verified mobile-viewport result screen](docs/images/summary.png)

Actual Chromium screenshot from a fresh remote checkout. Test-only goal setup exercises results; the displayed time is **not** a human record. No user study, performance benchmark or production cloud-service result is claimed. The [existing hosted game](https://sean-xzx.github.io/wangravity/) is a separate deployment, not proof that this repository's latest version is deployed.

## Run

Use Node.js 22.12+ (`.nvmrc`: tested 22.23.2), npm and Git. Installation needs Internet; local play needs no paid service.

```bash
git clone https://github.com/Sean-xzx/Cube-Ball-Maze-Wangravity.git
cd Cube-Ball-Maze-Wangravity
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://127.0.0.1:5173/`: start, choose a nickname/avatar, calibrate, then dismiss the tip. Move with arrows/WASD or touch dragging. Enter the black exit: results should show time, best time, coins, lives and rating. All six maps are selectable; the leaderboard pauses play/countdown. Append `?quality=lite` for Canvas or `?quality=auto` for small-screen/touch automatic selection; the ordinary URL uses 3D with an initialization-failure fallback.

Phone tilt needs a sensor, HTTPS and permission; LAN HTTP is insufficient. Physical Android/iOS sensors, vibration, audio balance and sustained mobile performance are **unverified**. Never expose the development server online or enter a real password: nicknames are lookup keys, not authentication.

## Verify

```bash
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

Expected: tests/build succeed; browser checks report `PASS desktop-3d`, `PASS mobile-3d` and `PASS mobile-lite`. Open `http://127.0.0.1:4173/` for built assets. Keep test ports 4195/4196 free; full software-GPU checks can take several minutes. Screenshots stay in ignored `test-results/`; tests disable external writes. `npm run test:browser -- --lite` is a smaller check, not a substitute for all modes.

## Details and Limits

Entry: `index.html` → `src/main.js` → `Game.js`; input → physics → rules/UI → renderer. No `.env` is needed. Browser storage preserves nickname, avatar and best records, not an active attempt. Vite's local JSON APIs exist only during development, not preview/static hosting. **Authenticated global accounts, secure shared rankings and anti-cheat are not implemented as a production service.**

Optional music/illustration and real player JSON are excluded from this public release; synthesized effects and core gameplay remain. See [resources and restoration](docs/RESOURCES.md), [architecture](docs/ARCHITECTURE.md), [validation](docs/VALIDATION.md) and [security](SECURITY.md). The 3D build has a chunk-size warning; mobile leaderboard scrolling has a touch-handler limitation. This personal prototype has no maintenance SLA. Report reproducible problems via [Issues](https://github.com/Sean-xzx/Cube-Ball-Maze-Wangravity/issues).

## Rights and Credits

Copyright © 2026 Sean-xzx. **All rights reserved for author-owned code and documentation in the current version. No open-source license is granted.** Use, modification, redistribution and commercial use require prior written permission, except rights provided by law or GitHub's platform terms. Public visibility does not grant general reuse/modification permission; GitHub may still permit on-platform viewing/forking.

Earlier commits were published under MIT; this notice does **not** revoke permissions already granted for those versions. [Three.js](https://github.com/mrdoob/three.js), [Vite](https://github.com/vitejs/vite) and [Playwright](https://github.com/microsoft/playwright) retain their own licenses. Media redistribution rights are separate and unconfirmed; see [resource provenance](docs/RESOURCES.md).
