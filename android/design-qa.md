# Android Web 手机版复刻 Design QA

- source visual truth:
  - `design-qa/web-pixel9-chat-closed.png`
  - `design-qa/web-pixel9-drawer-open.png`
- implementation screenshots:
  - `design-qa/android-final-chat-closed.png`
  - `design-qa/android-final-drawer-open.png`
  - `design-qa/android-drawer-back-closed.png`
- viewport: Web 411 × 879 CSS px；Android Pixel 9 AVD 1080 × 2424 px、420 dpi，比较时裁掉系统栏并归一化为 411 × 879。
- state: 浅色主题、新对话空状态、侧栏关闭/打开；Web 与 Android 使用不同测试账号，因此昵称、当前模型、余额、项目和会话内容只核对排版，不作为文案差异。

## Full-view comparison evidence

- `design-qa/final-compare-chat-source-left-android-right.png`
- `design-qa/final-compare-drawer-source-left-android-right.png`

左侧为 Web 手机断点，右侧为 Android 原生。Android 系统状态栏属于平台外壳，不计入 Web 内容区域的垂直偏差。

## Focused region comparison evidence

- `design-qa/final-compare-chat-focus-source-left-android-right.png`
- `design-qa/final-compare-drawer-focus-source-left-android-right.png`

聚焦图已经按系统栏高度对齐，覆盖问候、输入框、免责声明、建议卡、品牌区、固定操作和主导航；这些区域的重要文字与控件足够清晰，不需要再拆更小的局部图。

## Findings

- 没有残留 P0/P1/P2 视觉问题。
- 字体与排版：问候使用同类衬线字体、30sp/px 层级；输入框 15sp/px；侧栏主导航 15sp/px；标题、占位文案、免责声明和建议卡的换行与层级一致。
- 间距与布局：280dp/px 抽屉、32dp/px 输入区外边距、24dp/px 输入框圆角、双列建议卡、顶栏按钮位置和侧栏 16dp/px 图标已经对齐。
- 颜色与 token：背景、卡片、边框、侧栏、侧栏文字、强调色和遮罩直接对应 Web 的 light token。
- 图片与图标：品牌标志使用仓库真实 LinHub 资源；界面图标使用 Material 图标映射 Web 的图标语义，没有占位图、文字字符或手绘 SVG 替代。
- 文案与内容：固定产品文案一致；昵称、问候时段、模型名、项目和会话属于账号/时间数据差异，属于预期。
- 交互：当前轮次实测菜单打开抽屉，系统返回键先关闭抽屉并停留在聊天页；Web 浏览器控制台没有 error/warn。
- 无障碍范围：截图可确认对比度和可读层级；TalkBack 顺序、动态字体放大和减少动态效果仍需要专门的无障碍设备轮次，不由截图声称完全合规。

## Comparison history

1. 初始 P2：抽屉品牌区到“新对话”比 Web 多约 6dp，导航整体下移。修复：把 Compose 52dp 品牌行后的补偿间距从 22dp 收到 12dp。修复后证据：`design-qa/final-compare-drawer-focus-source-left-android-right.png`。
2. 初始 P2：新对话问候到输入框的距离少约 8dp，导致输入框和建议卡整体偏上。修复：标题下间距从 19dp 调为 27dp，并给居中容器增加 4dp 平衡偏移。修复后证据：`design-qa/final-compare-chat-focus-source-left-android-right.png`。
3. 交互 P1：抽屉打开时系统返回键可能直接退出页面。修复：在抽屉打开期间注册 `BackHandler`，返回键优先关闭抽屉。修复后证据：`design-qa/android-drawer-back-closed.png`。

## Implementation checklist

- [x] Web 手机断点与 Pixel 9 原生使用同一逻辑宽度截图。
- [x] 首页全图和局部图并排比较。
- [x] 抽屉全图和局部图并排比较。
- [x] 修复全部 P0/P1/P2 项并再次截图。
- [x] 验证打开抽屉和返回关闭抽屉。
- [x] Android 单元测试、Debug Lint、Debug/Benchmark APK 构建通过。

## Follow-up polish

- P3：真机上补测 TalkBack、最大字体和减少动态效果；这些不阻塞本轮视觉复刻。

final result: passed
