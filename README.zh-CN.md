[English](README.md) | 简体中文

# cube-ball-maze-Wangravity

个人网页迷宫小游戏：通过手机倾斜、触控拖动或桌面按键，引导钢球到达终点。

仓库/项目名称为 `cube-ball-maze-Wangravity`，npm 包名称为 `cube-ball-maze-wangravity`。游戏内 WANGRAVITY 品牌和历史存储/资源名称保持不变，以保留核心行为。

## 范围与功能

这是一个原生 JavaScript 小游戏，不是通用引擎或生产级账号服务。包含教学关和五张手工制作的 15 × 15 地图、Three.js 画面、可选 Canvas 2D 渲染、水平校准、金币、固定/巡游/追踪陷阱、双向传送门、单次尝试倒计时、结算、本地最好成绩和精英榜单界面。包含合成音效；BGM 开关需要所有者提供音乐文件。音乐和校准插图因分发授权未确认，不包含在公开版本中。

[现有在线游戏](https://sean-xzx.github.io/wangravity/)是单独部署的版本，不能据此证明云端同步正常或最新源码已经部署。

| 地图 | 单次尝试时间 | 生命评级额度 | 金币 | 附加机制 |
| --- | --- | --- | --- | --- |
| 教学关 | 24 秒 | 2 | 0 | 基础移动与终点 |
| 第 1 关 | 36 秒 | 3 | 0 | 回廊迷宫 |
| 第 2 关 | 48 秒 | 4 | 2 | 固定陷阱 |
| 第 3 关 | 72 秒 | 5 | 2 | 固定与巡游陷阱 |
| 第 4 关 | 144 秒 | 15 | 2 | 陷阱；收齐金币后激活传送门 |
| 第 5 关 | 216 秒 | 30 | 3 | 巡游/追踪陷阱；入场即有传送门 |

三项评级条件：到达终点、收齐金币、生命消耗不超额度。使用生命数为死亡次数加一。该关曾成功通关后进入挑战者模式，生命条件默认达标。用时决定榜单排序，不是独立评级星。金币不是通关必需条件。切换地图会重置该关死亡统计。失败重置倒计时和金币，不再显示提示。

## 环境要求

- 已验证本地环境：Windows、Node.js 22.23.2、npm 10.9.8。使用 Node.js 22.12 或以上；`.nvmrc` 指定本次验证版本。
- 获取代码和发布预检查需要 Git 位于 PATH。
- 首次安装 npm 依赖和下载 Chromium 需要联网。本地游玩和自动验证不需要付费服务。
- 浏览器和隔离开发接口测试分别需要 4195、4196 端口空闲。
- 浏览器须支持 Canvas；完整画面还需要 WebGL。自动化测试使用 Chromium。
- 手机倾斜需要实际传感器、HTTPS 和浏览器授权。手机访问局域网 HTTP 地址不满足传感器安全要求。本次整理没有验证 Android/iOS 真机行为。

## 快速开始

```bash
git clone https://github.com/Sean-xzx/cube-ball-maze-Wangravity.git
cd cube-ball-maze-Wangravity
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

打开 `http://127.0.0.1:5173/`。点击开始，输入昵称，可选择小球颜色，然后完成校准。退出教学提示后开始倒计时。桌面使用方向键或 WASD，触屏可以在迷宫内拖动。可以利用墙壁引导钢球。进入黑色终点洞后显示用时、最好成绩、金币、生命消耗和评级。关卡菜单可以打开全部六关。打开榜单会暂停玩法和倒计时。

不要把开发服务器或其未认证接口暴露到互联网。昵称只是查询键，不是身份认证，不要输入真实密码。

## 构建与验证

```bash
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

打开 `http://127.0.0.1:4173/` 查看构建后的网页。浏览器验证自行在 4195 端口启动预览，请保持空闲。成功时输出 `PASS desktop-3d`、`PASS mobile-3d` 和 `PASS mobile-lite`。截图保存在已忽略的 `test-results/`。测试使用受控调试状态触发终点，不是人工完整游玩或用时测评。外部服务被模拟为不可用，测试不会上传成绩到共享云端。详见[验证证据与边界](docs/VALIDATION.md)。

构建后可用 `npm run test:browser -- --lite` 做较小的干净副本验收，仅检查轻量模式。软件 GPU 下，桌面完整 3D 验证可能需要数分钟。

添加 `?quality=lite` 使用 Canvas 2D，或添加 `?quality=auto` 在小屏/触屏上自动选择轻量模式。普通地址选择 3D，初始化失败时回退 2D。

## 配置与资源

基础玩法不需要 `.env`。历史云端默认地址已禁用，不再包含写入凭据。不要将私有写入凭据放进浏览器 JavaScript。[资源与授权](docs/RESOURCES.md)记录可选音乐、图标的恢复路径与校验值。缺少这些资源时游戏仍可运行，但 BGM 静音、校准插图不可用。账号/榜单 JSON 属于私人业务数据，不公开上传；缺少 `data/` 时，开发接口会在首次写入时创建。

浏览器 `localStorage` 保存昵称、头像、最好成绩、榜单缓存和 BGM 偏好。保留历史 `wristbound-*` 键名以兼容存档，清除站点存储可获得空白档案。Vite 开发中间件提供 `/api/player/:name` 和 `/api/leaderboard/records`，以本地 JSON 存储；`vite preview` 和静态托管不提供这些接口。云端合并代码仍是原型，本次整理不保证全网持久化、安全性或可用性。存档不会恢复球的位置或正在进行的倒计时。

2026-10-08 检查时，旧云端读取接口返回 HTTP 404，随后禁用了默认地址。没有测试外部写入。游戏界面主要使用中文。全网账号和排行榜需要另行实现带身份认证的后端，静态托管本身不提供这些能力。

## 结构与数据流

```text
index.html + style.css -> src/main.js -> Game.js
InputManager -> 倾斜/拖动/按键 -> Physics -> 位置/碰撞事件
LevelData -> Game + Physics + Renderer/LiteRenderer
Game -> HUD/结算 + AudioManager + Transition + 本地/联网存储
vite.config.js -> 仅开发 API；Vite -> dist/ 静态构建
tests/ + scripts/ -> 验证；.github/workflows/ci.yml -> CI
```

`Game.js` 管理状态、计时、玩法和持久化。`Physics.js` 是独立于画面的二维模拟。`Renderer.js` 用 Three.js 展现它，`LiteRenderer.js` 用 Canvas 绘制相同玩法。`Transition.js` 在关卡间播放 CSS 立方体动画，与 Three.js 独立。[架构说明](docs/ARCHITECTURE.md)解释文件和关系。

## 已知限制与状态

这是个人项目，没有维护承诺。地图、物理和渲染保持原样；安全调整仅禁用旧云端默认地址、收紧开发服务器。没有启用旋转门。榜单每关最多 50 条记录，每个规范化昵称只保留一个最好成绩，没有身份认证或防作弊保护。全局阻止触摸滚动可能影响手机榜单滚动。

兼容范围内更新依赖后，2026-10-08 的 npm 审计报告 0 项已知漏洞（Vite 8.3.3，Three.js 仍为 0.184.0），不代表应用没有其他漏洞。开发服务器默认只监听本机；接口拒绝跨来源请求、非 JSON 写入和超过 64 KiB 的请求，但仍不适合作为生产服务。完整 3D 构建会产生代码块大小警告。网页不能强制硬件震动强度，浏览器支持情况不同。传感器、震动、音频听感和移动性能需要真机检查。旧仓库和部署可能仍暴露旧写入能力，其撤销尚未验证；详见[安全说明](SECURITY.md)和[交接说明](docs/DELIVERY_HANDOFF.md)。

## 开发与反馈

修改前运行测试和浏览器检查。`window.__cubeMazeGame` 是内部调试入口，不是稳定 API。在 [GitHub Issues](https://github.com/Sean-xzx/cube-ball-maze-Wangravity/issues)附上设备/浏览器、地图、步骤和预期/实际结果，日志需去除秘密。除非明确要改玩法，否则保持地图/物理行为。CI 检查测试、构建、浏览器流程和发布条件；本地有工作流不等于远程检查通过。

## 许可证与致谢

代码经所有者确认采用 [MIT 许可证](LICENSE)。所有者的音乐、图标原件私有保留，不随本次发布分发，也不由代码许可证授权。详见[资源来源](docs/RESOURCES.md)。[Three.js](https://github.com/mrdoob/three.js)、[Vite](https://github.com/vitejs/vite) 和 [Playwright](https://github.com/microsoft/playwright)保留上游许可证。
