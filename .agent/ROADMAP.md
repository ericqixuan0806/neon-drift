# Neon Drift 全面优化路线图

范围：继续维护唯一游戏源码 [`../neon-drift.html`](../neon-drift.html)，保持无需构建即可运行的单文件 Canvas 架构。修改仅限本项目目录。UI 依据 [`../design/Neon Drift Visual Style Guide.docx`](../design/Neon%20Drift%20Visual%20Style%20Guide.docx)。本轮按用户既有要求不使用 Astra；计划来自源码检查、当前项目记录和下列一手资料。

## 现状与研究结论

- 已有功能包括普通/每日挑战、六个主题、Boss、升级/技能、任务/成就、统计、八款飞船外观、设置、版本化存档和无障碍 DOM 控件。现有 15 项自动检查全部通过；已有自动检查覆盖了存档核心、状态切换、失焦清理、可访问控件和配色切换。
- 代码级缺口：`localStorage` 方法内部有异常处理，但访问浏览器全局 `localStorage` 属性本身未受保护；若浏览器/隐私策略让属性读取抛错，初始化仍会提前终止。系统减少动态效果只关闭了震屏，菜单滑动、拾取脉动、关卡闪光等非必要动效仍在运行。
- 交互风险：Canvas 显式移除了 outline，聚焦 Canvas 时没有明显焦点指示；现有 DOM 操作区可键盘访问，但未对这一入口做回归覆盖。画布交互依靠 Pointer Events，已有 pointercancel 和失焦清理，补足取消/resize/偏好设置回归检查。
- 视觉边界：深色太空底、青色安全/正向、粉色危险、金色奖励、Orbitron 与 Chakra Petch、彩色匹配辉光、画布逻辑缩放和安全区均为现有设计契约。优化不改变危险/奖励颜色语义，不凭静态审阅改变价格、难度或奖励节奏。
- 相似游戏参考：官方《Super Hexagon》页面将其描述为极简动作游戏；这支持保持“目标清楚、启动快、重开短”的街机主循环作为参考方向，但不构成它与 Neon Drift 的玩法/平衡相同的证据，也不据此抄用难度或内容。[Steam 官方页面](https://store.steampowered.com/app/221640/Super_Hexagon/)；[开发者官网](https://superhexagon.com/)
- 输入与适配：W3C WCAG 2.2 SC 2.5.8 将指针目标最小尺寸设为 24×24 CSS px，或满足规定间距例外；Microsoft Xbox Accessibility Guidelines 建议菜单和游戏输入可由单次数字输入操作，并提供合适的替代输入；MDN 说明 Pointer Events 统一鼠标、触屏和触控笔，`pointercancel` 也必须按中断处理。[W3C 目标尺寸](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)；[Xbox 输入指南](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/107)；[MDN Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)
- 生命周期：MDN 文档说明隐藏页通常暂停 `requestAnimationFrame()`；现有代码已在 `visibilitychange` 时暂停并释放输入，本轮将守住这个行为并验证窗口变化/取消事件路径。[MDN Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)；[MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- 减少动态效果：样式规范明确要求系统请求减少动态效果时不震屏；本轮将把系统偏好扩展至非必要 UI 动效，并保留躲避游戏本身必要的物体运动。[W3C 动画交互理解](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)

## 分阶段工作、验收和执行记录

### 阶段 0：建立可复现基线

- 确认项目唯一入口、源码、设计约束、自动检查和 GitHub Pages 仓库文件。
- 验收：现有 `node --test tests/save-state.test.cjs` 通过；GitHub `main` 的源码与本地基线一致后才更新文件。
- 结果：通过。15/15 自动检查通过。远端 `main` 仓库和 `index.html` 部署入口已读取；源码逐行比对确认只有本轮预期差异，没有发现远端额外编辑。

### 阶段 1：存档与浏览器能力容错

- 将 `localStorage` 全局获取集中成受保护的能力探测；属性不可访问时提供抛出型内存回退，使游戏可进入菜单/开局且不覆盖任何存档。
- 统一普通最佳分、每日最佳分、外观和正式存档写入所用的安全存储对象。
- 新增测试，覆盖 `localStorage` getter 抛错、读取/写入方法抛错、在内存回退下开始游戏，以及原有损坏数据不覆盖行为。
- 验收：脚本语法通过，针对场景全绿，现有存档恢复策略不回归。
- 结果：通过。16/16 自动检查通过；getter 抛错时进入只读模式，仍可开始游戏和切换本地内存外观，不写入存档。

### 阶段 2：减少动态效果和键盘焦点

- 系统 `prefers-reduced-motion` 开启时，关闭屏幕震动、装饰性拾取脉动、菜单滑入、关卡白闪和非必要慢动作；危险/奖励提示仍用既有形状、颜色与文本区分，躲避游戏必需运动照常。
- 为键盘聚焦的 Canvas 加上符合霓虹规范的可见焦点轮廓；保留隐藏 DOM 操作区聚焦后展开、金色键盘焦点。
- 新增 `prefers-reduced-motion` 真/假两种偏好测试及 Canvas 焦点样式存在性检查。
- 验收：测试确认系统偏好确实影响相应效果状态，普通偏好不改变既有画面状态机；视觉令牌不漂移。
- 结果：通过。19/19 自动检查通过；系统偏好生效于动态动画/装饰、震屏、关卡闪白、死亡慢放；设置改变时会即时应用，减少动态效果下死亡直接进入结束画面。普通偏好保留原效果。

### 阶段 3：输入与页面生命周期回归

- 将指针中断、键盘失焦和页面隐藏统一到输入释放流程；Canvas resize 时保持逻辑缩放、玩家位置范围和画布 DPR 限制。
- 对 pointerup/cancel、键盘按住后隐藏、resize、普通和减少动态效果配置分别进行确定性模拟测试。
- 维持非游戏状态不接受游戏操作，维持 Tab 可到达操作区；不要用自动模拟代替真实触屏验收。
- 验收：相应回归检查全绿，页面隐藏时游戏暂停且方向键/拖动状态清空，resize 后几何值有限且玩家仍在可玩区域。
- 结果：通过。21/21 自动检查通过；pointercancel 清除拖动，失焦/隐藏清理方向键并暂停，resize 后 Canvas DPR 不超过 2 且几何/飞船位置有效。

### 阶段 4：整体验证与部署

- 通读源代码修改差异和存档/输入/绘制交界，运行项目自动检查与 `git diff --check`，复核 README、roadmap 和项目状态中的准确性。
- 将源码、回归检查、路线图和项目状态同步到现有 GitHub `main`，逐文件回读并逐字比较；不引入依赖、构建系统或项目外文件。
- 验收：全部自动检查通过；远端关键文件与本地一致；保留设备级未验证项的明确记录。
- 结果：通过。21/21 自动检查通过；五个项目文件均无尾随空格。`neon-drift.html`、回归测试、README、roadmap 和项目状态已同步到 GitHub `main` 并逐文件回读匹配。源码提交 `cc286d4c02a286d93ff1110201ffbdff9d0ec0c1`，测试提交 `1a1b86f62f29d3d03f9c8f3f04f4355fe6a37d04`，README 提交 `d9129ed0216f3711f3b49a1c6f9aaf413e6861d7`。未声称真实浏览器视觉、触屏或读屏验收通过。

### 回归修复：首帧游戏画面中断（2026-10-09）

- 复现：脚本编译和初始化均通过，但执行首个 `requestAnimationFrame` 时在 `draw()` 抛出 `ReferenceError: n is not defined`；背景板已绘制，随后游戏主菜单/前景停止渲染。
- 根因：减少动态效果改动把背景动画时间变量定义在 `bgd()` 的局部作用域，`draw()` 的星点和速度条也使用 `n`，因此首帧进入前景绘制就中止。
- 修复：在 `draw()` 建立自身的动效时间值，并继续经 `motion()` 遵循减少动态效果偏好。
- 回归检查：模拟完整执行首帧，并绘制主菜单、升级、关卡、任务、统计、设置、游玩、暂停、结束和重试状态；`node --test tests/save-state.test.cjs` 23/23 通过。
- 发布状态：已同步到 GitHub `main` 并回读匹配。修复源码提交 `e66b43398c7841b05d4d4b3f85e830ebe4199864`，绘制回归测试提交 `ec90c61052c4281f3a97744aa1a397becf897a6b`。

## 后续（需真实设备/玩家证据）

- 桌面/窄屏/触屏实际操作、读屏器和高对比度视觉检查、商店刷新后存档、在线 Pages 实际渲染、首局到 Boss 的手感及难度/价格/奖励节奏反馈。
- 自动模拟、源码阅读和仓库回读都不能代替上面的人工或真实浏览器证据。收到实玩证据后，再选择有复现依据的内容平衡问题逐项调整。
