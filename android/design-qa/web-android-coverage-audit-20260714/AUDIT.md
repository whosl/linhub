# Web → Android 原生 Compose 覆盖审计

日期：2026-07-14（Asia/Shanghai）  
审计对象：当前未提交工作区；Android 目录整体仍为 Git 未跟踪目录  
权威目标：原生 Compose 覆盖 Web 全部功能，并在代表性设备上具备更流畅动画和更快加载

## Findings

1. **完整目标仍未达到可声明完成的证据门槛。** 当前源码没有发现 Web `DataService` 功能域在 Android 网络层、ViewModel 和 Compose 页面三层同时缺失的情况；但“比 Web 更快、更流畅”只有 AVD 上的冷启动、长会话和部分导航对照，固定 API 35+ 真机的同数据、交替顺序、双方 trace 仍缺失。当前 AVD 慢尾也会随宿主窗口回压大幅漂移。
2. **支付与正式 App Links 仍是外部验收缺口。** 计费页面和订单 API 已接入；外部支付页返回现有明确的一次性全量刷新状态机，不再受 5 秒前台阈值或当前页面限制，但没有真实支付渠道成功/取消/失败闭环。Release 构建现已固定生产 HTTPS 域名、拒绝 unsigned 正式包，并用临时测试证书完成签名与 Manifest 验证；正式证书尚未确定，因此生产 `assetlinks.json` 与系统自动验证仍不能完成最终验收。
3. **Android 交付物尚未进入 Git 跟踪。** `android/` 当前整体为未跟踪目录；即使本机代码、APK 和设备证据完整，也不能把它视为已提交或可由其他环境稳定复现的交付物。
4. **页面入口和四个核心域的非空交互自动化已补齐，但高风险写分支仍不对称。** 无网络 R8 surface smoke 在窄屏自动进入工作区、设置、计费和管理后台共 22 个 surface；新增独立富数据 R8 smoke 又实际进入项目详情、切换项目标签、选择知识库、打开并取消两类删除确认、打开并取消技能编辑器、预览 Kotlin 文件。两套测试均为 0 OkHttp / 0 crash。管理后台、计费等真实成功、失败、重试、权限和写操作分支仍主要依赖 `DEVICE_E2E_RESULTS.md` 的人工 AVD 验收，确定性夹具不能替代真实服务端状态机证据。
5. **本轮修复了非聊天页面的前台恢复语义缺口。** Web QueryClient 在 30 秒后窗口重新聚焦会重新验证已挂载查询；Android 旧实现只在 5 秒后刷新会话和计费，项目、知识库、文件、技能、设置和管理后台可能长期保留旧内存快照。当前实现保留缓存先显，在 30 秒边界后只后台刷新当前可见功能域和用户；Pixel 9 AVD 文件页 31 秒回归准确发出用户、会话、媒体三个 GET，6 秒对照只有会话 GET。
6. **本轮继续补齐聊天核心配置的聚焦刷新。** Web 聊天页在 30 秒后会重新验证模型、风格、知识库、用户和上下文资源；Android 旧实现只刷新用户与会话，可能继续持有被管理员停用的模型。当前模型热刷新 reducer 会保留有效选择并对失效选择安全回退；Pixel 9 AVD 31 秒回归准确发出五类聊天核心 GET，6 秒对照仍只有会话 GET。
7. **本轮补齐网络重连后的自动恢复。** Web QueryClient 默认在重连时重新验证活动查询；Android 旧实现只显示网络状态 Snackbar。当前前台重连立即刷新，后台重连延迟到首个 `ON_START` 且只消费一次。Pixel 9 AVD 飞行模式两条路径均以真实业务 API 200 闭环；同时证明不能在当前区域网络依赖 Google `VALIDATED` 探测作为业务可达性的真值。
8. **此前修复了一个确定的加载性能缺口，并证明 Profile 真实生效。** 既有侧栏 Macrobenchmark 没有进入 Baseline Profile 生成旅程，导致项目、技能、知识库、文件、设置、计费和管理后台首次组合缺少安装时预编译覆盖。当前 Profile 已加入八页导航且没有扩大 Startup Profile；Profile-on/off 20 轮 A/B 的 ART 状态由 setup 硬断言，Perfetto 显示 App UI 主线程 `doFrame` P50/P95 中位数下降 34.1%/46.4%，而系统缓冲等待不变。
9. **本轮修复了 Artifact Markdown 预览的假复制状态。** Compose 旧实现给代码块传入空 `onCopyCode`，点击后仍显示“已复制”但系统剪贴板为空；Web 真实写入剪贴板。当前实现接入 `ClipboardManager`，Pixel 9 AVD 仪器化测试实际点击、读取并逐字符比对代码原文，同时验证“已复制代码”语义反馈。
10. **本轮补齐文件预览的代码块与复制语义。** Web 对原始代码/文本文件使用禁用运行的 `CodeBlock`，并让 Markdown/Office/CSV 中的代码块可复制；Android 旧实现前者只有等宽文本、后者没有复制回调。当前两条路径复用原生代码块并写入系统剪贴板，设备测试验证 `.kt` 不出现“运行”、两类文件复制原文均准确。
11. **本轮补齐 Artifact 系统分享的失败恢复。** Android 旧实现生成公开链接后若 `ACTION_SEND` chooser 无法启动，会吞掉异常并消费 URL；Web 至少保留手动复制回退。当前失败分支把同一 URL 写入系统剪贴板并显示明确 Snackbar，设备测试同时验证标准 chooser 内容与 `ActivityNotFoundException` 回退。
12. **本轮补齐外部链接的真实点击与失败恢复。** 文件中心 Markdown 旧实现使用默认空 `onLink`，链接只有样式且必定无效；聊天来源与 Artifact 会吞掉打开异常。当前三类入口统一到放行有效 HTTP/HTTPS/mailto 与当前后端站内路径的启动器，无处理器时复制链接并提示，危险/无效 scheme 明确拒绝。设备测试覆盖 5 个启动分支及文件/Artifact 两条真实 Compose 点击链。
13. **本轮修正了一条缺少代码证据的加载性能声明。** 旧文档声称文件首屏图片已预取，实际只有媒体 Room 元数据预取，Coil 请求仍由文件网格首次组合触发。当前核心工作区完成后后台预取前 6 张图片并跨导航保持；清空图片缓存 A/B 显示请求从文件页前移到聊天首页，缓存键不新增。benchmark 变体硬禁用且 22-surface smoke 无网络通过。
14. **本轮堵住了计费与管理后台同帧重复提交窗口。** 旧计费检查在协程内才发布 loading，旧后台 mutation 没有 single-flight 所有权；快速双击可能排队两个订单、兑换、余额赠送或兑换码生成。当前两域分别使用原子 gate，在创建协程前同步占位并在 `finally` 释放；32 路并发测试只有一个 owner，计费与后台互不阻塞。
15. **本轮把计费防重推进到服务端与崩溃恢复边界，并形成真实并发证据。** 旧随机订单 ID 无法抵御网络重放，旧兑换流程还存在卡密占用与入账跨事务窗口。Web/Android 现发送操作键，服务端派生稳定订单号并以条件更新事务只结算一次；Android 将未知结果的键持久化到 DataStore。兑换的占用、余额、流水、订单也已合并为一个事务。本地隔离 Postgres 的 2 路同键订单只产生 1 订单/1 流水/1 次入账；并发兑换 1 成 1 拒；强制流水失败会完整回滚卡密与余额。新后端已部署，AVD 冷启动读取全部 200，部署时间窗新增订单为 0。
16. **正式发布链路已从“可构建 unsigned 包”收紧为安全失败。** Release 默认绑定 `xiaolin.wenzhuolin.xyz`，签名四项缺一或 keystore 不存在会在 `preReleaseBuild` 失败；校验任务兼容 Configuration Cache。临时测试证书下的 R8 Release 已由 `apksigner` 验证为单 signer，Manifest 为 `com.linhub.android` 与生产 HTTPS App Link；Debug、Benchmark、Profile 保持独立包名与 Debug 证书。临时证书及 APK 已删除，最终证书与真机自动路由仍是外部门槛。
17. **用户侧写操作仍残留与旧计费相同的同帧重复提交窗口，现已统一收口。** 认证、技能、项目、知识库和设置旧实现进入协程后才发布 submitting/loading，快速双击可排队两个注册或创建/保存请求；Artifact 打开/分享也会重复请求。当前连同计费与后台划分七个独立 single-flight 域，在创建协程前同步占位并于 `finally` 释放；设置域覆盖资料、导出、默认模型、记忆、风格和 MCP。并发 gate 测试与完整六任务通过，R8 22-surface smoke 1/1，无生产写操作。
18. **工作区读取仍有协程启动前的重复窗口与并行 loading 提前清除，现已修复。** 项目、知识库、技能和 Artifact 旧加载器在进入协程后才登记 loading，相同资源可重复读取；知识库索引与文档任一先完成还会清除整个页面 loading。当前按资源键同步取得 in-flight 所有权，同键 32 路并发只有一个 owner、不同键可并行；页面 loading 用引用计数直到最后一个子资源结束。完整六任务和 R8 22-surface smoke 通过，真实冷启动五类 GET 各一次。
19. **计费与后台写入仍把提交后的读回失败误报成写入失败，现已拆分。** Web 在订单/兑换接口成功后立即反馈并异步失效查询；Android 旧实现要再等待四个账务 GET，后台批量导入模型、赠送余额和生成兑换码也等待二次读回。首个写请求已落库但读回失败时，用户会看到失败并可能重试重复写入，支付跳转还被额外延迟。当前统一为 `commit → publish → reconcile`：提交成功立即发布支付 URL、余额或生成结果，校准失败仅提示数据暂未刷新；兑换成功事件会清空输入，失败保留。JVM 阶段/取消/401测试、Pixel 9 Compose 测试和 R8 22-surface smoke 均通过，全程没有生产写操作。
20. **消息图片编辑仍有跨请求重复计费窗口，现已形成端到端幂等恢复。** 旧流程先生成媒体并计费，再 PATCH 消息；第二步断网或响应丢失后重试会再次调用模型。服务端现用用户与操作键派生固定媒体 ID，并提供同键 single-flight、结果 GET 和消息 PATCH 成功重放；Android 在生成前持久化操作，启动、前台和重连时只查询结果或重试关联。真实本地路由 32 次同键重放为唯一资产、0 额外用量，Room 设备测试证明旧操作不被普通缓存清理。新构建已原子部署，公网首页 200、未登录结果查询 401；没有调用生产图片上游。
21. **计费与后台 API 的可注入网络合同证据已补齐。** 既有测试覆盖 gate、幂等键和提交后校准，但未执行真实 Android OkHttp 编解码。新设备测试用 loopback MockWebServer 验证订单鉴权/幂等头/JSON/解析、401、250ms 未知结果超时，以及后台余额赠送、兑换码生成和 500 错误保真，4/4 通过。测试依赖不进入 App runtime，完整六任务和 R8 22-surface smoke 通过，且没有生产写操作。
22. **Web→Android 覆盖声明已有可执行漂移守卫。** 新 verifier 动态枚举 Web 80 个 service 方法、13 个页面与 58 个 API Route，对照 74 个唯一原生 API 目标、工作区目的地和 17 个 section 标签；新 Web 方法/页面/路由未映射、旧映射过期或原生目标消失都会失败。12 个 Android 超集能力单独登记，避免把额外能力误写成 Web 共同基线。当前脚本、强制 ESLint、TypeScript 与 Android JVM 回归通过。
23. **未跟踪 Android 工程已形成可执行交付边界，但尚未擅自暂存。** 初始 66MB 候选中的 4 个原始 Perfetto trace 共 30.51MB，现保留本机并由 `.gitignore` 排除；365 个源码/审计候选共 35.56MB。delivery verifier 拒绝构建产物、签名材料、本机配置、大文件、符号链接、8 类高置信秘密格式与绝对主机路径，并验证 Gradle Wrapper HTTPS、SHA-256 和执行权限；当前全部通过，0 未豁免秘密命中。

## Traceability Matrix

| 要求或阶段 | 期望行为 | 代码证据 | 测试/运行证据 | 状态 | 缺口 |
| --- | --- | --- | --- | --- | --- |
| 登录与会话 | 登录、注册、退出、恢复、401 失效、重复提交防护 | `AuthScreen.kt`、`LinHubApi.kt`、`LinHubViewModel.kt`、`SingleFlightMutationGate.kt` | AVD 注册开关、冷启动、撤销会话记录；32 路 gate 并发与七域隔离测试 | complete | 正式真机兼容性复验不影响 Web 功能覆盖 |
| 原生外壳 | Web 手机版侧栏、主题、字号、离线反馈 | `ChatScreen.kt`、`WorkspaceScreens.kt`、`Theme.kt`、`UiPreferenceStore.kt` | Pixel 9 AVD 侧栏、五档字号、冷启动恢复、网络切换 | partial | 固定真机视觉、动画和无障碍复验 |
| 模型与默认值 | 供应商分组、模型切换、默认模型、思考强度、停用后热回退 | `ChatScreen.kt`、`ThinkingPolicy.kt`、`ChatConfigurationPolicy.kt`、`LinHubViewModel.kt` | AVD 默认模型写回、离线回滚、冷启动；31 秒/6 秒聊天配置恢复 A/B；4 组 reducer 测试 | partial | 固定真机 E2E |
| 会话与消息树 | 新建、搜索、重命名、置顶、归档、移动、删除、分支 | `ChatScreen.kt`、`ConversationPatchPolicy.kt`、`ChatTranscriptReducer.kt` | 远端 AVD 全链路、失败保稿和回滚 | complete | — |
| 流式聊天 | NDJSON、停止、续接、终态、错误重试 | `LinHubApi.kt`、`LinHubViewModel.kt`、`BenchmarkFixtures.kt` | 真实远端断流续接；120 帧确定性基准 10/10 | partial | 真机流式帧时间与 Web 同数据对照 |
| 富文本与工具 | Markdown、代码、表格、公式、Mermaid、来源、工具卡、外链恢复 | `ui/markdown/**`、`ChatScreen.kt`、`ExternalLinkLauncher.kt` | 真实 Claude、Tavily、知识库、CSV、PPT、MCP；外链设备测试 5/5 | complete | — |
| 图片、附件、语音 | 生图、灯箱、下载、蒙版编辑、分块上传、ASR/TTS | `WorkspaceScreens.kt`、`ChatScreen.kt`、`WavAudioRecorder.kt` | 真实远端图片、17.35MB DOCX、ASR/TTS 闭环 | complete | 真机音频焦点与来电中断属于平台兼容性复验 |
| 图片编辑恢复 | 生成提交、消息关联、未知结果和进程重启不得重复调用图片模型或计费 | `image-edit-idempotency.ts`、`ImageEditOperationPolicy.kt`、`LinHubViewModel.kt`、`CacheDaos.kt` | 32 路同键唯一资产/0 额外用量；PATCH 重放；Room durable operation 1/1；生产 200/401 | complete | 真机进程终止兼容性随全局真机验收 |
| Artifact | 版本、预览、代码运行、Markdown 链接/代码复制、下载、系统分享及失败回退、公开深链 | `ArtifactDialog.kt`、`ArtifactShareLauncher.kt`、`ExternalLinkLauncher.kt`、`LinHubApi.kt` | 7 类作品、JS/Python、冷/热深链；代码复制、链接点击、分享回退设备测试 | complete | 正式 HTTPS 自动验证另列 |
| 项目、知识库、技能、文件 | Web 页面 CRUD、关联、上传、预览、代码复制/链接点击、分页与恢复 | `WorkspaceScreens.kt`、`SkillsScreen.kt`、`MediaPreviewDialog.kt`、`LinHubViewModel.kt` | AVD 真实远端 CRUD、缓存、部分失败和清理；文件预览复制/链接设备测试 3/3；富数据 R8 交互 smoke 1/1 | complete | — |
| 设置 | 账户、记忆、风格、MCP、导出 | `SettingsScreen.kt`、`UiPreferenceStore.kt` | AVD 四标签、CRUD、MCP、43,570B SAF 导出 | complete | Web 自身尚未接入的改密/删号不计为 Android 独有缺口 |
| 计费 | 套餐、充值、兑换、用量、流水 | `BillingScreen.kt`、`LinHubApi.kt`、`ExternalPaymentReturnPolicy.kt` | AVD 只读真实数据和四标签；支付返回状态机 JVM 回归；MockWebServer 成功/401/超时合同；未创建生产订单 | partial | 真实支付成功、取消、失败与服务端状态闭环 |
| 管理后台 | 供应商、模型、套餐、用户、审核、设置、MCP、兑换码、用量 | `AdminScreen.kt`、`LinHubViewModel.kt`、`LinHubApi.kt` | Lighthouse AVD 覆盖全部管理域；MockWebServer 成功/500 合同 | partial | 固定真机 E2E；高风险生产写操作仍需受控回归 |
| 缓存与加载 | Room stale-first、按标签读取、按资源 in-flight 去重、引用计数 loading、媒体图片预取、前台及网络重连重新验证 | `core/cache/**`、`SingleFlightRequestRegistry.kt`、`MediaThumbnailPrefetch.kt`、`NetworkStatusPolicy.kt`、`LinHubViewModel.kt` | v1→v2 迁移、离线读取、32 路同键并发、冷启动请求计数；文件页聚焦与图片缓存 A/B；飞行模式重连 E2E | complete | — |
| 安装时 Profile | 启动与高频用户路径进入 Baseline/Startup Profile | `baselineprofile/BaselineProfileGenerator.kt`、`app/src/main/*-prof.txt` | 4/4 设备采集；24,985 Baseline / 18,155 Startup | complete | Profile 本身完成；性能总目标仍需真机 A/B |
| 动画与加载优于 Web | 代表性路径原生稳定快于同数据 Web | `benchmark/**`、`BENCHMARK_RESULTS.md` | AVD 冷启动与 1,000 消息对照；导航 Profile-on/off 20 轮；流式 Perfetto | partial | Profile 已证明降低 App 首次组合成本；最终仍需固定真机、相同数据与双方 trace |
| 正式发布与 App Links | Release 签名、生产域名自动验证 | `app/build.gradle.kts`、`RELEASE.md`、`AndroidManifest.xml`、公开 Artifact API | unsigned Release 安全失败；临时证书 R8 APK 验签与生产 Manifest 通过；三类测试变体隔离通过 | partial | 正式证书、最终 SHA-256 与 Google DAL/系统真机复验 |

页面级自动化补充：`WorkspaceSurfaceSmokeTest` 已在 R8 benchmark 变体中自动验证 5 个工作区入口、设置 4 标签、计费 4 标签和管理后台 9 标签；目标进程无网络请求、无崩溃，完整记录见 `design-qa/workspace-surface-smoke-20260714/AUDIT.md`。

富数据交互自动化补充：`WorkspaceInteractionSmokeTest` 使用独立内存夹具实际进入项目详情和三个标签、知识库文档、技能编辑器与 Kotlin 文件预览，并打开后取消项目文件/知识文档删除确认。Pixel 9 AVD 1/1 通过（29.384 秒），原 22-surface smoke 同轮 1/1 通过（25.535 秒），两轮均无 OkHttp 或崩溃；记录见 `design-qa/workspace-interaction-smoke-20260714/AUDIT.md`。

高风险提交自动化补充：计费充值/订阅/兑换共享 single-flight gate，管理后台通用 mutation 使用独立 gate；所有权在协程创建前同步获取并由 `finally` 释放。单测覆盖重复提交、32 路并发唯一 owner、释放后重试和两域独立性；R8 22-surface smoke 1/1（22.403 秒），0 OkHttp / 0 crash。记录见 `design-qa/billing-admin-singleflight-20260714/AUDIT.md`。

提交后校准补充：订单、兑换、后台模型导入、余额赠送和兑换码生成不再把后续读回纳入“写入是否成功”的判断。`CommittedMutationPipeline` 保证成功值先进入 UI，再读回权威快照；校准失败保持成功语义，取消与 401 保持原控制流。Compose 测试验证兑换输入仅在成功事件后清空；R8 页面回归 1/1。记录见 `design-qa/postcommit-reconciliation-20260714/AUDIT.md`。

订单边界补充：Web/Android 请求均携带 `Idempotency-Key`，服务端以用户与键派生稳定订单号；Android DataStore 在超时、5xx 或进程终止后复用同语义键。订单 `pending→paid` 抢占、余额/流水或订阅写入位于同一事务，兑换的卡密占用与全部账务也合并为单事务。`npm run verify:billing-idempotency` 已真实验证同键订单并发、卡密并发与强制事务失败回滚，结束后临时对象为 0。Lighthouse staging production build 和可回滚部署成功，公网首页 200，AVD 冷启动 5 类 GET 全部 200，部署后没有新增订单。记录见 `design-qa/billing-idempotency-20260714/AUDIT.md`。

Artifact 交互自动化补充：`ArtifactMarkdownClipboardTest` 已在 Debug 变体的 Pixel 9 AVD 上实际点击 Markdown 代码块复制按钮、读取系统剪贴板并逐字符比对内容，避免仅凭“已复制”视觉状态误判完成；完整记录见 `design-qa/artifact-markdown-copy-20260714/AUDIT.md`。

文件预览自动化补充：`MediaPreviewClipboardTest` 已验证原始 `.kt` 预览沿用 Web 的“代码块可复制但不可运行”语义，以及 Markdown fenced code 的系统剪贴板闭环；两条设备测试均比对完整原文，记录见 `design-qa/media-preview-copy-20260714/AUDIT.md`。

系统分享自动化补充：`ArtifactShareLauncherTest` 已逐项验证标准 chooser 的 action、MIME 与 URL，并注入无分享目标异常验证系统剪贴板回退；与代码块复制测试合并运行 5/5 通过，记录见 `design-qa/artifact-share-fallback-20260714/AUDIT.md`。

外部链接自动化补充：`ExternalLinkLauncherTest` 覆盖 HTTPS、mailto、站内相对路径、安全拒绝和无处理器剪贴板回退；文件与 Artifact Markdown 另有真实 Compose 点击委托测试。链接、分享和复制四类测试合并运行 12/12 通过，记录见 `design-qa/external-link-recovery-20260714/AUDIT.md`。

媒体加载补充：只清 Coil 图片缓存的 A/B 证明旧版请求在文件页首次组合后才出现，最终版聊天首页已提前创建同一批 13 个缓存文件且进入文件页不新增键；R8 fixture 中预取硬禁用，22-surface smoke 无 OkHttp。记录见 `design-qa/media-thumbnail-prefetch-20260714/AUDIT.md`。

## 本轮 Profile 证据

- 新增 `generateWorkspaceNavigation`，覆盖设置、用量与订阅、管理后台、项目、技能、知识库、文件和新对话。
- `drawer-navigation` 夹具仅在 `BENCHMARK_ENABLED` 变体使用管理员角色；正常 Debug/Release 不受影响。
- 工作区导航单测 1/1 通过；全量 Profile 4/4 通过，configuration cache 成功复用。
- 最终 Profile：24,985 条 Baseline、18,155 条 Startup；七个目标页面的主 Compose 方法均可在 Baseline 文件中定位，设置/计费/后台没有进入 Startup 文件。
- 导航 Macrobenchmark 已扩为 Profile-on/off 各 10 轮，setup 直接断言 ART `speed-profile` 状态。Profile 组 UI 主线程 `doFrame` P50/P95 的逐轮中位数下降 34.1%/46.4%，但系统缓冲等待保持约 212ms，故只证明 App 成本下降，不宣称 AVD/真机端到端 P95 已达标。
- `testDebugUnitTest`、`lintDebug`、`assembleDebug`、`assembleBenchmark`、`:benchmark:assembleBenchmark` 全部通过；最新 Debug APK 已安装回 `emulator-5554`，前台 Activity 正确且 crash buffer 为空。

## Progress Summary

当前工作区已经具备覆盖 Web 主要页面和 `DataService` 接口面的原生实现，且多个 Android 路径超出 Web 当前占位能力。不能给出“100% 完成”结论：支付、正式 App Links 和固定真机性能对照仍是明确的验收门槛；Android 目录未进入 Git 也使交付状态仍不完整。

## Next Work

1. 在固定 API 35+ 真机执行冷启动、工作区导航、1,000 消息滚动和 120 帧流式聊天，与同账号 Web/PWA 交替采样并保留双方 trace。
2. 接入或拿到真实支付测试渠道后，在现有 stable order ID、原子结算和一次性支付返回刷新链路上验证订单成功、取消、失败及回调重放。
3. 确定 Release keystore 后更新生产 `assetlinks.json`，验证 `com.linhub.android` 的 HTTPS 自动路由。
4. 在用户确认提交边界后运行 `npm run verify:android-delivery` 并把当前 Android 工程纳入可审查的 Git 变更；当前 365 个候选已通过交付检查，但本轮没有擅自暂存。计费与后台 API 的可注入成功/401/500/超时合同层已完成，后续只在需要更细 UI 状态证据时继续扩展 ViewModel 级逐接口夹具。
