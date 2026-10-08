# Resources / 资源

Status: PENDING_OWNER_CONFIRMATION

Publication disposition: both original binaries are excluded from the new public repository and ignored by Git. They remain in the owner's local workspace/private backup. No download link is provided because redistribution permission cannot be verified. All gameplay and synthesized effects work without them; BGM is silent and the calibration illustration is unavailable.
发布处理：两个原始二进制文件不包含在新公开仓库中，已由 Git 忽略，本地工作区和私有备份保留。未提供下载链接，避免分发权不明的资源。缺少它们不影响玩法和合成音效，但 BGM 静音、校准插图不可用。

The owner confirmed MIT for code. Both assets were supplied in the original project, but creator, original source and public redistribution rights remain unconfirmed. Existing public availability is not proof of permission. Keep private backup copies; do not publish anew before clearance. Do not delete or replace them silently.
代码 MIT 已确认。现有资源由所有者提供，但作者、来源和公开分发权待确认；已有公开仓库不证明授权，不擅自删除替换。

| Path | Use | Bytes | SHA-256 |
| --- | --- | --- | --- |
| public/audio/pixel-city-beat.mp3 | Looping BGM / 背景音乐 | 2360118 | 269ed91cc7def8ecf3de70696c291fb16feb300a76adb5c9d018045b86558940 |
| public/images/wristbound-icon.png | Calibration icon / 校准图标 | 1435531 | 2c929210e3bc4dc6b60df9fdbf4b3e880a4cd11ff24272345da4fe460a425a23 |

No extra model/data download is needed. Vite copies public assets unchanged to dist/audio and dist/images; deployed URLs omit public/. Balls/coins/holes/portals are procedural drawings/geometry; event sounds are synthesized.
无需额外模型或数据下载；资源由 Vite 原样复制，部署 URL 不含 public/。其他游戏物体由代码绘制，事件音效为合成音效。

Player/account JSON is operational data, not anonymous demo assets. Preserve privately; tests use synthetic names and isolated storage.
玩家 JSON 不是匿名样例，私有保留；测试使用虚构昵称和隔离存储。

## Restore Optional Assets / 恢复可选资源

If you have lawful access to the owner's files, copy them to the exact paths in the table, verify SHA-256, then rebuild with npm run build. Alternatively supply your own licensed MP3/PNG at those paths; its checksum will differ and should be documented. Optional assets are ignored and must not be committed before their public redistribution rights are confirmed. No optional model or private account data is required for the six-map test suite.
合法取得所有者文件后，复制到表中指定路径，核对 SHA-256，再执行 npm run build。也可在相同路径使用有授权的自有 MP3/PNG，其校验值不同，应另行记录。可选资源被忽略，未经公开分发授权确认不得提交。六关测试不需要模型或私人玩家数据。

Dependencies retain upstream licenses: [Three.js](https://github.com/mrdoob/three.js/blob/dev/LICENSE), [Vite](https://github.com/vitejs/vite/blob/main/LICENSE), [Playwright](https://github.com/microsoft/playwright/blob/main/LICENSE). Preserve applicable notices when redistributing dependencies.
