# Validation / 验证

## Baseline and Environment / 对照与环境

On 2026-10-08, source c6ae20e318d9779aa47d1fd4fd1e6ecd683f7467 matched GitHub in all 22 files. Full private file backup and original Git history bundle preceded manual edits.
修改前，22 个文件与远程一致，保存了完整私有备份和历史 bundle。

- Windows, Node.js 22.23.2, npm 10.9.8.
- Preserved Vite 8.0.14 / Three.js 0.184.0 lock.
- Playwright 1.62.1 and downloaded Chromium for desktop/mobile-viewport emulation.
- Initial local checks did not verify Linux. The later public-release Linux CI result is recorded below.

## Initial Organization Results (Before Security Release) / 安全处理前的整理结果

- Baseline npm ci and npm run build: passed. Renderer chunk-size warning remains.
- npm audit: four high-severity findings; no automatic dependency upgrade. Keep the dev server private.
- Post-organization npm test: 15 tests passed, 0 failures, including isolated API persistence and bilingual documentation checks.
- Post-organization npm run build: passed; original generated asset names and dependency versions remained unchanged.
- SHA-256 comparison: all 16 protected source, data and asset files are byte-identical to the backup.
- Desktop 3D, mobile-emulated 3D and lightweight browser scenarios: all passed for all six maps, including startup, input, paused leaderboard, nonblank canvas pixels, summaries and completion.
- Original Git history: both existing commits contain the cloud write capability. Its revocation has not been verified; latest-file removal alone cannot resolve the exposure.
- Default external cloud read endpoint: HTTP 404 on 2026-10-08. Only a read request was sent; no external account/leaderboard write or delete occurred.
- Isolated fresh clone of local commit 49b3685eb357f93dac11dcd5778126a8cfc40b54: npm ci, 15 tests, production build, explicit Chromium installation and lightweight six-map browser verification all passed. All six generated build files matched the main workspace byte-for-byte.
- Publication preflight: failed as intended for exposed write access, tracked player records and unconfirmed asset rights. Nothing was pushed; remote main remains c6ae20e. Remote README rendering and CI are therefore not verified for the organized version.

整理后 15 项测试通过，构建通过；16 个受保护文件逐字节未变。桌面 3D 和移动视口两种渲染模式六关均通过。历史两次提交也含云端写入能力，撤销状态未知。
默认云端读取返回 404，仅发送读取请求，没有写入或删除外部账号/榜单。
从本地提交 49b3685 克隆的隔离副本重新安装依赖，15 项测试、构建、显式安装 Chromium 以及轻量模式六关验收均通过，6 个构建文件逐字节一致。此副本来自本地提交，不是已发布的远程整理版本。
发布检查因凭据、已跟踪玩家数据、未确认资源权利而失败；未推送，远程 main 仍为 c6ae20e，未验证整理版远程 README 与 CI。

## Checks / 检查内容

### Project Name Update / 项目名称更新

On 2026-10-08, the requested project name was updated to `cube-ball-maze-Wangravity`; the npm identifier is lowercase. Repository metadata, clone instructions and issue links now target the new repository. The existing hosted game URL and original remote are unchanged.

- Before-edit backup: private storage outside the repository, including all 35 tracked files and a Git history bundle. The owner received its absolute path separately.
- After the metadata/documentation update: 16 tests passed, production build passed, and the mobile-lite browser scenario passed all six maps.
- All 16 protected files remained byte-identical to this backup; generated build asset names remained unchanged.
- A fresh private local clone of commit `ae3de0e41ef6e5db76a69d67a1d5c048a07f082b` passed npm ci, all 16 tests, production build and the lightweight six-map browser check. All six generated files matched the workspace by SHA-256. This is local-clone evidence, not remote publication evidence.
- New repository lookup returned 404. The connected GitHub tools have no repository-creation operation; the browser creation page requires sign-in. No new repository was created or pushed.

本轮仅修改项目名称、仓库元信息、说明和对应测试。修改前备份包含全部 35 个已跟踪文件与 Git 历史。16 项测试、构建及移动轻量模式六关验收通过；16 个受保护文件逐字节不变。新仓库查询返回 404，创建仓库页面尚需登录，未创建或推送新仓库。
从本轮本地提交 `ae3de0e` 获取的全新私有副本也通过依赖安装、16 项测试、构建及轻量六关检查，6 个构建文件哈希一致；不能将其描述为远程发布后的复现。

npm test covers map dimensions/symbols/edges, unique start/goal, topological target reachability, coins/restored corridor/inactive gates, portal copy isolation, patrol continuity, physical movement/speed/wall impacts, coin/goal/trap events, falling/teleport reset, bilingual commands/links and resources.

The API test copies the original development configuration to temporary isolated storage, verifies missing/invalid requests, best-only deduplication, case-normalized lookup, latest avatar and JSON persistence, then removes only that test fixture. It never edits the owner's data files. Keep port 4196 free for this test.
接口测试在临时隔离目录验证缺失/非法请求、最好成绩去重、大小写查询、最新头像及 JSON 持久化，之后只清理测试目录，不修改所有者数据。请保持 4196 端口空闲。

npm run test:browser opens built assets at desktop/mobile viewports; tests start/calibration/tips, key input, paused countdown, six-map selection, nonblank canvas pixels, three-star summaries and completion. Test-only debug setup bypasses hazard difficulty to deterministically exercise the goal/fall/summary path. This is not a human timed playthrough or proof of sensor fidelity. External services are mocked unavailable: no shared cloud writes.

Desktop headless verification limits requestAnimationFrame to 10 callbacks per second to bound software-GPU workload; mobile-emulated cases retain native scheduling. This test setup is not shipped in the application and is not a frame-rate benchmark. Screenshots pause the already-completed game's draw loop to avoid compositor timeout.
Desktop verification additionally uses deviceScaleFactor 0.5 with the original 1280 x 900 CSS viewport. Rendering is paused during test-only menu manipulation and result overlays; movement and leaderboard pause/resume assertions run with the original loop active and wait for actual state changes instead of assuming a 100 ms deadline. Mobile scenarios retain deviceScaleFactor 1.
桌面无头测试将动画回调限制为每秒 10 次，控制软件 GPU 的负担；移动视口保持原生调度。该设置不会进入游戏代码，也不用于测量帧率。截图时暂停已进入结算的绘制循环。
桌面保持 1280 × 900 CSS 视口，测试设备像素倍率为 0.5，降低软件光栅负担；测试操作菜单、结果遮罩时暂停绘制，移动与榜单暂停/恢复仍运行原循环并等待实际变化，不假定 100 毫秒完成。移动视口像素倍率仍为 1。

Canvas pixel inspection pauses the test session's draw loop; scripted goal setup then resets the frame clock and resumes the original loop. This excludes headless diagnostic latency from the attempt countdown. The leaderboard pause assertion runs separately with the loop active.
读取画布像素时暂停测试会话绘制，设置受控终点后重置帧时间并恢复原循环，避免无头诊断耗时触发超时。榜单暂停断言在原循环运行时单独验收。

npm run check:release must fail while embedded write capability, real player records or resource rights are unresolved. It does not revoke credentials, erase Git history, or inspect every deployed bundle.

测试直接调用原模块；受控通关用于验收事件与 UI，不伪装成完整人工通关。发布检查失败会阻止上传，不自动撤销凭据或清理历史。

## Not Verified / 未验证

- Physical Android/iOS sensors, permissions, calibration comfort, sustained mobile performance.
- Hardware vibration strength and subjective BGM/effect loudness.
- Secure accounts, cloud availability/consistency/concurrent updates and anti-cheat.
- Asset rights until owner confirmation.

## Security Release / 安全发布

The owner subsequently authorized publication and vulnerability remediation. A further private snapshot of all 35 tracked files and old history was made before changes. Legacy cloud defaults are empty; original player JSON and optional MP3/PNG remain private and are excluded from the new release. Old remote history is not rewritten, and the exposed capability's revocation is not verified.
所有者随后授权发布及漏洞处理；修改前再次私有保存全部 35 个已跟踪文件和旧历史。云端默认地址已清空，玩家 JSON 和可选 MP3/PNG 私有保留、新版本不分发。旧远程历史不重写，写入能力撤销状态未知。

- Vite 8.3.3, PostCSS 8.5.29, nanoid 3.3.20 and source-map-js 1.2.2; Three.js remains 0.184.0. npm audit reports 0 known vulnerabilities as of 2026-10-08.
- Development server is loopback-only by default. API tests cover rejected cross-origin writes (403), non-JSON writes (415), malformed JSON/routes (400), and oversized bodies (413), in addition to prior persistence behavior.
- New repository was created publicly under Sean-xzx with the requested name and relevant topic tags. Creation alone is not code upload or CI success.
- Security-only configuration changed Game.js and vite.config.js; all other original protected files remain unchanged locally, including private player/media files.

依赖审计已知漏洞为 0。开发接口除既有存储行为外，还验证跨来源、非 JSON、非法 JSON/路径和超大请求。新仓库已创建且公开，但创建不等于上传或 CI 通过。仅改动 Game.js 云端配置和 vite.config.js，其他受保护文件及私人原件保持不变。

### Remote Publication Verification / 远程发布验证

- Public snapshot commit `ecf6bacbf06096ff2585d5fdbc679107ffbb8fb3` reached main in `Sean-xzx/cube-ball-maze-Wangravity`. Owner, public visibility and main default branch were verified via GitHub. Its clean initial history excludes private data, original media, backups and old write capabilities.
- A fresh clone downloaded from GitHub passed npm ci, 17 tests, production build, explicit Chromium installation and all three browser scenarios (mobile-lite, mobile-3d, desktop-3d), six maps each. No external service writes occurred.
- Initial Linux CI failed because the test harness did not strip ANSI color codes from Vite startup output. Commit `0ddf9d9d33e343af15160f7450382804c9c37e1f` fixes only test startup parsing. Windows tests also passed with FORCE_COLOR=1. Its remote CI result must be checked independently.
- Subsequent Linux runs passed unit tests/build/release preflight but exposed software-GPU interaction delays and the fixed 100 ms resume assumption. The harness now uses state-based movement/resume waits and bounded desktop raster work, without changing the shipped game. Live CI evidence is linked from both README badges.
- Commit `216b73b7ba4676764b4cb60ae07a39d62a5489ea` passed the complete [GitHub Actions run](https://github.com/Sean-xzx/cube-ball-maze-Wangravity/actions/runs/37741060104) on Ubuntu 24.04, Node.js 22.23.2 and npm 10.9.8: npm ci, audit, 17 tests, build, release preflight, Chromium installation and all three six-map browser scenarios. The same remote checkout passed the full Windows browser run. Subsequent documentation commits are checked by the same workflow; the README badge reflects its latest result.
- Both README files include a genuine mobile-viewport result screenshot. Times are controlled test output, not measured human completion times. Optional media remains intentionally absent from the public release.

公开快照已到达新仓库 main，账号、可见性和默认分支已核实，初始历史不含私人数据、原始媒体、备份或旧写入凭据。从 GitHub 下载的全新副本通过依赖安装、17 项测试、构建、安装 Chromium 及三种浏览器模式的六关验收；没有写入外部服务。首轮 Linux CI 因测试启动输出的彩色控制码失败，已只修复测试解析并在 Windows 强制彩色输出下验证通过；新远程运行结果需独立核实。双语 README 包含真实受控截图，不伪装为人工通关用时。
提交 `216b73b` 的上述 GitHub Actions 已全部成功，在 Ubuntu 24.04、Node.js 22.23.2、npm 10.9.8 下完成安装、审计、17 项测试、构建、发布检查、Chromium 安装及三种模式各六关验收。同一远程副本在 Windows 完整浏览器检查也通过。后续文档提交仍由同一工作流检查，README 徽标显示最新结果。

真机硬件、音频听感、安全云服务、资源授权及发布后验证不能以本地静态或模拟测试代替。

## Reproduction / 复现

Follow the synchronized README command blocks. Browser tests require a build and Chromium download, use port 4195 and save ignored local screenshots. Resolve release gate failures before pushing; do not bypass them.
按双语 README 同步命令运行，先构建和下载 Chromium。截图在忽略目录，发布失败先解决原因。

For an isolated fresh-checkout minimum, run npm ci, npm test, npm run build and npm run test:browser -- --lite. This intentionally does not substitute for the full three-scenario browser run.
干净副本的最小验证依次执行 npm ci、npm test、npm run build、npm run test:browser -- --lite，不替代完整三场景验收。

There is no machine-learning/training pipeline. Maps are versioned source data. Decorative effects, synthetic noise, timestamps and frame scheduling are nondeterministic; validation checks gameplay contracts and nonblank images, not byte-identical screenshots or human completion times.
没有机器学习或训练流程。地图随源码固定版本；装饰、合成噪声、时间戳和帧调度并非确定过程，因此验收规则和非空画面，不要求截图逐字节一致，也不推断人工通关用时。
