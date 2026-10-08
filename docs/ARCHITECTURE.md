# Architecture / 架构

Public-release note: original player JSON and optional MP3/PNG are preserved locally but excluded from the public tree. The dev API initializes missing data on first write; optional media restoration is documented in RESOURCES.md. Legacy mock-cloud defaults are now empty. Dev middleware is loopback-only by default, with same-origin/JSON/64 KiB request checks. These security changes do not alter maps, physical simulation, graphics or rating rules.
公开版本说明：原始玩家 JSON 和可选 MP3/PNG 私有保留，不包含在公开文件树中。开发接口首次写入会初始化缺失数据，可选媒体恢复方式见 RESOURCES.md。历史云端默认地址已清空；开发中间件默认仅监听本机，并限制同来源、JSON 和 64 KiB 请求。这些安全改动不改变地图、物理、画面或评级规则。

## Collaboration / 协作

HTML loads CSS and main.js; main constructs Game. Each frame InputManager produces gravity, Physics computes position/collisions, Game handles rules/UI, and a renderer draws shared state. Audio responds to events. This is 2D physical simulation with 3D graphics, not a 3D rigid-body engine.
每帧由输入、物理、玩法处理、绘制依次协作。音频响应事件。物理是二维，Three.js 提供三维画面。

| File | Responsibility and relationships / 职责与关系 |
| --- | --- |
| index.html | Page/HUD/modals; DOM IDs read by main/Game; references CSS/entry / 页面骨架 |
| style.css | Theme, responsive layout, fixed status slots, CSS cube; not playable wall data / 外观布局 |
| src/main.js | Creates Game, start/restart/resize bindings, debug handle, global touch-scroll prevention / 启动 |
| src/Game.js | State, timers, rating, coins, hazards, portals, DOM and persistence; imports all modules, dynamically loads 3D Renderer / 总调度 |
| src/LevelData.js | Six grids/palette/patrols/portals; read by Game, Physics and renderers / 地图数据 |
| src/Physics.js | Acceleration/friction/collisions/events/falling; no DOM or Three.js / 二维物理 |
| src/Renderer.js | Three.js geometry/materials/lights/effects; draws physics state / 三维渲染 |
| src/LiteRenderer.js | Canvas map cache/interpolation; same renderer-facing methods / 轻量渲染 |
| src/InputManager.js | Sensor permission/calibration, orientation mapping, touch, keys; priority: active touch, gyro, keys / 输入 |
| src/AudioManager.js | MP3 BGM and synthesized event sounds; rolling update disabled / 音频 |
| src/Transition.js | CSS six-face cube between maps; independent of Three.js / 转场 |
| vite.config.js | Relative build base; Node filesystem-backed API via configureServer only / 构建与开发接口 |
| package.json | Commands/dependencies; private means no npm publishing, not a private repository / 项目声明 |
| package-lock.json | Exact npm dependency graph for npm ci / 依赖锁 |
| .nvmrc | Tested Node version; read by CI / 版本 |
| .gitignore | Generated/private exclusions; does not untrack committed files / 忽略规则 |
| config.yml | Existing empty {}; no code reference found; retained / 空配置保留 |
| data/elite-leaderboard.json | Mutable local leaderboard, dev API storage; not automatic cloud data / 本地榜单 |
| data/player-accounts.json | Mutable real player profiles, dev API storage / 本地档案 |
| public/audio/pixel-city-beat.mp3 | BGM, copied to dist/audio; loaded by AudioManager / 背景音乐 |
| public/images/wristbound-icon.png | Calibration illustration, copied to dist/images; start maze uses CSS instead / 校准插图 |
| README.md and README.zh-CN.md | Equivalent entry documentation / 双语说明 |
| docs/DELIVERY_HANDOFF.md | Baseline and release conditions / 交接 |
| docs/VALIDATION.md | Evidence and reproduction boundaries / 验证 |
| docs/RESOURCES.md | Resource provenance/checksums/rights / 资源 |
| tests/*.test.js | Real map/physics/document/API contracts / 测试 |
| scripts/browser-smoke.mjs | Built-preview UI/pixel checks; network isolated; local screenshots / 浏览器验收 |
| scripts/check-release.mjs | Fails on exposed writes, real records, missing rights clearance / 发布门槛 |
| .github/workflows/ci.yml | Tests/build/browser/release checks; no deployment job / 自动检查 |
| LICENSE | Owner-confirmed MIT for code; not third-party asset authorization / 代码许可 |

## Important Contracts / 关键关系

- All six maps are bounded 15 x 15 grids. Zero-based row 6/col 3 (user row 7/col 4) is road in level 5.
- STAR/getStarPositions/collectedStars are legacy coin names. Rating stars are separate.
- Game clones map data; collecting coins edits the runtime clone. Failure resets ball/map/hazards/countdown but retains per-map deaths. Map selection resets per-map deaths.
- Level 4 portals activate after all coins; level 5 starts active. Transfer has a cooldown and requires leaving the arrival area. No rotating gate is configured.
- States include START, HINT, PLAYING, FALLING, DEAD, SUMMARY, LEADERBOARD and COMPLETE. CSS transition is coordinated during summary continuation; enum names alone do not prove active behavior.
- Tips/leaderboard pauses are excluded from countdown and elapsed timing. Per-map elapsed time can span failed attempts.
- LocalStorage and development JSON are separate stores. Cloud code merges whole snapshots without password authentication, transactional concurrency or server score validation. Saved lastLevel is not used to resume a live attempt.

坐标从零开始，金币内部英文名为历史兼容命名。运行地图副本与模板分开。两个本地存储体系与云端原型不能混为安全账号服务；档案不会恢复正在进行的局。
