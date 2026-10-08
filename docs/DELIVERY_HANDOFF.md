# Organization Handoff / 整理交接

The new public repository is `Sean-xzx/cube-ball-maze-Wangravity`, with owner-confirmed MIT for code. The old `wangravity` repository and deployed game are separate and are not renamed, deleted or rewritten. The new repository starts from a sanitized snapshot, not the old history containing a write capability and real player records.
新公开仓库为 `Sean-xzx/cube-ball-maze-Wangravity`，代码 MIT 已确认。旧 `wangravity` 仓库和现有网站独立保留，不重命名、删除或重写。新仓库从清理后的快照开始，不继承含写入能力和真实玩家记录的旧历史。

This replaces the outdated handoff. The original remains in the owner's private backup. Historical claims that coins lock the exit, failures return to level one, and cloud features need no backend do not describe the current source.
本文替代过期说明，原文保存在私有备份。旧文中的金币锁出口、失败回第一关、云端不需后端等说法与当前代码不符。

## Baseline / 对照

- Source baseline: Sean-xzx/wangravity main, c6ae20e318d9779aa47d1fd4fd1e6ecd683f7467.
- The desktop directory was absent; the previously verified complete source copy was restored before editing.
- Original player JSON and media are preserved privately and excluded from the published tree.
- The owner's follow-up authorized security work: only cloud defaults in Game.js and development API/server configuration are changed. Maps, physics, graphics, audio logic, transitions, input and rating rules are preserved.
- Compatible dependency updates resolve the four known audit findings; lockfile records exact versions.
- Original history is preserved privately; the new repository has a clean initial history. No force-push or remote history rewrite.

原目录缺失，整理前恢复了与远程一致的副本。后续授权安全处理：仅修改 Game.js 的云端默认配置和开发接口/服务器配置，兼容更新依赖；地图、物理、渲染、音频逻辑、转场、输入与评级规则不变。玩家和媒体原件私有保留。旧历史保留，新仓库使用干净初始历史，不强推。

## Release Gate / 发布条件

1. Owner-confirmed MIT code license is added.
2. Music/icon rights remain unconfirmed; binaries are excluded, not silently relicensed. Optional restoration steps and checksums are in [RESOURCES.md](RESOURCES.md).
3. Cloud defaults are removed from the new client. Revocation/rotation at the old service remains unverified; old histories/deployments are not claimed safe.
4. Actual player JSON is no longer tracked, but private originals are not deleted.
5. Release preflight checks current tracked files; additionally inspect the new repository's clean history before pushing.
6. Verify remote commit, both README pages, CI and a fresh clone; results belong in [VALIDATION.md](VALIDATION.md). This is source publication, not a new Pages deployment.

凭据须撤销或轮换，不能只删除当前文件就宣称历史风险解决。玩家记录保留在私有备份，不能重新公开上传。源码发布与网站部署分开核实。

## References / 导航

- [English](../README.md), [中文](../README.zh-CN.md)
- [Architecture / 架构](ARCHITECTURE.md)
- [Validation / 验证](VALIDATION.md)
- [Resources / 资源](RESOURCES.md)

A local commit is not a remote upload; a local workflow is not a successful remote CI run.
本地提交不能记为已上传，本地工作流不能记为远程检查通过。
