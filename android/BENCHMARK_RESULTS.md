# Android 性能基准记录

本文件记录可复现的测量结果。模拟器数据只用于发现回归和验证基准链路，不作为真机性能结论。

## 2026-07-14 · 工作区富数据 R8 交互 Smoke

原 22-surface smoke 主要验证空列表和页面入口。新增独立 `workspace-interaction` 内存夹具，预载项目/会话/项目文件/关联知识库、知识库文档、Prompt Skill 和 Kotlin 媒体正文；R8 测试实际触摸项目详情和三个标签、两类删除确认后取消、技能编辑器预填后取消，以及代码文件预览。夹具只存在于 Benchmark 变体，项目详情与知识文档选择在该变体硬禁用网络读取。

Pixel 9 AVD 最终结果：富数据交互 1/1 通过（29.384 秒），原 22-surface smoke 1/1 通过（25.535 秒）；两轮各自清日志后均为 0 OkHttp、0 FATAL、空 Crash Buffer。完整单测、Lint、Debug/AndroidTest APK、R8 Benchmark App 与测试 APK 构建通过。该结果证明确定性 Compose 分支可达，不是 Web/原生端到端性能结论。

## 2026-07-14 · 文件首屏图片请求前移

覆盖审计发现性能文档写有“列表进入前预取首屏”，但源码只有媒体 Room 元数据预取；Coil 图片请求仍要等文件网格首次组合。为避免主观截图判断，本轮只清除 Debug App 的 `cache/image_cache`，保留登录态、Room 和其余缓存，在同一 Pixel 9 AVD 上直接记录 Coil 磁盘缓存文件的出现时机。

| 版本与阶段 | 等待 | `image_cache` 文件数 | 大小 |
| --- | ---: | ---: | ---: |
| 旧实现，聊天首页 | 8 秒 | 0 | 0 |
| 旧实现，进入文件页后 | 6 秒 | 13 | 1,828 KiB |
| 新实现，聊天首页 | 15 秒 | 13 | 3,924 KiB |
| 新实现，进入文件页后 | 5 秒 | 13 | 5,660 KiB |

当前实现只在核心工作区刷新完成且在线时，使用全局同源 Bearer Coil `ImageLoader` 预取媒体列表前 6 个唯一图片 URL；请求限制为 512px、`Precision.INEXACT`，离线/退出登录时取消。导航进入文件页不会再取消尚未完成的预取，网格与预取使用相同 URL 磁盘缓存键。缓存体积在后两阶段继续增长，说明慢链路请求尚在完成，因此不宣称所有图片在 15 秒内完成；可重复结论仅是请求已从“文件页首次组合后”前移到聊天首页后台，且进入文件页没有创建新缓存键。

`BENCHMARK_ENABLED` 变体在预取组件内部硬禁用。最终 R8 `WorkspaceSurfaceSmokeTest` 遍历 22 个 surface 1/1 通过（37.989 秒），先停止 Debug 包后采集的目标期间日志中没有 OkHttp、FATAL 或 Crash Buffer 记录。Debug 单测、Lint、Debug/AndroidTest APK、R8 Benchmark App 与测试 APK 均构建通过。

## 2026-07-14 · 工作区八页 Baseline Profile 覆盖

反向核对性能验收链路时发现：项目已经有确定性的侧栏导航 Macrobenchmark，但 Baseline Profile 生成器只采集启动、1,000 消息滚动和 120 帧流式聊天。项目、技能、知识库、文件等高频页面的首次组合不在安装时预编译旅程中，设置、计费和管理后台也只留下类标记，没有主 Compose 方法规则。

现把工作区导航加入独立 Profile 旅程。Benchmark-only 夹具在 `drawer-navigation` 场景使用管理员身份，先经账户菜单打开设置、用量与订阅、管理后台，再依次打开项目、技能、知识库、文件并回到新对话；`selectDestination` 在基准变体继续只更新本地 Compose 状态，不访问网络、账号或 Room。普通 Debug/Release 的用户角色与业务路径不受影响。

Pixel 9 / Android 17 AVD 的最终采集结果：

| 项目 | 结果 |
| --- | ---: |
| Profile 用例 | 启动、长会话、工作区八页导航、流式聊天，4 / 4 通过 |
| Baseline 规则 | 24,985 条（上一版 23,043，增加 1,942） |
| Startup 规则 | 18,155 条（上一版 18,156，保持同量级） |
| 全量采集 | 11 分 57 秒，configuration cache 复用成功 |

规则内容逐项命中 `ProjectsScreen`、`KnowledgeScreen`、`FilesScreen`、`SkillsScreen`、`SettingsScreen`、`BillingScreen` 和 `AdminScreen` 主 Compose 方法；新增页面没有进入 Startup Profile，避免把非启动页面错误塞进启动关键路径。

随后把 Profile 编译状态变成 Macrobenchmark 硬门控：所有 `CompilationMode.Partial` 显式要求 `BaselineProfileMode.Require`，每轮 setup 直接从 ART `dumpsys package dexopt` 断言 `speed-profile`；另加 `CompilationMode.None` 对照并断言不得为 `speed-profile`。Benchmark APK 的 ProfileInstaller 广播返回 `result=1`，手动 ART 编译也读回 `speed-profile / cmdline`。Profile-on / Profile-off 各 10 轮、共 20 / 20 通过；AndroidX JSON 的单个顶层 `context=verify` 不能表达同一文件内两组编译状态，因此不再用它判定分组。

AndroidX 原始 CPU P50 从无 Profile 的 `19.35ms` 降到 `14.47ms`（-25.2%），但 P95 从 `184.90ms` 漂到 `197.82ms`（+7.0%）；Overrun P95 为 `199.83 / 197.15ms`，基本持平。对 20 份 Perfetto 逐轮分析后，App UI 主线程的 `doFrame` P50/P95 中位数从 `4.846 / 30.307ms` 降到 `3.195 / 16.258ms`（-34.1% / -46.4%），`measureAndLayout` P95 从 `12.778ms` 降到 `5.154ms`（-59.7%），重组 P95 从 `4.942ms` 降到 `2.948ms`（-40.4%）。RenderThread `waitForBufferRelease` 最大值中位数却保持 `211.953 / 212.694ms`（+0.3%）。这证明 Profile 明确降低 App 首次组合成本，同时说明 AVD 端到端慢尾仍由显示缓冲回压主导。完整结论见 `design-qa/workspace-profile-benchmark-20260714/AUDIT.md`，固定真机仍是最终门槛。

## 2026-07-13 · 根外观状态与流式聊天隔离

五档字号接入后复查 Compose 根路径，发现 `MainActivity` 为读取主题和字号直接收集完整 `LinHubUiState`。聊天流每 24ms 合帧、草稿变化、消息错误或工具事件都会让 Activity 根组合域失效；同时 `LinHubTheme` 每次重组都会新建等价 `Density`。即使 Compose 可能跳过部分稳定子树，这仍把高频聊天状态错误地连到了全局主题层，不符合“流式内容只更新局部”的原生性能目标。

现把外观投影成独立 `AppAppearance(themeMode, fontSizePreset)` StateFlow，并在 `distinctUntilChanged()` 后才交给 Activity；完整 UI 状态继续只由 `LinHubApp` 在实际页面层收集。字体 `Density` 也按系统密度、系统字号与五档预设 `remember`，仅在这些输入真实变化时重建。纯策略测试锁定两点：草稿/消息等流式状态变化不会改变根外观投影，主题或字号变化必须改变投影。

Pixel 9 / Android 17 AVD 覆盖安装后选择“大”，强制结束并冷启动，侧栏仍以 1.2 倍字号恢复；随后切回默认“小”并再次冷启动，说明状态隔离没有断开外观持久化。R8 `benchmark` 变体又对 1,000 条消息、导航条开/关两种场景各执行 10 轮：

| 场景 | `frameDurationCpuMs` P50 / P95 / P99 | `frameOverrunMs` P50 / P95 / P99 |
| --- | ---: | ---: |
| 导航条开启 | 2.90 / 4.42 / 7.21ms | -10.46 / -8.68 / -6.19ms |
| 导航条关闭 | 2.78 / 4.60 / 8.72ms | -10.17 / -8.29 / -1.39ms |

两项测试共 20 轮、0 失败，P95 均保持在此前稳定的约 4.4–4.6ms 区间且仍有约 8ms 帧预算余量。该基准不模拟真实网络流生成，因此用于证明长会话热路径无回退；“流式状态不会再向根外观流发射”由投影测试与 `distinctUntilChanged` 数据路径直接保证。完整单测、Lint、Debug、R8 Benchmark 与 Benchmark 测试 APK 构建同时通过。

## 2026-07-14 · 侧栏壳层与聊天流状态隔离

继续沿流式热路径向下审计时发现，`ConversationDrawer` 实际只读取用户、会话/项目列表、当前选中会话、搜索、折叠/置顶项目和外观等壳层字段，却直接接收包含完整消息树、流式状态、附件、工具、计费、设置和后台数据的 `LinHubUiState`。因此每次 24ms 文本合帧都会改变传给侧栏的参数；即使抽屉关闭，Compose 也无法根据参数相等直接跳过整个会话树。

现新增 `WorkspaceShellState` 投影，并在 `LinHubApp` 中只以 13 个真实依赖作为 `remember` key。流式正文更新时复用同一个壳层对象；自动标题、会话/项目增删、余额、搜索、当前选中项、主题和字号变化仍会生成新投影。没有增加第二个长期 Flow collector。策略测试覆盖：

- 草稿、引用、流状态和工具提示变化不改变壳层投影；
- 页面、当前会话或外观变化必须改变投影；
- 连续 100 个不同流式帧仍得到与初始状态相等的壳层对象。

Pixel 9 AVD 覆盖安装后，侧栏完整读到工作区入口、项目和历史会话；输入 `GPU` 的只读搜索返回“量化巨头GPU之谜”，点击后标题和选中会话同步，证明投影没有切断搜索或导航业务流。

### 本轮性能数据与 A/B 结论

首次在完整构建后运行两组 10 轮 R8 长会话基准时，宿主刚连续执行约 32 分钟 Kotlin/R8/Lint，两个场景同步出现模拟器退化：导航条开启/关闭的 P95 CPU 帧时间分别约 `90.14 / 106.23ms`。等待 qemu 从约 43% CPU 降到约 2% 后复跑，仍为 `96.94 / 89.12ms`；GLES 始终是 Apple M5 宿主 GPU，系统动画为 1.0，AVD 热状态为 0，排除了软件渲染、动画缩放和设备热限频。

为避免把环境解释当结论，又临时切回旧的“抽屉直接接收完整 `LinHubUiState`”实现，以同一导航条开启场景跑 10 轮。旧实现 P50 / P95 / P99 为 `8.61 / 106.99 / 204.61ms`，没有恢复到早前 4.42ms 的稳定 P95，且尾部比最终投影版的 90.29–96.94ms 更差。对照后已恢复壳层隔离实现。

因此保留两类看似冲突但各自真实的证据：投影逻辑从数据依赖上阻断了流式状态向侧栏参数传播；当前 AVD 时段的端到端长列表 P95 约 89–107ms，无法用来宣称本轮速度提升，也不能归因于新投影。此前同 AVD 空闲轮次的 4.42–4.60ms 不覆盖本轮慢样本。正式性能结论仍要求固定真机、受控宿主负载和 Perfetto A/B。

## 2026-07-14 · 确定性 120 帧流式聊天与热路径优化

新增只在 `BENCHMARK_ENABLED=true` 且场景严格等于 `streaming-chat` 时可用的确定性会话：一条用户消息、一条空的 streaming assistant，以及 120 次间隔 24ms 的真实 `AssistantStart → TextDelta → Done` reducer 事件。Macrobenchmark 通过 `FLAG_ACTIVITY_SINGLE_TOP` 把专用触发 Intent 交给已就绪 Activity，每轮从空回复增长到完成态 Markdown，并等待稳定标记 `STREAMING_BENCHMARK_DONE`；10 轮均保留独立 Perfetto trace，不访问账号、Room 或网络。

首轮 trace 暴露出四项 App 热路径重复工作：每个 delta 都重建分支索引和可见消息链、重启 Markdown 预热监听、用两阶段大位移重新定位列表、对持续增长的整段纯文本全量排版。现改为：

- 流式期间复用消息树路径，以 O(1) 视图只覆盖最后一条 assistant；
- 分支索引、消息导航条和 Markdown 预热以稳定结构为 key，滚动监听使用 `rememberUpdatedState`；
- 只有真实用户拖拽才停止自动跟随，程序化滚动不再误触发；底部距离包含 LazyColumn 尾部 padding；
- 流式纯文本只在换行边界冻结约 512 字符片段，后续增量只重排最后一片，完成后仍切回同一 Markdown 渲染器。

设备语义树在 120 帧结束后读到完成标记、复制/重试/反馈/朗读/引用操作栏，且没有“生成中”或“回到底部”，证明正文连续、终态切换和自动跟随都到达真实底部。策略测试同时锁定分片逐字还原、已完成分片稳定和尾部 padding 距离。

同一 Pixel 9 / API 37 AVD、Apple M5 宿主 GPU、系统动画 1.0、R8 `benchmark`、`CompilationMode.Partial` 的三组原始 AndroidX 汇总如下：

| 版本 | `frameDurationCpuMs` P50 / P90 / P95 / P99 | `frameOverrunMs` P50 / P90 / P95 / P99 |
| --- | ---: | ---: |
| 优化前 | 22.3 / 97.3 / 154.8 / 210.7ms | 24.4 / 159.2 / 185.8 / 221.2ms |
| 热路径优化、Profile 更新前 | 19.0 / 97.5 / 154.2 / 207.6ms | 25.6 / 159.8 / 185.0 / 242.4ms |
| 热路径优化 + 新 Profile | 22.4 / 83.6 / 156.4 / 211.7ms | 19.7 / 156.8 / 188.6 / 225.6ms |

原始 P50/P95 随宿主窗口回压明显漂移，不能把任一快轮单独当成完成结论。Perfetto 的 App 内部切片则给出方向一致的代码证据：选择帧数接近中位数的优化前/最终 trace，`TextStringSimpleNode::measure` 平均值从 3.316ms 降到 1.490ms（-55.1%），`TextLayout:initLayout` 从 1.694ms 降到 0.590ms（-65.2%），`Constructing StaticLayout` 从 0.832ms 降到 0.319ms（-61.7%），`AndroidOwner:measureAndLayout` 从 1.593ms 降到 1.293ms（-18.8%）。同时 RenderThread 的 `waitForBufferRelease` 最大值仍为约 205–211ms，证明端到端慢尾部继续主要受模拟器 SurfaceFlinger/宿主缓冲区影响。

Baseline Profile 生成器已加入第三条流式关键旅程，并修复 `updateBaselineProfile` 自定义任务无法写入 Gradle configuration cache 的问题。最终采集为 23,043 条 Baseline / 18,156 条 Startup 规则；相对上轮 Baseline 增加 43、移除 17，`StreamingPlainText`、分片函数、O(1) 尾项视图和流式 ViewModel 方法均进入安装时 profile。完整原始 JSON、三阶段汇总、代表 trace、终态截图和语义树位于 `design-qa/streaming-benchmark-20260714/`。模拟器数据继续只用于回归与归因，固定真机仍是最终性能门槛。

## 2026-07-12 · Baseline / Startup Profile 生产化

审计发现原 `app/src/main/baseline-prof.txt` 只有 14 条手写类规则；旧生成命令虽然在设备上采集到数千条规则，但目标 APK 已经 R8 混淆，输出是 `La0;` 一类随构建变化的短名，且没有进入正式源码。另一个问题是旧生成器把 1,000 消息滚动全程标记为启动路径，使 Startup Profile 与 Baseline Profile 完全相同。

现已接入 AndroidX Baseline Profile Gradle 插件并拆出独立 `baselineprofile` 模块。插件用 `nonMinifiedRelease` 采集稳定的原始类/方法名；`generateStartup` 只覆盖启动到首页就绪，`generateCriticalUserJourneys` 单独覆盖长会话滚动且不进入 Startup Profile。`updateBaselineProfile` 先生成到隔离目录、拒绝空行/XML 等非法内容，再原子更新所有 R8 变体共享的标准文件。

Pixel 9 / Android 17 AVD 连续设备采集后，标准源码包含 22,502 条 Baseline 和 18,051 条 Startup 规则。重新构建的 Benchmark 与 Release APK 均成功通过 R8/ART Profile 编译，内嵌 `baseline.prof / baseline.profm` 分别为 `10,433B / 1,230B` 和 `10,457B / 1,224B`。临时 Debug 证书只用于给未签名 Release 副本做设备验收；APK 冷启动进入真实登录页，`BENCHMARK_ENABLED=false`，后端与 App Link 均为 `xiaolin.wenzhuolin.xyz`。日志明确记录 `ProfileInstaller: Installing profile`，随后系统 `speed-profile` 编译成功，`dumpsys package dexopt` 返回 `status=speed-profile`。临时 Release、测试包与证书副本已清理，不改变最终签名身份。

原 `:benchmark:connectedBenchmarkAndroidTest` 任务在模块拆分后仍完成 10 次冷启动、0 失败。该轮紧接数十分钟 Profile 采集与多次 R8 构建，模拟器样本 P50 为 2,237.2ms、变异系数 12.9%，只证明基准链路和新 profile 可被同一变体消费，不用于替换下方空闲环境的 Web/原生交替对照结论。

## 2026-07-12 · 侧栏关闭与重页面导航隔离

侧栏原先在同一点击回调中先切换项目、技能、知识库或文件页，再启动抽屉关闭动画。目标页面首次组合、缓存状态更新和关闭动画会在同一时间竞争 UI/GPU 帧。现在所有会改变主内容的侧栏动作统一等待 `DrawerState.close()` 完成后再执行；新对话、打开会话、项目新对话和定向编辑也使用同一策略。纯策略测试同时覆盖“关闭完成前不得执行动作”和系统动画为 0 时立即执行、不死锁。

最初 AVD 被故障排查参数 `-gpu swiftshader_indirect` 固定为 CPU 软件渲染。该环境的修改前 98 个有效 FrameTimeline 样本为 P50 270.99ms、P95 472.43ms、98 / 98 超过 34ms；修改后两次复测 P50 为 282.10ms / 254.53ms、P95 均约 565ms，无法证明代码改善，也不能把软件渲染退化伪报为 App 回归或优化。

把同一个 Android Studio Pixel 9 AVD 恢复为默认 `-gpu auto` 后，SurfaceFlinger 明确使用 `Android Emulator OpenGL ES Translator (Apple M5)`。在远端真实账号已登录、四个重页面和新对话预热后，按“项目 → 技能 → 知识库 → 文件 → 新对话”循环 4 轮：

| 指标 | 宿主 GPU 结果 |
| --- | ---: |
| 有效 FrameTimeline 样本 | 76 |
| P50 / P95 | 18.28ms / 22.09ms |
| 最大 | 33.70ms |
| 超过 20ms / 34ms | 21 / 0 |
| 系统 `gfxinfo` 全部帧卡顿率 | 24 / 1,634（1.47%） |
| Missed Vsync | 0 |

设备实测还把 `animator_duration_scale` 临时设为 0：点击项目后抽屉立即关闭，项目空状态正常出现，随后设置恢复为系统默认 `null`，没有等待死锁。该结果证明当前 AVD 的关闭/导航链路没有跨两帧关键样本；正式性能结论仍以固定 API 35+ 真机和 Perfetto trace 为准。

随后把同一路径纳入正式 `DrawerNavigationBenchmark`：R8 `benchmark` 变体使用本地确定性账号，`selectDestination` 在基准变体只更新 Compose 状态，不访问网络、Room 或真实会话。每轮 `setupBlock` 先通过语义树解析当前设备的侧栏和五个目的地坐标；正式测量区只注入真实触摸，依次完成项目、技能、知识库、文件和新对话，避免 UIAutomator 在动画中反复遍历 Compose 语义树污染样本。10 轮均通过并各自保留 Perfetto trace。

AndroidX 原始汇总为 `frameDurationCpuMs P50 14.4ms / P95 109.4ms`、`frameOverrunMs P50 36.2ms / P95 106.7ms`。该尾部不能隐去，但 Perfetto 根因并非等量的 Compose 计算：逐轮查询 `android_frames → Choreographer#doFrame` 后，UI 主线程 P50 范围为 2.87–4.71ms，P95 范围为 11.99–22.11ms。最异常一轮的单帧 509.52ms 中，`draw-VRI → postAndWait` 占 507.49ms，Compose `AndroidOwner:draw` 只有约 0.16ms；对应 RenderThread 长帧主要停在 `eglSwapBuffersWithDamageKHR → dequeueBuffer → waitForBufferRelease`，属于模拟器 SurfaceFlinger/宿主窗口缓冲区回压。中位 trace 的实际呈现帧最大 52.2ms，jank 类型也以 `SurfaceFlinger CPU Deadline Missed` 为主。

因此本轮形成两条同时保留的证据：代码相关的 UI 主线程 P95 约 12–22ms，与手工真实账号 `gfxinfo` 的 22.09ms 一致；AndroidX 在当前 AVD/宿主窗口状态下的端到端原始 P95 仍为 109.4ms，不能作为“真机已达标”结论。正式验收继续要求固定真机、前台窗口和相同 Macrobenchmark/Perfetto 流程。

## 2026-07-13 · 目标页缓存预取、stale-first 与重复导航

加载路径审计发现三个空数据场景的语义缺口：项目和知识库只用列表非空判断是否已加载，因此合法空列表每次进入都会重新读 Room/请求网络；文件页没有记录当前筛选结果的新鲜期，重复进入也会重新读缓存；文件筛选快速变化时，旧请求还会阻挡或覆盖新请求。技能虽有 `skillsLoaded`，但读取过期缓存时过早置为完成，网络失败后不会再重试。

现增加独立的“已加载”状态、文件结果 key/时间戳和 reset 请求所有权：聊天页显示后在 `Dispatchers.IO` 并行预取项目、知识库、技能、“全部文件”、计费和设置六类缓存；空列表也能标记为有效结果；相同文件筛选在 30 秒内直接复用，离线时允许继续使用同 key 的过期结果；新的 reset 会取消旧文件请求，离开文件页也会取消后台请求，避免数十秒后把超时错误显示到聊天页。计费与设置把“有可显示快照”和“内存快照仍新鲜”分开：过期结果先显后刷，刷新失败后下次进入仍会重试，没有把性能优化改成永久不刷新。

Pixel 9 AVD 的 Debug BASIC 请求日志与 UI 读回结果：

| 场景 | 设备证据 |
| --- | --- |
| 冷启动 | 仅 `/api/me`、`/api/models`、`/api/conversations`、`/api/projects`、`/api/styles`；后台目标页缓存预取没有新增 HTTP |
| 首次补齐缺失/过期缓存 | 知识库 1 次、技能 mine/market 各 1 次、文件 1 次；项目启动刷新后为 0 次 |
| 文件快速重进 | 两次进入只出现 1 次 `/api/media`，第二次复用当前结果 |
| 离线重复导航 | `airplane_mode=1`、`Active default network: none`；项目/知识库/技能/文件分别读到四个 Web 同款空状态，HTTP 请求为 0 |
| 设置 fresh-cache 首次打开 | 冷启动预取完成后首次进入设置页，无阻塞式加载圈，设置域 HTTP 请求为 0 |
| 设置过期快照 + 离线 | 当前记忆立即显示；后台只尝试当前标签的 `/api/memories`，DNS 失败不清空 stale 数据，恢复网络后同标签返回 200 |
| 计费过期快照 + 离线 | Pro 概览、额度进度和套餐卡立即显示；后台只尝试当前套餐标签的 `/api/plans`，失败不清空 stale 数据，恢复网络后同标签重试返回 200 |

新鲜度、筛选变化、TTL 边界、时钟回拨和离线过期复用已有纯策略测试；全量单测、Lint、Debug 与 Benchmark 构建通过。该优化减少目标页加载闪烁和无效网络等待，不改变服务端数据语义。

### 项目列表与知识库按需加载

项目列表此前在 `loadProjects()` 末尾无条件触发知识库加载，即使用户只浏览项目卡片，也会多读一份与当前页面无关的数据。现按原生界面实际依赖拆为列表、编辑器和项目详情对话三种入口：列表与详情“对话”标签只依赖项目资源，进入“项目文件”、新建或编辑项目信息时才需要知识库；知识库已有新鲜结果时快速重进直接复用。

Pixel 9 AVD 使用远端域名 Debug APK 和 BASIC 请求日志复验：冷启动项目索引只出现 `/api/projects`，647ms 返回 200，未出现 `/api/knowledge`；进入项目详情后首次切到“项目文件”，才出现一次 `/api/knowledge`，946ms 返回 200；再次进入已加载区域时相关请求为 0。纯策略测试锁定列表、编辑器、详情对话标签和已加载重入四个分支。

同一轮还按 360×808 Web 手机视口逐屏对照项目域：原生列表改为紧凑整卡进入独立详情，详情补齐“对话 / 项目文件 / 项目设置”三标签、摘要编辑、会话入口、文件与知识库、默认模型、项目指令和危险操作区；列表与详情使用 180ms 横向淡入过渡，详情头正确避让状态栏。项目卡提供 `打开项目「名称」` 的 TalkBack 语义。Pixel 9 AVD 对编辑项目信息、模型菜单、项目指令、文件删除、项目删除和新建项目逐项执行打开后取消，返回列表后项目与文件仍在，未写入业务数据。最终完整 `testDebugUnitTest`、`lintDebug`、Debug、R8 Benchmark 与 Benchmark 测试 APK 构建在 74.82 秒内通过。

## 2026-07-13 · 管理后台按标签加载

原生管理后台此前首次进入会并发等待供应商、模型、套餐、用户、技能审核、系统设置、全局 MCP、全站用量和兑换码 9 组接口；任意一个接口失败都会使整份快照失败。Web 基线由各标签独立查询，因此原生既比 Web 多做无关工作，也把当前标签耦合到无关接口的延迟和错误。

现改为按当前标签加载并独立记录资源成功/执行状态。供应商、模型、套餐、技能审核、全局 MCP、兑换码和用量各只请求自身资源；用户标签显式依赖用户与套餐，系统设置显式依赖设置与模型。成功资源立即可用，失败资源不标为完成，下次点击同一标签或刷新会重试；已加载标签快速重进不重复请求。

Pixel 9 AVD 连接 Lighthouse 生产后端的 Debug BASIC 日志：

| 场景 | 请求与 UI 证据 |
| --- | --- |
| 首次供应商标签 | 只请求 `/api/admin/providers` 1 次，其余 8 组为 0；一次 45 秒网络超时后同标签重试 1.543 秒返回 200，供应商卡正常显示 |
| 首次用户标签 | 只并发请求 `/api/admin/users` 与 `/api/admin/plans`，均约 0.58 秒返回 200；用户列表无阻塞式加载圈 |
| 首次系统设置标签 | 只并发请求 `/api/admin/settings` 与 `/api/admin/models`，均约 0.62 秒返回 200；模型选择与引擎设置正常显示 |
| 返回用户标签 | HTTP 请求数 0，已加载列表立即显示且无加载圈 |
| 标签失败与恢复 | 飞行模式下技能审核请求 45 秒超时后持续显示“当前标签加载失败”和“重试”；恢复网络后点击重试，1.725 秒返回 200 并显示真实空状态 |

新增策略测试锁定九个标签的依赖映射、资源覆盖和完成条件；失败页使用标签级持久重试入口，不再只依赖短暂 Snackbar。全量单测、Lint、Debug、R8 Benchmark 与 Benchmark 测试 APK 构建通过。此结果证明当前 AVD 上管理后台不再进行 9 接口首屏瀑布式等待；绝对耗时仍受模拟器网络影响，不替代真机验收。

## 2026-07-13 · 计费按标签加载与额度卡对齐

Web 计费页由当前标签分别查询套餐、用量和流水，当前用户则复用全局查询；原生此前进入页面会固定并发请求 `/api/me`、`/api/plans`、`/api/usage`、`/api/ledger` 四项。现拆分为用户、套餐、用量、流水四个资源状态：已有用户直接复用，当前标签只刷新自身列表；旧 Room grouped payload 仍能一次恢复三个列表，但只有三类列表都在 30 秒 TTL 内新鲜时才允许整组回写，避免只刷新套餐却把旧流水重新标成新鲜。

Pixel 9 AVD 连接 Lighthouse 的设备结果：

| 场景 | 请求与 UI 证据 |
| --- | --- |
| 首次套餐标签 | 只请求 `/api/plans` 1 次，`/api/me`、`/api/usage`、`/api/ledger` 为 0；767ms 返回 200 |
| 首次用量标签 | 只请求 `/api/usage`，1,001ms 返回 200；原生列表显示最近用量与合计 |
| 首次流水标签 | 只请求 `/api/ledger`，719ms 返回 200；余额流水正常显示 |
| 30 秒内立即重复当前标签 | 在上一条 `/api/usage` 200 后同一命令立即点击，请求数为 0 |
| grouped cache 过期后离线 | 冷启动仍立即显示 Pro、`¥81.28 / ¥120.00`、线性额度进度和套餐卡；只尝试 `/api/plans`，DNS 失败后 stale 内容保留；恢复网络后同标签 1,558ms 返回 200 |

额度卡同步补齐 Web 信息：有限额度显示“已用 / 总额”和线性进度，无限额度显示“无限额度 / 本月已用金额”。有限 Pro 分支已在设备验证；无限分支由纯策略测试覆盖，避免为截图修改生产订阅。加载策略测试同时覆盖按标签请求、强制刷新、stale 可见性、TTL 边界和 grouped cache 完整新鲜约束。

## 2026-07-13 · 设置按标签加载与 grouped cache 正确性

Web 设置页的账户、记忆、回复风格、MCP 四个标签各自查询；原生此前进入默认“账户”仍会并发等待用户、记忆、风格和个人 MCP。现拆为四个独立资源：账户复用已登录用户，记忆/风格/MCP 只在对应标签加载；聊天启动阶段已成功取得的风格也可直接复用。失败资源显示标签级持久重试入口，其他已加载设置不受影响。

设置 Room payload 继续组合保存记忆、风格和个人 MCP，但新规则只在三类时间戳都处于 60 秒 TTL 内时写入。单独新增记忆、删除风格或测试 MCP 只更新对应资源新鲜度，不再把另外两类旧数据整体续鲜。Pixel 9 AVD 的真实结果：

| 场景 | 请求与状态证据 |
| --- | --- |
| 首次账户标签 | 设置域 HTTP 请求 0，账户与界面设置立即显示 |
| 首次记忆标签 | 只请求 `/api/memories`，846ms 返回 200 |
| 首次风格标签 | 只请求 `/api/styles`，999ms 返回 200；内置风格正常显示 |
| 首次 MCP 标签 | 只请求 `/api/mcp?scope=user`，739ms 返回 200 |
| MCP 紧跟 200 后重复点击 | 设置域请求数 0 |
| grouped cache 不完整 | 三类时间戳未同时新鲜时，直接检查 Room 确认 `cached_payloads/settings` 与同步状态均不存在 |
| grouped cache 完整 | 同一窗口刷新后判定 `fresh=true`；Room 读到 915B `settings` payload 和精确 60 秒 `stale_after` |
| 缓存过期后离线 | 冷启动仍显示真实旧记忆，只尝试 `/api/memories` 并在 DNS 失败后保留内容；恢复网络后 1,522ms 返回 200 |

策略测试覆盖四标签资源映射、账户复用、stale 可见性、快速重进和整组缓存 TTL 边界；临时诊断日志在定位完成后已移除。

## 2026-07-11 · 同设备生产 Web / 原生交替对照

首次完成不受 HMR 影响的同设备对照。Web 使用当前源码对应的 Next.js 16.2.10 生产构建，运行在宿主机 `127.0.0.1:3001` 并通过 `adb reverse` 提供给模拟器 Chrome 149；原生使用非 debuggable、R8 优化、应用 Baseline Profile 且连接同一生产后端的 `profile` 变体。Chrome 与原生均登录 `android-e2e-20260711-0149@local.test`，原生已预热同账号 Room 缓存。设备仍为同一 Pixel 9 / Android 17 / 60Hz AVD，因此结果只证明当前模拟器上的相对差异，不替代正式真机验收。

### 首页可交互时间

采用 Web → 原生交替顺序运行 10 轮。Web 每轮禁用并清除 HTTP 缓存，计时终点为 textarea 已启用、首页免责声明出现且连续两个 `requestAnimationFrame` 已完成；Chrome 进程保持存活。原生每轮强制停止真实账号的 profile 进程，计时为 `am start -W` 的冷启动 `TotalTime`。这一设置对 Web 较有利，因为没有计入 Chrome 冷进程启动时间。

| 场景 | 最小 | P50 | P95 / 最大 | 平均 |
| --- | ---: | ---: | ---: | ---: |
| 生产 Web 可交互并完成两帧 | 312.1ms | 320.7ms | 474.1ms | 343.1ms |
| 同账号原生 R8 冷启动首帧 | 117.0ms | 126.0ms | 139.0ms | 127.9ms |

本轮原生 P50 比生产 Web 少 194.7ms，约快 60.7%；10 轮原生最慢样本 139ms 仍快于 Web 最快样本 312.1ms。两条链路的终点定义不完全相同，所以这里只给出 AVD 相对证据，不外推成真机最终结论。

### 同一真实 1,000 消息滚动

在测试管理员下临时插入同一条 1,000 消息链，Web 和 Debug 原生均通过真实 `/api/conversations/**` 读取，消息正文、Markdown 和父子链完全相同。Web 的滚动容器为 `flex-1 overflow-y-auto`，总高度 135,671px；两端每轮均执行 4 次向历史、4 次向最新的 300ms 手势，共 5 轮。Web 用前台页面 rAF 间隔计数，原生用系统 FrameStats 的 `FrameCompleted - IntendedVsync`。

| 场景 | 每轮 P50 | 每轮 P95 | 最大 | 超过 20ms | 超过 34ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| 生产 Web，5 轮 | 16.7–33.3ms | 150.0–233.3ms | 299.9ms | 142 / 390 | 110 / 390 |
| 原生同数据，5 轮 | 17.84–18.10ms | 19.52–19.78ms | 20.44ms | 7 / 596 | 0 / 596 |

当前 AVD 上，原生没有出现跨两帧的样本，而 Web 有 28.2% 的 rAF 间隔超过 34ms。Web rAF 与 Android FrameStats 的采集层不同，不能把绝对毫秒逐项等同，但二者使用同设备、同数据、同手势，并且尾部差距跨越一个数量级，足以作为模拟器阶段“原生滚动明显更稳”的直接证据。临时会话随后通过原生 UI 删除，数据库中的会话和 1,000 条消息计数均为 0。

复现工具：

```bash
ITERATIONS=10 node android/tools/web-performance-cdp.mjs
TARGET_PACKAGE=com.linhub.android.profile RUNS=10 zsh android/tools/compare-startup.zsh
RUNS=5 node android/tools/web-scroll-cdp.mjs
RUNS=5 zsh android/tools/native-scroll-framestats.zsh
```

## 2026-07-11 · Markdown AST 后台预热复验

长会话 Markdown 解析已从全局串行锁改为每线程独立 Parser，LRU 只在短临界区内访问；聊天列表会在 `Dispatchers.Default` 上预热当前可见区前后 48 条助手消息，并用 `collectLatest` 取消已经离开视口的窗口。UI 仍渲染同一份 CommonMark AST，没有降级成纯文本。

在与下方 13.0–14.3ms / 94.1–98.3ms 异常轮次相同的 Pixel 9 AVD 上，独立重跑两个 1,000 消息场景，各 10 次：

| 场景 | `frameDurationCpuMs` P50 | P95 | `frameOverrunMs` P50 | P95 |
| --- | ---: | ---: | ---: | ---: |
| 导航条开启 | 2.76ms | 4.37ms | -10.14ms | -8.60ms |
| 导航条关闭 | 2.98ms | 18.01ms | -11.66ms | 2.20ms |

P50 已恢复到此前稳定轮次约 3ms 的量级，导航条开启场景 P95 也恢复到 4.4ms；关闭场景 P95 仍有约 18ms 的尾部尖峰。该结果证明本轮线程安全与预热改造没有形成可重复回退，也明显优于紧邻的受污染异常轮次，但模拟器结果仍不能支撑“原生比 Web 更流畅”的最终结论。正式验收继续要求固定真机、同一数据集、Web/PWA 与原生交替运行并保留 Perfetto trace。

## 2026-07-11 · 文件中心闭环后的负载敏感性复验

本轮媒体修复不在启动或长会话热路径，但仍对当前 R8 `benchmark` 变体执行了完整 4 项设备回归，Baseline Profile、导航条开启/关闭长会话和冷启动全部通过。完整套件紧接 Web 生产构建、Android Lint、设备媒体渲染和 Baseline Profile 采集运行时，宿主机 WindowServer / Codex Renderer / Service 分别持续占用约 48% / 35% / 24% CPU；完整套件得到冷启动 P50 730.9ms、长会话 P50 18.0–18.8ms，明显属于受污染样本。

拆分套件后单独重跑，冷启动恢复到：

| 场景 | 最小 | P50 | 最大 |
| --- | ---: | ---: | ---: |
| 冷启动，10 次 | 129.4ms | 151.2ms | 231.4ms |

这与此前 135.3–156.3ms 的 AVD 中位数处于同一量级，说明 730.9ms 不是可重复启动回退。长会话拆分重跑仍受宿主机图形/调度影响，结果为：

| 场景 | `frameDurationCpuMs` P50 | P95 | `frameOverrunMs` P50 | P95 |
| --- | ---: | ---: | ---: | ---: |
| 导航条开启 | 13.0ms | 94.1ms | 22.3ms | 98.7ms |
| 导航条关闭 | 14.3ms | 98.3ms | 13.8ms | 99.3ms |

导航条开关两组同时出现相近退化，不能把异常归因于 Canvas 导航条，也不能以早前稳定轮次掩盖当前结果。当前结论是：启动无可重复回退；长列表模拟器尾部数据对宿主机负载高度敏感，仍是开放性能风险。正式“比 Web 更流畅”验收必须在同一台固定真机上交替运行 Web/PWA 与原生，并保留 Perfetto trace；在此之前不作完成声明。

## 2026-07-11 · 流恢复修复后回归

在加入首条消息失败恢复、POST 流终态校验和同会话 GET 续接后，重新执行 R8 `benchmark` 变体。首次全套运行中，两个长会话场景和 Baseline Profile 均通过；冷启动测试因为仍固定等待旧文案“你好，性能测试”，而产品首页已经按时段显示问候，产生测试夹具误报。将就绪条件改为稳定的专用用户文本“性能测试”后，冷启动 10 次全部通过。

| 场景 | 指标 | 最新结果 |
| --- | --- | ---: |
| 冷启动，10 次 | `timeToInitialDisplayMs` 最小 / P50 / 最大 | 117.1 / 135.3 / 194.6 ms |
| 1,000 消息，导航条开启，10 次 | `frameDurationCpuMs` P50 / P95 | 2.7 / 4.4 ms |
| 1,000 消息，导航条开启，10 次 | `frameOverrunMs` P50 / P95 | -10.9 / -7.9 ms |
| 1,000 消息，导航条关闭，10 次 | `frameDurationCpuMs` P50 / P95 | 2.8 / 4.6 ms |
| 1,000 消息，导航条关闭，10 次 | `frameOverrunMs` P50 / P95 | -10.7 / -7.7 ms |

冷启动 P50 相比同一 AVD 早前的 156.3 ms 低约 13.4%；长会话 P95 保持在 4.4–4.6 ms，且 P95 帧预算余量仍为负值，没有发现本轮恢复状态和错误 UI 引入的可重复性能回退。该结论仍只用于同一模拟器上的回归，不外推到真机。

## 2026-07-11 · Pixel 9 AVD 冒烟

- 系统：Android 17 / API 37（`CP31.260618.005`）
- ABI：`arm64-v8a`
- 内存页：16 KB
- AVD：`sdk_gphone16k_arm64`，4 核，4 GB，60 Hz
- 变体：非 debuggable、R8 优化的 `benchmark`
- 编译模式：`CompilationMode.Partial`
- 限制：模拟器 CPU 未锁频，运行时使用了 `EMULATOR` 精度警告抑制

执行命令：

```bash
./gradlew :benchmark:connectedBenchmarkAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.androidx.benchmark.suppressErrors=EMULATOR
```

### 结果

| 场景 | 指标 | 结果 |
| --- | --- | ---: |
| 冷启动，10 次 | `timeToInitialDisplayMs` P50 | 156.3 ms |
| 冷启动，10 次 | 观测 P95 / 最大值 | 182.7 ms |
| 1,000 消息往返滚动，10 次 | `frameDurationCpuMs` P50 | 2.6 ms |
| 1,000 消息往返滚动，10 次 | `frameDurationCpuMs` P95 | 19.2 ms |
| 1,000 消息往返滚动，10 次 | `frameOverrunMs` P50 | -11.5 ms |
| 1,000 消息往返滚动，10 次 | `frameOverrunMs` P95 | 3.6 ms |

冷启动原始样本（ms）：

```text
148.407, 149.241, 151.960, 153.078, 153.317,
159.205, 163.249, 168.333, 175.083, 182.742
```

Baseline Profile 生成器同时成功产出 8,854 条采集规则。原始 JSON、Profile 和 20 份 Perfetto trace 位于：

```text
benchmark/build/outputs/connected_android_test_additional_output/benchmark/connected/
```

## 2026-07-11 · 消息导航条与富文本回归

新增两个完全相同的 1,000 消息滚动场景，唯一变量是 Web“聊天消息导航条”是否启用。导航条使用单个 Canvas 绘制，最多显示 48 个采样标记；点击和拖动仍映射全部用户消息。常见“标题 + 普通列表 + 段落”回复同时改为单个原生富文本节点，代码、表格、任务列表、公式等复杂内容继续使用独立组件。

在相邻、反向顺序执行的 10 次测量中：

| 场景 | `frameDurationCpuMs` P50 | P95 | 10 轮总运行时间 |
| --- | ---: | ---: | ---: |
| 导航条开启 | 3.09 ms | 4.32 ms | 51.9 s |
| 导航条关闭 | 3.49 ms | 20.58 ms | 58.3 s |

这组数据没有显示 Canvas 导航条造成稳定回归，但不能据此断言开启导航更快：同一 AVD 在宿主机忙碌时曾出现 P50 14–15 ms、P95 152–172 ms，说明模拟器尾部数据高度受调度与温控状态影响。可复现结论仅限于：轻量富文本路径把稳定状态下的 P50 恢复到约 3 ms，且导航条的单 Canvas 实现没有引入可重复的帧时长劣化。真机验收仍必须使用交替顺序并保留 Perfetto trace。

设备交互复验覆盖：开关关闭后重启仍保持关闭、恢复开启后重启仍保持开启；导航条点击、连续拖动、上一条/下一条无障碍动作均可定位到对应用户消息。

### 本次设备验证发现并修复

1. `com.android.test` 的 benchmark APK 原先没有签名，Android 17 拒绝安装。
2. 测试 APK 与被测 APK 原先包名相同，引发 versionCode 0 → 1 的降级冲突。
3. Android 17 不再可靠解析仅指定 package 的隐式 Macrobenchmark launcher Intent，现改为显式 `MainActivity`。
4. 点击与拖动最初使用两个独立指针识别器，拖动会被点击手势抢占；现合并为单一手势循环，单击使用动画定位，拖动使用即时定位并在移动期间持续映射。

## 正式验收仍需

- 固定一台 API 35+ 真机，关闭省电模式并固定刷新率。
- 不抑制任何 Benchmark 错误，至少执行两轮并保留 P50/P95 与 Perfetto trace。
- 同一台真机、同一网络和同一数据集上测量 Web/PWA 冷启动、首屏和 1,000 消息滚动，才能支撑“比 Web 更快”的结论。
