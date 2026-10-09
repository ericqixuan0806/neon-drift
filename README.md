# Neon Drift

当前项目源码是 [`neon-drift.html`](./neon-drift.html)，这是一个自包含的 Canvas 网页游戏，直接用现代浏览器打开即可运行。项目在 GitHub Pages 上部署时由 [`index.html`](./index.html) 转到游戏入口。当前没有构建步骤或依赖安装流程；游戏字体会尝试从 Google Fonts 加载，离线时会回退到系统字体。

在线游玩：[Neon Drift](https://ericqixuan0806.github.io/neon-drift/)。源码仓库：[ericqixuan0806/neon-drift](https://github.com/ericqixuan0806/neon-drift)。

持续 UI 修改请遵循[视觉规范](./design/Neon%20Drift%20Visual%20Style%20Guide.docx)。

游戏记录、设置、解锁内容和分数保存在浏览器 `localStorage` 中。清除浏览器站点数据会清除这些记录。

菜单中的飞船按钮可循环切换 Classic、Ember、Mint、Violet、Gold 五种基础配色；Rose、Ice、Lime 三种成就涂装仍按原条件解锁。配色和发光遵循视觉规范。

存档使用版本化校验；可识别的旧格式会自动迁移。遇到损坏、较新版本或浏览器存储不可用时，游戏会保留原始数据并以只读方式运行。可以在“设置”中导出存档恢复文件。每日挑战、任务和登录连续天数统一按 UTC 日期计算。

浏览器禁止访问 `localStorage` 时，游戏仍可启动和运行，但进度不会写入。系统启用“减少动态效果”时会关闭装饰动效、震屏、升级闪白和死亡慢放；运行中修改系统偏好也会即时应用。键盘聚焦画布时显示金色轮廓，Tab 可进入可访问操作区。

菜单和暂停页会提示转向、技能及危险/奖励颜色。按 Tab 可打开语义操作区，通过键盘完成升级/技能购买、商店与关卡翻页、使用技能、继续首领战和重试；按钮会说明价格、等级、拥有或冷却状态。结果摘要会读出本局分数、金币、时间和关卡。

运行轻量语法、存档和游戏状态回归检查：

```sh
node --test tests/save-state.test.cjs
```

设备手感、浏览器触控表现、商店购买与刷新后恢复仍需在目标浏览器手动验收。

当前进度与代码检查结论见 [`.agent/PROJECT_STATE.md`](./.agent/PROJECT_STATE.md)，近期任务见 [`.agent/ROADMAP.md`](./.agent/ROADMAP.md)。
