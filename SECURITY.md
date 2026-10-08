# Security / 安全

This is a personal game prototype, not an authenticated account service. Never enter passwords or sensitive information as a nickname. Keep the development server and its JSON API on loopback; do not deploy Vite's development middleware as a public backend.
这是个人小游戏原型，不是安全账号服务。不要将密码或敏感信息作为昵称。开发服务器和 JSON 接口仅在本机使用，不要将开发中间件作为公网后端部署。

The release removes legacy embedded cloud defaults, excludes real player records, restricts dev API origin/content type/body size, and updates vulnerable dependencies. Account ownership, anti-cheat, transactional storage, rate limits and production authentication are not implemented. npm audit is a dependency check, not a comprehensive security audit.
本次发布移除历史云端默认地址、排除真实玩家记录，限制开发接口来源、格式和请求大小，并更新存在已知漏洞的依赖。账号所有权、防作弊、事务存储、限流及生产身份认证尚未实现。npm 审计不是完整安全审计。

Original local backups and the older repository/deployed bundles may contain an exposed write capability. They were not rewritten or deleted. Its revocation/rotation must occur at the original service; removing it from this new repository does not revoke it. Do not push the old Git history to this repository or publish local backups/builds containing excluded assets.
原始本地备份、旧仓库及旧部署可能含泄露的写入能力。本次不重写或删除它们。必须在原服务撤销或轮换；从新仓库移除不等于撤销。不要向本仓库推送旧历史，也不要发布含被排除资源的本地备份或构建。

For a vulnerability report, describe affected versions and reproduction steps without posting credentials or player data in public Issues. No response-time or long-term maintenance guarantee is made.
反馈漏洞时说明版本和复现步骤，不要在公开 Issues 张贴凭据或玩家数据。不承诺响应时限或长期维护。
