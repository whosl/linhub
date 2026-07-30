# Android Web 手机版复刻 · Design QA

## 对比目标

- Source visual truth: `tmp/web-mobile-reference/*.png`
- Android implementation screenshots: `tmp/android-webclone-final/final/*.png`
- Full-view comparison evidence: `tmp/android-webclone-final/final/comparison-overview.png`
- Latest 411 × 843 focused source truth:
  - `tmp/web-mobile-home-411x843.png`
  - `tmp/web-mobile-drawer-411x843.png`
- Latest 411 × 843 implementation screenshots:
  - `tmp/android-mobile-home-final-411x843.png`
  - `tmp/android-mobile-drawer-final-411x843.png`
- Latest combined comparison evidence:
  - `tmp/home-visual-compare-final.png`
  - `tmp/drawer-visual-compare-final.png`
- Focused comparison evidence:
  - `tmp/android-webclone-final/final/focus-chat.png`
  - `tmp/android-webclone-final/final/focus-sidebar.png`
  - `tmp/android-webclone-final/final/focus-billing.png`
  - `tmp/android-webclone-final/final/focus-settings.png`
  - `tmp/android-webclone-final/final/focus-admin.png`
- Reference viewport: 390 × 844 CSS px.
- Android capture: 1080 × 2424 px，统一按宽度归一到 390 px；Android 状态栏与手势导航条作为原生系统区域保留。
- Latest focused viewport: Web 411 × 843 CSS px；Android 从 1080 × 2424 px 截去 142 px 状态栏与 68 px 手势导航区后，归一为 411 × 843 px。
- State: 浅色主题、管理员账号已登录、相同账户余额与套餐、项目/技能/知识库/文件为空状态。

## Findings

当前没有仍需修复的 P0、P1 或 P2 差异。

- [P3] 原生系统栏造成整体画布高度差异
  - Location: 所有 Android 页面顶部与底部。
  - Evidence: Web 截图不含系统状态栏和手势导航条；Android 保留了 Android 17 原生系统栏。
  - Classification: 平台预期差异，不影响应用内容区的比例或操作。

- [P3] 字体栅格与图标字形存在平台差异
  - Location: 中文正文、菜单图标、知识库和文件空状态图标。
  - Evidence: Web 使用浏览器字体与 Lucide；Android 使用系统中文字体、Compose Serif 标题和最接近的 Material Outlined/Rounded 图标。
  - Classification: 字号、层级、颜色和占位尺寸已对齐；剩余是字体 hinting 与图库字形差异。

- [P3] 后台供应商密钥文本的换行略有不同
  - Location: 管理后台 → 供应商卡片。
  - Evidence: Web 在极窄弹性列中逐字换行；原生 Compose 保持名称可读，并将密钥状态压缩为两到三行。
  - Classification: 卡片高度、操作顺序、开关、按钮与整体密度已对齐，保留更稳定的原生换行。

## Required Fidelity Surfaces

- Fonts and typography: 页面标题使用衬线体，正文使用 Android 系统中文字体；字号、字重、行高、折行与截断均与 390 px Web 参考逐页核对。仅剩平台抗锯齿差异。
- Spacing and layout rhythm: 侧栏宽度比例、16 px 页面边距、标题区、标签栏、卡片圆角、虚线空状态、聊天输入区和快捷入口均已按同宽截图对齐。
- Colors and visual tokens: 背景、卡片、边框、主橙色、禁用按钮、危险操作红色、成功勾选绿色和遮罩透明度均映射到 Web 色彩语义。
- Image quality and asset fidelity: 使用 Web 的真实 LinHub logo；没有用手绘 SVG、CSS 图形或占位块替代可见品牌资产。标准 UI 图标来自 Compose Material 图标库。
- Copy and content: 聊天、侧栏、项目、技能、知识库、文件、计费、设置和后台的标题、说明、标签与空状态文案已逐页核对。

## Comparison History

### Iteration 1

- Earlier P1: Android 使用底部固定导航，信息架构与 Web 手机版侧栏不同。
- Earlier P1: 聊天空状态、问候、输入框、模型选择和快捷提示的结构不一致。
- Fixes: 删除底部导航；实现全局左侧抽屉、用户菜单、Web 问候区、双层输入框和两列快捷提示。
- Post-fix evidence: `compare-chat.png`、`compare-sidebar.png`、`compare-user-menu.png`。

### Iteration 2

- Earlier P1: 设置页缺少“界面”卡，数据操作与 Web 不一致，并多出默认模型卡。
- Earlier P1: 计费套餐使用横向价格摘要，和 Web 的纵向价格、额度、功能清单结构不同。
- Earlier P1: 后台供应商卡使用两行大按钮布局，标签名称、操作顺序和密度偏离 Web。
- Earlier P2: 技能空状态被父约束撑满屏；文件页多出“编辑”筛选；空输入时发送按钮仍显示主色。
- Fixes: 重构设置、计费和后台；空状态改为内容自适应高度；移除额外筛选；发送按钮空状态改为禁用灰色。
- Post-fix evidence: `compare-skills.png`、`compare-files.png`、`compare-billing.png`、`compare-settings.png`、`compare-admin.png`。

### Iteration 3

- Earlier P2: Compose 默认 Switch 过大；后台供应商卡高度不足；禁用测试按钮对比度过低。
- Fixes: 原生开关按 Web 比例缩放；供应商卡恢复 Web 的纵向密度；提高禁用操作可读性并保留语义状态。
- Post-fix evidence: `focus-settings.png`、`focus-admin.png`。

### Iteration 4 · 首页与移动侧栏像素复核

- Earlier P1: Android 侧栏把每条会话的操作菜单永久显示，Web 仅在当前会话显示，造成明显杂乱。
- Earlier P2: Android 侧栏固定操作区比 Web 上移约 22 px，置顶图标位于标题右侧，底部账号分隔区节奏不同。
- Earlier P2: Android 首页使用额外的“中午好”时段，空状态整体比 Web 上移约 12 px，输入框高度多约 2 px。
- Fixes: 按 Web 实测边界重排侧栏；置顶图标移到标题左侧；非当前会话隐藏操作图标；同步 Web 问候规则；调整空状态中心与输入框高度；同步 Web 的置顶会话分组表现。
- Validation finding: 同一置顶会话进入两个分组后首次实机运行触发 Compose LazyColumn 重复 key 崩溃。
- Validation fix: 会话 key 改为“分组 + 会话 ID”，重新构建、安装、启动、开关侧栏并检查 logcat，未再出现崩溃。
- Post-fix evidence: `tmp/home-visual-compare-final.png`、`tmp/drawer-visual-compare-final.png`。

## Interaction Verification

- 侧栏打开、关闭和所有主要工作区导航已在 Android 17 模拟器操作验证。
- 用户菜单、设置、用量与订阅、管理后台入口已验证。
- 设置页账户、记忆、回复风格、MCP 连接器标签切换已验证。
- 计费页订阅套餐与充值标签切换已验证，充值金额和兑换码表单可见且可交互。
- 真实账号会话恢复与 `/api/me`、`/api/models`、`/api/conversations`、`/api/styles` 请求返回 200；logcat 未发现 FATAL、NetworkOnMainThreadException 或崩溃。
- 最新 Debug APK 使用 `http://127.0.0.1:3000/` 配合 `adb reverse` 实机复验；首页恢复、模型切换、侧栏开关、项目导航与返回新对话均已验证。
- 最新回归：`:app:testDebugUnitTest`、`:app:lintDebug`、`:app:assembleDebug`、`:app:assembleBenchmark`、`:app:assembleProfile`、`:benchmark:assembleBenchmark` 全部通过。

## Latest Slice · 聊天信息流（2026-07-13）

- Source visual truth path: `android/design-qa/chat-feed-mobile-audit-20260713/07-web-chat-feed-pixel9.png`、`android/design-qa/chat-feed-mobile-audit-20260713/17-web-chat-feed-bottom-pixel9.png`。
- Implementation screenshot path: `android/design-qa/chat-feed-mobile-audit-20260713/15-native-chat-feed-top-final.png`、`android/design-qa/chat-feed-mobile-audit-20260713/14-native-auto-bottom-pass.png`；复杂状态和本轮跟进见 `20-native-python-code-block.png`、`21-native-python-code-output.png`、`22-native-markdown-table.png`、`23-native-source-expanded.png`、`25-native-font-size-entry.png`、`26-native-font-size-options.png`、`27-native-font-extra-large-drawer.png`、`28-native-font-extra-large-chat.png`、`29-native-small-chat-composer-raised.png`、`34-native-history-composer-ime-resize-padding.png`。
- Viewport: Web 411 × 924 CSS px；Android Pixel 9 AVD 1080 × 2424 px，按宽度归一为 411 × 924。
- State: 浅色主题、历史会话、用户气泡、Web 搜索摘要、长 Markdown 回复、代码块运行错误态、二维表格、来源展开、五档字号菜单、极大字号和键盘打开/关闭时的底部输入框。
- Full-view comparison evidence: `android/design-qa/chat-feed-mobile-audit-20260713/16-comparison-final-top.png`、`android/design-qa/chat-feed-mobile-audit-20260713/18-comparison-final-bottom.png`。
- Focused region evidence: 顶部组合图覆盖气泡、工具、思考和正文层级；底部组合图覆盖长正文、操作栏、模型/分支和输入框，细节在同宽下清晰可读，无需额外裁切。
- Primary interactions tested: 打开历史会话、滚动长消息、回到底部、工具摘要折叠/展开、代码块折叠与真实 Python 运行、消息操作栏、五档字号切换/冷启动恢复，以及输入框与 Gboard 的打开/关闭路径。
- Evidence limitation: Web mock 与 Android 真实服务使用不同会话文本；仅比较同类组件状态和视觉节奏，不对逐行换行作伪精确判断。
- Console/runtime check: Web 页面无本项目控制台错误；Android UI 自动化树可读取消息和操作语义，构建与聚焦测试通过。

### Findings

当前没有仍需修复的 P0、P1 或 P2 差异。

- [P3] Android 保留系统状态栏与手势导航区；属于原生平台预期差异。
- [P3] 系统中文字体、Material 图标与 Web 字体/Lucide 存在字形和抗锯齿差异。
- [P3] Android 真实会话包含更长代码块和表格，底部截图内容与 Web mock 不同，但组件比例和状态已单独核验。

### Required Fidelity Surfaces

- Fonts and typography: 正文基准为 15sp / 26sp，H1/H2/H3 为 24/20/18sp，字重、换行、行内代码和列表层级已按 Web 调整；五档字号默认“适中”，用户仍可选择 0.9–1.3 倍，系统无障碍倍率继续有效。
- Spacing and layout rhythm: 16dp 页面边距、85% 用户气泡、4dp 消息内间距、20dp 消息间距、工具/思考折叠行和输入框衔接已对齐；输入框底部安全间距为 14dp，IME 状态没有重复空白或遮挡。
- Colors and visual tokens: 用户气泡使用 Web 的 `#EEE9DF`，背景、正文、弱化文字、边框和主橙色继续映射现有 LinHub tokens。
- Image quality and asset fidelity: 本切片无新增图片资产；标准操作图标使用最接近的 Material 图标，未引入占位或手绘图形。
- Copy and content: 搜索摘要、思考耗时、生成状态、操作语义和模型标签均与 Web 文案规则一致。

### Comparison History

- Iteration 1 P1/P2: 用户气泡包住操作栏、搜索调用堆成多张大卡、思考过程使用整块卡片、正文标题过大。修复后证据：`08-comparison-pass-1.png`。
- Iteration 2 P2: 超长单条回复的首次进入和“回到底部”只定位到消息开头。改为会话切换时重置跟随状态，并在布局帧后滚到真实末尾。修复后证据：`14-native-auto-bottom-pass.png`。
- Iteration 3 P1/P2: 补齐代码运行、HTML 预览、24 行折叠、输出滚动、Web 表格和来源展开；真实 Python 阻塞脚本按 120 秒策略显示错误输出，没有 UI 崩溃。证据：`20`–`23`。
- Iteration 4 P1: 新增五档字号；输入框上移后，设备发现 IME resize 与 inset 配置不完整会出现大空白或遮挡，最终用显式 `adjustResize` + `imePadding()` 闭环。证据：`25`–`29`、`34`。2026-07-15 后续把新用户默认档改为“适中”，并让 dp 间距与 sp 字号按同一倍率缩放。
- Final comparison: `16-comparison-final-top.png`、`18-comparison-final-bottom.png`，复杂状态与跟进证据为 `20`–`29`、`34`；无剩余 P0/P1/P2。

## Latest Slice · 字号、侧栏、消息导航与思考浮层（2026-07-15）

- Source visual truth path: `android/design-qa/thinking-feed-20260715/01-chatgpt-reference.jpg`，右侧消息导航的间距基准来自 Web `src/components/chat/chat-view.tsx` 的 14px 最大间距。
- Implementation screenshot path: `android/design-qa/thinking-feed-20260715/02-thinking-collapsed.png`、`android/design-qa/thinking-feed-20260715/03-thinking-sheet-final.png`、`android/design-qa/thinking-feed-20260715/04-drawer-wide.png`。
- Viewport: Pixel 9 AVD，1080 × 2424 px，浅色主题。
- State: 完成态聊天，包含两段 reasoning、一次 Web 搜索、一次代码执行错误和最终正文；主信息流折叠态与思考浮层展开态均已验证。
- Full-view comparison evidence: 同一次视觉输入中并列打开 ChatGPT 参考图和 `03-thinking-sheet-final.png`，核对浮层高度、圆角、拖拽柄、居中耗时标题、左侧时间线、来源胶囊和错误详情。
- Focused region comparison evidence: `02-thinking-collapsed.png` 验证主信息流只保留一条“已思考 1m 32s”；`04-drawer-wide.png` 验证侧栏增宽后的内容密度与右侧留白。

### Findings

当前没有仍需修复的 P0、P1 或 P2 差异。

- [P3] ChatGPT 参考图使用其专有字体和地球图标；Android 保留 LinHub 系统字体与 Material 图标，属于平台和品牌预期差异。
- [P3] 参考图包含更多搜索批次，因此时间线更长；确定性夹具使用四个事件覆盖相同结构和错误状态，不对内容长度作伪精确匹配。

### Required Fidelity Surfaces

- Fonts and typography: 默认档已改为“适中”；全局 Density 同步缩放 dp 与 sp，字号增大时行距、内边距和触控区域同步增大，且没有二次放大文字。
- Spacing and layout rhythm: 抽屉由 280dp 增至 304dp；思考浮层约占屏高 92%；消息导航标记全部使用未选中态的 8dp 长度，选中仅改变颜色，垂直最大间距与 Web 一致为 14。
- Colors and visual tokens: 浮层、遮罩、弱化文本、时间线、来源胶囊和错误提示均复用 LinHub Material 色彩语义；选中导航标记只变为前景黑色。
- Image quality and asset fidelity: 没有新增或伪造图片资产；标准状态图标继续使用 Material 图标库。
- Copy and content: 流式阶段只呈现最新状态；完成后统一为“已思考 Xm Xs”，搜索、reasoning、代码运行和错误只在点击后的浮层中展开。

### Comparison History

- Iteration 1 P1: 原始实现把每段 reasoning 与每次代码调用作为独立信息流卡片，错误会占据整屏。修复为单一状态入口和底部时间线浮层。
- Iteration 2 P0: 首次实机点击浮层时，时间线的 `IntrinsicSize` 与来源 `LazyRow` 触发 SubcomposeLayout intrinsic measurement 崩溃。移除 intrinsic 测量并改为固定时间线轨道；重新 R8 构建、点击、截图，crash buffer 为空。
- Iteration 3 P2: 第一版浮层只有约半屏高，与 ChatGPT 接近全屏的参考态不一致。改为 92% 屏高后重新对比，标题、时间线和滚动区域层级对齐。
- Validation: `:app:testDebugUnitTest` 与 `:app:assembleBenchmark` 通过；Pixel 9 AVD 安装 R8 APK 后验证折叠、展开、来源胶囊、代码错误、关闭和侧栏打开路径。

## Follow-up Polish

- 若后续引入与 Web 完全一致且可商用的跨平台字体与图标包，可继续消除 P3 字形差异。

final result: passed

## Latest Slice · 工具设置二级菜单（2026-07-16）

- Web route: `http://localhost:3001/`，分别在默认桌面视口与 390 × 844 窄屏验证。
- Verified interactions: 工具主菜单只保留联网搜索、图片能力和两个二级入口；“资料检索”包含开关与知识库范围；“工具设置”包含代码运行与 MCP；空范围灰色全选、单项品牌色排他选择、再次点击恢复默认均通过。
- Menu consistency: Web 桌面端工具与模型二级菜单统一使用 Radix 左侧弹出、圆角边框和缩放淡入；窄屏统一使用同一组淡入/轻缩放/模糊切换。Android 工具与模型二级菜单统一使用相同的导航行、返回标题和淡入缩放切换。
- Responsive result: 二级菜单在窄屏未产生水平页面溢出，输入框主要操作没有被遮挡；浏览器控制台无新增错误或警告。
- Android verification: `SettingsStatePolicyTest`、`:app:lintDebug`、`:app:assembleDebug` 通过；已生成 Debug APK。
- Evidence limitation: 当前机器没有可用 AVD，本轮未生成新的原生 Android 运行截图；Android 视觉行为仍需在下次可用设备上补一次点击与截图复核。
- Desktop alignment follow-up: 桌面端二级菜单继续通过 RTL 控制向左弹出，但模型、思考强度、资料检索和工具设置的内容层显式恢复 LTR 与左对齐；模型名和说明靠左，默认星标与当前项勾选位于行尾。
- Follow-up validation: `src/components/chat/chat-input.tsx` 定向 ESLint 通过；Lighthouse 生产构建通过，`linhub.service` 重启后为 active，源站与公网 `/login` 均返回 200。内置浏览器在生产域名导航与本地 WebView 连接阶段超时，因此本轮没有新增弹层截图，需以用户刷新后的生产页面作为最终视觉复核。

## Latest Slice · Markdown 块边界规范化（2026-07-16）

- Incident evidence: 会话 `c-0d1bf48be7654994` 与 `c-58a5da7575f041ca` 中，模型把独占 `---` 紧贴普通段落，CommonMark 将整段误识别为 Setext H2；会话 `c-04c11d7b31fa4a99` 中，显式 `>` 引用后没有空行，lazy continuation 将后续酒馆正文吞入引用块。
- Product rule: Web 与 Android 在 Markdown 解析前统一规范化块边界；独占连字符线始终作为分隔线，只有显式以 `>` 开头的连续行属于引用。围栏代码、GFM 表格、YAML frontmatter 与 `===` Setext H1 保持原样。
- Web validation: 真实问题的最小复现经 React Markdown SSR 后分别产生 `<p> + <hr>` 与闭合的 `<blockquote> + <p>`；回归脚本、定向 ESLint、`npx tsc --noEmit` 和本地生产构建通过。
- Android validation: `MarkdownEngineTest` 新增分隔线、显式引用和兼容边界回归；`:app:testDebugUnitTest`、`:app:lintDebug`、`:app:assembleDebug` 通过并生成 Debug APK。
- Production validation: Lighthouse 回归脚本、定向 ESLint、TypeScript 和生产构建通过；`linhub.service` 为 active，源站与公网 `/login` 均返回 200。
- Visual evidence limitation: 内置浏览器没有可用登录标签，Chrome 自动化连接不可用，因此没有刷新后三个生产会话的新截图；用户提供的截图和数据库原文用于定位，最终视觉需在现有登录页面刷新后复核。
