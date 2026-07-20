# LinHub Android 设备端 E2E 记录

本文只记录真实 Debug App、真实本地后端和设备 UI 读回结果；benchmark 假数据、静态代码搜索和设计截图不计入功能 E2E。

## 2026-07-11 · Android 17 AVD

- 设备：Pixel 9 AVD，Android 17 / API 37，`arm64-v8a`，16 KB 内存页。
- 应用：`com.linhub.android.debug`，Debug APK；早期链路直连宿主机 `http://10.0.2.2:3000/`，文件/知识库链路使用 `adb reverse` + `http://127.0.0.1:3000/`。
- 账号：`android-e2e-20260711-0149@local.test`，管理员。
- 设备策略：按用户决定不使用 MuMu；后续自动化固定使用 Android Studio Pixel 9 AVD（`emulator-5554`），正式兼容性结论再补 API 35+ 真机。

### 已验证主链路

| 功能 | 操作与设备读回 | 结果 |
| --- | --- | --- |
| 会话恢复 | 强制停止后冷启动 Debug App，首页读到“早上好，Android E2E”与真实模型 `GPT-5.4 mini` | 通过 |
| Room v1→v2 非破坏迁移 | 在 Pixel 9 AVD 上用 Room 导出的真实 v1 schema 建独立账户缓存库，写入用户、模型、会话、消息和同步游标后执行生产 `MIGRATION_1_2`；Room 完整 schema 校验通过，五类旧数据逐字段读回，新增 `cached_payloads` 表写入并读回 `PAYLOAD-V2-OK`。仪器测试前后均删除独立数据库，随后恢复生产地址 Debug APK 与普通用户登录态并再次冷启动 | 通过 |
| 注册与新账号冷启动恢复 | 从登录页切换注册，使用原生昵称/邮箱/密码输入创建 `AuthE2E`；进入首页读到“下午好，AuthE2E”，强制停止并冷启动后仍直接恢复相同账号 | 通过 |
| 注册即时开关 | 在主 AVD 用户中从原生管理后台关闭“开放注册”，数据库只把 `registration_enabled` 改为 `false`；切换到临时 Android 用户 10 的全新 App 数据空间，用完整昵称/邮箱/密码提交时生产接口返回 403，原生保留表单并显示“当前未开放注册，请联系管理员”，数据库该邮箱仍为 0。再从原生后台恢复开关后，同一隔离用户和同一表单返回 200，首页读到“晚上好，AuthToggleE2E”；强制停止后冷启动仍恢复账号，`/api/me`、模型和会话均为 200。临时账号、会话、Android 用户 10 和管理员角色均已删除或恢复，两个全局开关最终均为 `true`；截图为 `registration-toggle-off-admin.png`、`registration-disabled-native.png`、`registration-enabled-native.png` 和 `registration-enabled-cold-start.png` | 通过 |
| 退出与重新登录 | 从侧栏账户菜单点击“退出登录”，原生端回到“欢迎回来”；随后用新账号重新输入邮箱和密码，成功返回 `AuthE2E` 首页 | 通过 |
| 过期会话处理 | 管理员从服务端删除临时账号并级联撤销会话；App 保留旧本地令牌冷启动时 `/api/me` 返回 401，原生端自动清除 Keystore 令牌、账户 Room 缓存并回到登录页。验收后管理员测试账号已重新登录 | 通过 |
| Web 同款侧栏 | 打开左侧抽屉，读到新对话、搜索、项目、技能、知识库、文件、历史会话和账户入口 | 通过 |
| 会话完整操作闭环 | Lighthouse 远端创建 `Android_Conversation_Ops_E2E` 会话后，原生侧栏依次完成重命名、置顶到“已置顶”区、归档到“已归档”区；搜索 `Android_Conversation` 仍命中归档会话并能打开。随后取消归档，创建 `Conversation_Ops_Project_E2E`，会话菜单新增“移动到项目”，移动后项目分组立即出现并显示成功提示；再点“移出项目”返回普通置顶分组。最终通过原生 UI 删除会话和项目，项目页恢复空状态 | 通过 |
| 外观主题选择与恢复 | 账户菜单进入“外观”，原生读到浅色、深色、跟随系统三项和当前主题标记；在系统浅色下选择深色后，首页、抽屉、系统栏和深色 token 立即切换。强制停止并冷启动后仍保持深色；再选“跟随系统”后恢复系统浅色。最终已恢复跟随系统，设备截图保存在 `android/design-qa/theme-*-final.png` | 通过 |
| 项目页 | 从抽屉进入，读到“项目”“新建项目”“还没有项目” | 通过 |
| 项目 CRUD | 创建 `Android-E2E-Project`，读回名称、描述和 0 会话/文件/知识库计数；读取删除影响提示并确认删除，恢复空状态 | 通过 |
| 项目 Web 手机版同构详情 | 使用远端域名 Debug APK 从紧凑项目整卡进入独立详情，读到“全部项目”、摘要与“对话 / 项目文件 / 项目设置”三标签；文件标签显示真实项目文件和关联知识库，设置标签显示默认模型、项目指令和删除危险区。项目信息编辑、模型菜单、项目指令、文件删除确认、项目删除确认和新建项目均只打开后取消，返回列表后项目与文件仍在；语义树读到每张卡的 `打开项目「名称」`，未修改服务端业务数据 | 通过 |
| 项目批次部分失败 | 在 `Project-Batch-E2Ek` 中同批选择 111B TXT 与不支持的 `.linhub-invalid`；服务端只新增 TXT，编辑器保留真实文件名与 111B 大小，失败项提示完整显示 `android-project-batch-invalid.linhub-invalid`，未暴露 DocumentsUI 内部 URI | 通过 |
| 项目上传会话过期中止 | 保留两项待上传选择并撤销当前会话；首个上传请求 401 后 App 立即清除本地令牌、取消整个批次并返回登录页，显示“登录已失效，请重新登录”，项目附件计数保持 2、第二项未继续上传。随后原样恢复会话并冷启动回到首页 | 通过 |
| 技能页 | 从抽屉进入，读到“我的技能”“技能广场”“创建技能” | 通过 |
| 技能 CRUD | 创建带描述、系统提示词和开场白的 `Android-E2E-Skill`，列表读回后确认删除，恢复“还没有自定义技能” | 通过 |
| Prompt Skill 编辑与提交审核 | 非管理员 owner 的私有 `Skill E2E Draft` 在原生编辑器改名、改描述、改系统提示词并勾选“分享到技能广场”；列表显示“审核中”，API 读回 `visibility=pending / reviewStatus=pending` | 通过 |
| 技能审核通过与拒绝 | 管理员原生后台在“技能审核”对同一技能先点“通过”，广场读到“已公开”且 API 为 `public/approved`；owner 再次提交第三版后，管理员点“拒绝”，owner 原生列表读到“未通过”且 API 为 `private/rejected` | 通过 |
| 关闭审核后直接公开 | 从原生管理后台关闭“技能广场需要审核”，恢复普通用户后创建并勾选公开 `Direct-Publish-E2E-20260712`；“我的技能”立即显示“已公开”，数据库读回 `visibility=public / reviewStatus=approved / publishedAt!=null`、pending 数为 0，原生“技能广场”也显示同一技能。回归同时修复并部署了生产 `/api/skills` 创建/编辑公开技能漏写 `reviewStatus/publishedAt` 的旧路由。最终从原生 UI 删除技能，数据库同名计数为 0；审核与注册开关均恢复为开启，账号恢复普通用户并经冷启动确认不再显示“管理后台”。截图为 `skill-review-toggle-off-admin.png`、`skill-direct-publish-my-skills.png` 和 `skill-direct-publish-market.png` | 通过 |
| Pack Skill 详情与资源 | 技能广场打开内置 `PPT 演示文稿助手` 详情，读到 v1.0.0、`LinHub native`、5 项工具、1 个资源；点击“查看”后读到完整的 PPTX 原生能力说明 | 通过 |
| Pack Skill 上下文对话 | 从 Pack 详情进入新对话，首页显示技能名称与说明；发送 `Reply_exactly_PACK_SKILL_E2E_OK` 后读到技能化回复和“重新生成”，服务端唯一会话记录的 `skillId` 为 `skill-pptx-native` | 通过 |
| 知识库页 | 从抽屉进入，读到“知识库”“新建知识库”“还没有知识库” | 通过 |
| 知识库 CRUD | 创建 `Android-E2E-KB`，进入详情读到空文档状态；读取级联删除提示并确认删除，恢复空状态 | 通过 |
| 知识库文档处理 | DocumentsUI 选择确定性 4,002B 文本；UI 读到 `android-knowledge-project-e2e.txt`、`2 个片段 · text`，数据库状态为 `ready`、`chunk_count=2`，两个 `kb_chunks` 中包含验收口令 `LNHUB-NATIVE-KB-417` | 通过 |
| 知识库批次部分失败与即时状态 | DocumentsUI 同批选择有效文本和空文本；详情无需退出重进即同时显示 `1 个片段 · text` 与 `无法从文件中提取文本`，Snackbar 汇总 `已上传 1 个文档，1 个失败` 并使用真实文件名 `android-knowledge-batch-empty.txt`，不再暴露 `msf:*` 内部 URI ID | 通过 |
| 知识库异步失败轮询 | 人工种入 `processing` 文档后，原生详情先显示“处理中”；服务端记录转为 `error` 后，1.5 秒轮询自动更新为 `异步解析失败 E2E-409`，无需手动刷新或重进页面 | 通过 |
| 知识库聊天工具与默认手动路由 | Lighthouse 创建 `Android_Knowledge_Tool_E2E` 并上传单片段文档；原生工具面板读到智能选择关闭、资料检索开启、知识库已勾选。发送英文“selected knowledge base”请求后出现 `检索知识库「verification phrase answer number」` 工具卡，回复精确包含 `ORCHID-COMET-7429 / 314159`；会话、文档、知识库和 fixture 均已清理 | 通过 |
| 表格分析工具结构卡 | 通过 DocumentsUI 上传 119B CSV 并在真实远端会话调用 `analyze_spreadsheet`；原生工具卡读到 `1 个工作表`，展开后显示 `CSV / 4 行 / region · product · units · revenue` 与三条样例行。真实回复准确给出总收入 `705`、West 收入 `495`、最高收入产品 `ORBIT-BETA / 275`；会话、消息、媒体资产、设备下载和 fixture 均已清理 | 通过 |
| PPT 提取工具结构卡 | 通过 DocumentsUI 上传确定性三页 PPTX；首轮暴露手动路由下 PPT builtin 未挂载，修复后又暴露私有媒体附件不可读。两处服务端修复并部署后，同一 AVD 重新生成成功调用 `pptx_extract_text`；卡片显示 `3 页演示文稿`，展开逐页显示三个标题、每页 `3 个文本块 · 含备注`，回复准确读出 `NEBULA-2048`、`September 2027`、`Aurora Team` 与三条备注；全部测试数据已清理 | 通过 |
| MCP 聊天工具卡 | 使用原生设置页创建并测试 `Android-MCP-Chat-E2E`，读到 `connected · 2 个工具`；聊天工具面板在智能选择关闭时显式勾选该服务器，独立会话成功调用 `device_status_android_e2e`。原生工具卡展开显示 `isError:false` 与 `ANDROID_MCP_STATUS_OK_731`，最终回复逐字一致；会话、连接器、临时隧道、服务和测试额度均已清理 | 通过 |
| 知识库冷启动读回 | 强制停止并冷启动后，列表读到 `1 份文档 · 2 个片段`，详情仍读到文件名与两个片段；验证了 Room 快照先显和网络刷新后的稳定结果 | 通过 |
| 项目文件镜像与自动关联 | 在项目编辑器选择“同时加入知识库”，通过 DocumentsUI 上传同一文件；数据库同时生成 1 个项目附件、第二个 `ready / 2 chunks` 知识库文档和 1 条 `project_knowledge_bases` 关联 | 通过 |
| 项目关联状态一致性 | 首轮验证发现镜像自动关联后继续点“保存”会因编辑器旧勾选状态删除关联；加入 `LaunchedEffect(project.id, knowledgeBaseIds)` 同步后，界面立即显示知识库已勾选，保存后数据库关联仍为 1 | 通过 |
| 项目/知识库冷启动读回 | 强制停止并冷启动后，项目卡读到 `1 个文件 · 1 个知识库`；知识库卡读到 `2 份文档 · 4 个片段`，详情读到两份同名文档且各 2 个片段 | 通过 |
| 项目与知识库清理 | 通过 UI 验证项目文件删除；删除项目后项目、附件与关联均为 0；删除知识库后文档与片段均为 0。发现整库删除仅级联数据库、遗留 `data/kb-docs` 原文件，修复 API 后以新建/上传/整库删除回归确认磁盘文件同步移除 | 通过 |
| 文件页 | 从抽屉进入，读到“全部”“上传”“生成”和真实空状态 | 通过 |
| 系统文件上传 | DocumentsUI 从 Downloads 选择 40B 文本文件，聊天附件队列读回文件名；服务端 `media_assets` 生成唯一 `text/plain` 资产 | 通过 |
| 聊天多附件、纯附件与断网重试 | Lighthouse 远端 Debug APK 通过 DocumentsUI 一次多选 96B TXT 与 48B CSV，输入框留空直接发送；用户消息同时展示两个文件，真实 Claude 回复逐项读出两个文件名、TXT 标识符 `LINHUB_CHAT_ATTACHMENT_A_20260712` 和 CSV 值 `42`。飞行模式下再选文件会立即显示“网络已断开，请联网后重试”，恢复网络后点击同一重试按钮成功进入附件栏；另在 2.57MB 上传进行中切飞行模式，OkHttp 调用即时取消并保留文件名、重试与移除按钮，不再停在“已上传 100%”等待 6 分钟。最终从侧栏删除会话、从文件中心删除 3 个远端媒体资产，并清空设备 Downloads | 通过 |
| 文件中心删除 | 文件中心读到上传资产，确认删除后 UI 恢复空状态，数据库同名资产计数为 0 | 通过 |
| 多格式原生预览 | 上传确定性 PNG、TXT、Markdown、Kotlin 和两页 PDF；图片进入带缩放/编辑/下载的全屏灯箱，文本读到 `LNHUB-MEDIA-TEXT-417`，Markdown 原生渲染标题、列表、表格并读到 `LNHUB-MEDIA-MARKDOWN-417`，Kotlin 等宽预览读到 `LNHUB-MEDIA-CODE-417`，PDF `PdfRenderer` 同时暴露“PDF 第 1 页/第 2 页”并在截图中读到两页验收口令 | 通过 |
| 17.35MB Office 分块上传 | 真实 17,351,044B DOCX 单 multipart 首轮约 158 秒被公网边缘重置；改为 4MB 起自动使用 1MB 鉴权分块后，同一 AVD 连续完成 17 块上传，服务端校验大小、组装、Mammoth 提取并自动清空临时目录，未再出现 `ECONNRESET` | 通过 |
| Office 轻量列表与按需预览 | `/api/media?limit=100` 对包含大 DOCX 的列表响应仅 1,170B，不含 `extractedText`，但带 `extractedTextAvailable=true`；冷启动文件页后点开 DOCX，只调用 metadata 路由并在 488ms 内展示 458 字符和两个验收口令，没有下载 17.35MB 原文件 | 通过 |
| Office 大文件 SAF 下载 | 从原生 Office 预览保存 DOCX 到 Downloads；下载响应为 17,351,044B，设备文件与生成 fixture 的 SHA-256 均为 `45d5560b36bcbf5a47e7b11316f3c93f4b7a8464a6c1b3f44d940ee0b8e4ffe2` | 通过 |
| PDF 后端与生产构建 | 首次 PDF 上传因 Turbopack 把 `pdf.worker.mjs` 错指向 `.next/dev/server/chunks` 返回 422；将 `pdf-parse/pdfjs-dist` 按 Next 16 官方配置设为服务端外部依赖后，开发服务器和全量生产构建运行时均上传 200、抽取 2 页文本。生产探针资产已立即删除 | 通过 |
| PDF 按需字节策略 | PDF 媒体已有 `extractedText` 时客户端原策略错误跳过原文件下载，预览显示“当前格式无法直接预览”；调整为 PDF 始终按需取原文件并补单测后，设备一次加载完成两页惰性渲染 | 通过 |
| SAF 下载完整性 | 从纯文本预览启动 DocumentsUI `CreateDocument` 保存到 Downloads；设备文件与仓库 fixture 均为 159B，SHA-256 同为 `723add43b33919cc13d0dc85a25be7945dfef59a13f9d2b966f63215665ce670` | 通过 |
| 媒体关联会话 | 原生重新上传 fixture 并真实发送短对话；服务端将资产回写到唯一 `conversationId/messageId`，文件预览出现“打开关联会话”。首次点击发现当前已选同一会话时导航提前返回，修复为仅在已处于聊天页时短路后，设备从文件页成功返回并读到原附件、用户消息和回复 | 通过 |
| 文件中心完整清理 | 删除本轮 1 个会话和 7 个媒体资产；API 列表剩余 0，`media_assets`、`attachments`、`conversations`、`messages` 对应计数均为 0，`data/media` 无命中文件，模拟器 Downloads 为空 | 通过 |
| 设置页 | 从账户菜单进入，读到账户、记忆、回复风格、MCP 连接器、界面、导航条、导出和删除账户区域 | 通过 |
| 设置 Web 手机版同构复验 | 用当前 Web 官方 mock 数据在 360×808 视口重新截图账户、记忆、回复风格和 MCP，并与远端真实账号 Pixel 9 AVD 同状态逐屏对照。账户页结构保持同构；记忆页由横排改为 Web 同款纵向输入/全宽添加，卡片补齐脑图标、边框、阴影和 `6 天前` 相对时间；回复风格补齐说明、自定义风格按钮、默认风格选择卡和无多余图标的紧凑卡片。默认菜单打开后点外部关闭、自定义弹窗和记忆删除确认均取消，真实记忆、默认风格和 MCP 未修改；完整单测、Lint、Debug、R8 Benchmark 与 Benchmark 测试 APK 在 93.96 秒内通过 | 通过 |
| 头像更新 | DocumentsUI 选择 6,920B PNG 后显示“头像已更新”，`users.image` 写入 `/api/media/att-8f3897ca3fb94570`，文件中心生成唯一 `image/png` 资产；强制停止并冷启动后，侧栏仍读到 `Android E2E的头像`。验证后已清除头像、媒体资产和设备测试文件 | 通过 |
| 默认模型写回 | 模型菜单为每个可用模型提供独立星标按钮；将默认模型从有效默认 `GPT-5.4 mini` 改为 `Claude Haiku 4.5` 后，星标和当前模型同时切换，`users.default_model_id` 写入 `m-38866567`；强制停止并冷启动后仍恢复 Claude。移除 ADB reverse 后尝试改回 GPT，12 秒网络失败后星标与数据库仍保持 Claude；随后恢复反向端口并清理测试数据 | 通过 |
| 账户数据导出 | SAF 写入 Downloads，后台完成 43,570B JSON；读回全部顶层业务域，敏感字段名扫描未发现密码、令牌、API Key、加密头、存储路径或向量 | 通过 |
| 记忆 CRUD | 添加 `Android E2E memory`，读回成功提示与删除入口，确认删除后列表移除 | 通过 |
| 回复风格 CRUD | 创建 `Android-E2E-Style`，读回名称、描述和成功提示，确认删除后列表移除 | 通过 |
| MCP 失败分支 | 创建启用的 `Android-E2E-MCP`，测试不可达地址后显示明确连接错误且无崩溃，随后确认删除 | 通过 |
| MCP 成功与密钥生命周期 | 使用 `android/tools/mcp-e2e-server.mjs` 建立 Streamable HTTP 端点；原生端创建连接器后发现并落库 `echo_android_e2e`、`device_status_android_e2e` 两个工具。端点先观测到 `alpha-secret-1234567890`，编辑后只观测到 `beta-secret-0987654321`，选择“清除已有请求头”后数据库密文为 `NULL` 且端点观测到无密钥请求；三次均显示连接成功，最后通过 UI 删除并确认数据库计数为 0 | 通过 |
| 计费页 | 从账户菜单进入，读到当前套餐、订阅套餐、充值和余额流水 | 通过 |
| 管理后台 | 从管理员账户菜单进入，读到供应商、模型与计价、套餐、用户、技能审核和系统设置 | 通过 |
| 管理员用户详情 | 用户列表读到真实角色、余额和订阅；详情读到注册时间、赠送余额/订阅操作，以及逐条用量和余额流水 | 通过 |
| 管理员用户整页详情与动画 | 用户详情由 AlertDialog 改成 Web 手机版同构的整页视图，设备读到返回用户列表、赠送余额、头像/账户/余额卡、订阅卡、用量/流水切换和危险操作区；列表与详情通过 180ms 原生横向淡入切换，截图保存在 `android/design-qa/admin-user-detail-web-parity-final.png` | 通过 |
| 管理员赠送余额与失败重试 | 为临时普通用户按“元”输入 `1.23`，数据库精确新增 `123` 分流水并把余额从 300 更新为 423；再次输入 `2.34` 后移除 ADB reverse，15 秒后弹窗和原金额仍保留且数据库仍为 423。恢复 reverse 后直接重试，新增 `234` 分流水并更新为 657，弹窗仅在成功后关闭 | 通过 |
| 管理员订阅、删除与权限分支 | 为同一临时用户选择 Family Pass 并输入 7 天，数据库订阅剩余 `7.0` 天且 UI 读到套餐、无限额度和到期日；删除前出现“删除后无法撤销”的二次确认，确认后用户、订阅、流水和登录会话计数均为 0。当前登录管理员的删除按钮语义节点 `enabled=false`，并显示“当前登录账号不能在这里删除”；截图保存在 `android/design-qa/admin-user-delete-confirm-final.png` 和 `admin-self-delete-disabled-final.png` | 通过 |
| 管理员供应商写操作与窄屏布局 | 原生创建带加密密钥和自定义 Base URL 的 `Admin-Provider-E2E`，数据库读到 `kind=openai / enabled=true / storeEnabled=true` 且只有密文；编辑器把类型改为 `anthropic` 并改名后，服务端正确写回新类型，原密钥密文逐字节不变。禁用后密钥仍保留；点击测试读到“无法连接供应商模型接口，请检查 Base URL 或网络”。同时把窄屏卡片改成信息/开关与操作分行，名称和 URL 不再被按钮挤成逐字换行，截图保存在 `android/design-qa/admin-provider-mobile-layout-final.png` | 通过 |
| 管理员模型写操作与局部更新保护 | 在临时供应商下从原生编辑器创建 `Admin Model E2E`：`reasoning/tools`、入 11/出 22 分/M、图片 33、上下文 128000、最大输出 4096、排序 99 均正确落库。启用模型后描述、图片单价、最大输出和全部计价保持不变，证明局部启停不再误清空可空字段；模型测试读到“供应商未启用”。随后通过编辑器把描述、图片单价和最大输出显式清空为 SQL `NULL`，其余字段仍保留；删除确认明确提示历史用量记录保留，确认后模型计数为 0 | 通过 |
| 管理员套餐写操作 | 原生创建 `Admin Plan E2E`，数据库读到月价 1234 分、额度 `-1`、`pro` 和功能 `FEATURE_ONE_E2E`；编辑后名称和月价更新为 `Admin Plan E2E-Edited / 2345`，其余配置不变。通过 Web 同款开关停用后完整配置仍保留，截图保存在 `android/design-qa/admin-plan-write-final.png`。验收后临时套餐和供应商均已清理，三类测试数据最终计数均为 0 | 通过 |
| 管理员系统设置分域保存 | 联网搜索引擎从原生端写入临时 Base URL 与 API Key 后，数据库中图像/TTS/ASR 三域密文哈希全部保持不变；再次只改 Base URL 且 Key 留空，Tavily 密文逐字节保持。使用未保存的 `/draft` 地址测试连接后读到“域名解析失败”，草稿和“有未保存更改”仍在。最终用数据库备份行完整恢复全局设置；失败草稿截图保存在 `android/design-qa/admin-engine-draft-failure-final.png` | 通过 |
| 管理员全局 MCP 完整生命周期 | 通过原生编辑器创建 `Android-MCP-E2E`，数据库确认新服务器 `enabled=false / defaultEnabled=false` 且请求头仅存密文；使用 `android/tools/mcp-e2e-server.mjs` 测试后状态为 `connected`、发现 2 个工具，端点读到 `first-secret`。开关启用和编辑时留空保存均保持请求头密文不变，选择“清除已有请求头”后密文为 `NULL`；停服后测试状态为 `error` 且服务器记录仍保留。删除前出现不可撤销二次确认，截图保存在 `android/design-qa/admin-mcp-delete-confirm-final.png`，确认后全局 MCP 计数为 0 | 通过 |
| 管理员兑换码校验与生成 | 面额 `99` 分、数量 `51` 时原生端同时显示“面额至少 1 元 / 数量必须为 1–50”，生成按钮语义为 `enabled=false`；改为 100 分、2 个后通过 UI 生成两条兑换码，列表读到两条 `¥1.00 · 未使用` 且数据库金额/数量一致。截图保存在 `android/design-qa/admin-redeem-validation-final.png` 和 `admin-redeem-generated-final.png`；本轮两条记录已按完整代码精确删除，历史兑换码未动 | 通过 |
| 真实流式聊天 | 新对话发送 `Reply exactly Android E2E OK`，先出现“停止生成”，随后读到回复 `Android E2E OK` 和“重新生成” | 通过 |
| 消息编辑、双层分支与冷启动恢复 | 原生发送 `BRANCH_ORIGINAL` 后把根用户消息编辑重发为 `BRANCH_EDITED`，UI 立即显示用户分支 `2/2`；左右切换可在原始/编辑后的用户与回复之间往返，数据库 `current_leaf_id` 同步切换。对编辑分支的助手回复执行重新生成后，助手层独立显示 `2/2`，数据库形成两个相同父节点的助手兄弟分支。强制停止并冷启动、从侧栏重新打开会话后，两层 `2/2` 与当前叶子完整恢复 | 通过 |
| 引用、反馈与编辑断网重试 | 引用当前助手回复后发送 `Reply_exactly_QUOTE_OK`，数据库新用户消息的 `quoted_text` 精确为 `BRANCH_EDITED_OK`；“有帮助 / 没有帮助 / 再次点击清除”依次落库为 `up / down / NULL`。首次编辑重发在断开 `adb reverse` 后会显示“网络连接失败”，修复前编辑框立即关闭并丢稿；现改为在服务端返回新分支前保持编辑态，设备读回完整 `Reply_exactly_FAIL_DRAFT_RETAIN_OK` 和可再次点击的发送按钮，数据库失败轮次为 0 条。恢复网络后直接重试成功，用户分支变为 `3/3`；截图保存在 `android/design-qa/message-branch-edit-retry-final.png`。最后通过原生 UI 删除测试会话，数据库会话与消息计数均为 0 | 通过 |
| 生成进程中断恢复 | 发送要求生成 80 行并以 `STREAM-RECOVERY-DONE` 结束的长回复，在界面仍显示“生成中”时强制停止 App；服务端消息最终为 `complete`，冷启动后通过正文搜索打开会话并读到结束标记 | 通过 |
| 首条消息断网与重试 | 移除 `adb reverse tcp:3000` 后发送 `NETWORK_RETRY_PASS_E2E_20260711`；原生端持续显示“网络连接失败，请检查网络后重试”，输入原文未丢失且出现“重试”。恢复 reverse 后点击重试，先进入“停止生成”，随后读到模型回复、自动标题“网络重试通过”和“重新生成”；服务端只创建 1 个匹配会话，验收后已删除 | 通过 |
| 生成中途断流自动续接 | 使用 `android/tools/chat-drop-proxy.mjs` 把 Android 的 POST 流在 954B 处主动断开，同时保持服务端生成任务运行；客户端检测到缺少 `done/error` 终态后回源，logcat 显示同一会话随即发起 `GET /api/chat?conversationId=...`，最终 UI 读到第 200 行、`MIDSTREAM_PROXY_DONE` 和“重新生成”。数据库搜索只得到 1 个匹配会话，验收后已删除 | 通过 |
| 会话落库 | 回复完成后侧栏出现自动标题“AndroidE2E通过”；进程重启后仍存在 | 通过 |
| 会话置顶 | 打开会话操作选择置顶，侧栏出现“已置顶”分组和语义状态 | 通过 |
| 项目分组置顶、折叠与冷启动恢复 | 创建 `Drawer-Pin-E2E` 并从项目上下文生成真实会话“项目PIN端到端”；侧栏项目菜单选择置顶后，项目和子会话整体移动到“已置顶”区，并暴露“已置顶项目”语义。折叠后子会话消失且语义变为“展开项目”；强制停止并冷启动后，无需先进入项目页，抽屉直接从项目 payload 恢复同一置顶/折叠状态。该轮同时发现并修复启动只加载会话、不加载项目索引导致冷启动抽屉缺分组的问题。最终取消置顶、恢复展开并删除测试会话/项目，数据库对应计数均为 0 | 通过 |
| 项目侧栏完整菜单与定向编辑 | `Drawer-Menu-E2E` 的更多菜单读到“置顶”“编辑项目”“在项目中新对话”“删除项目”四项；点击编辑后关闭抽屉、进入项目页并直接打开对应编辑器，编辑器读回正确项目名 | 通过 |
| 项目上下文新对话空状态 | 从侧栏选择“在项目中新对话”，聊天页读到项目首字图标、`Drawer-Menu-E2E`、`将在此项目中创建对话` 和 `在「Drawer-Menu-E2E」中发消息…`，截图保存在 `android/design-qa/project-pending-chat-final.png` | 通过 |
| 侧栏删除项目的会话保留语义 | 删除确认框明确提示“项目内会话会保留并移回普通会话”；确认后数据库项目计数为 0，原会话仍存在且 `project_id = NULL`，抽屉把它恢复为普通会话。随后通过原生 UI 删除测试会话，项目和会话最终计数均为 0；确认框截图保存在 `android/design-qa/project-delete-confirm-final.png` | 通过 |
| 消息导航 | 真实聊天显示右侧消息导航；1,000 消息 benchmark 会话已验证点击与连续拖动终点 | 通过 |
| 计费一致性 | 本次短消息产生唯一 `usage_records` 与 `ledger` 记录，成本 2 分，余额从 269 分结算为 267 分 | 通过 |
| 稳定性 | 本轮 logcat 未发现 Debug App 的 FATAL、ANR 或 `NetworkOnMainThreadException` | 通过 |

断网复验同时修复了三个交付风险：失败前 Compose 会清空草稿且空会话不持续展示流错误；HTTP 提前 EOF 但没有异常时会被误判为正常结束；重新打包 Debug APK 若遗漏 `LINHUB_DEBUG_BASE_URL`，则会回退到 `10.0.2.2` 而绕开 `adb reverse`。该轮 APK 使用 `http://127.0.0.1:3000/` 完成往返验证；当前 Debug APK 已按下方远端域名重新构建。

### Lighthouse + Cloudflare 远端联调

2026-07-12 使用 `https://xiaolin.wenzhuolin.xyz/` 构建 Debug APK 并安装到 Pixel 9 AVD。该域名通过 Cloudflare Tunnel 回源 Lighthouse 的 `127.0.0.1:3006`；Mac 实测首页返回 200，而腾讯 EdgeOne 域名在 5 秒连接超时内未建立 TCP。现有 Web 站点 `lin.wenzhuolin.xyz` 继续使用腾讯 EdgeOne 且不改动；Android 远端调试与性能观测固定使用 `xiaolin.wenzhuolin.xyz`，避免 EdgeOne 链路延迟混入原生基线。远端旧构建缺少 Better Auth Bearer 插件，加入本地已有的 `bearer()` 配置并完成 Next.js 16.2.10 Turbopack 生产构建、systemd 重启后，原生端验证通过：

- 注册与登录、`/api/me`、模型、会话和项目接口均返回成功，登出后 token 立即失效。
- 原生登录后读到远端用户与 `Claude Haiku 4.5`，发送 `Reply with OK only.` 后收到流式回复 `OK`。
- 强制停止 Debug App 后冷启动仍恢复远端用户和模型，验证 Keystore 会话持久化。
- 测试会话通过原生侧栏删除，API 复核远端会话列表为 `[]`；账号保留用于后续联调。

### 全局断网与恢复提示

Pixel 9 AVD 在已登录首页切换飞行模式后，`Active default network` 从网络 ID 变为 `none`，原生底部 Snackbar 显示“网络已断开，部分功能不可用”；关闭飞行模式、默认网络恢复后显示“网络已恢复”。两种状态均通过设备截图核对。

首次实现要求 `NET_CAPABILITY_VALIDATED`，但 API 37.1 AVD 的可用外网被系统标记为 `PARTIAL_CONNECTIVITY`，导致应用启动即误判离线。现改为跟踪系统默认网络的 `NET_CAPABILITY_INTERNET`，并由 `onLost` 判定真正断网；这样既能覆盖飞行模式，又不会把仍能访问 Lighthouse/Cloudflare 的模拟器网络误报为离线。状态转换策略已有本地单元测试，设备恢复后网络 ID 重新建立，远端聊天状态不受影响。

### Lighthouse 图片生成与三入口编辑闭环

远端管理配置中的真实图像引擎为 `gpt-image-2`，单张价格 56 分。原生端从聊天工具请求 `Generate a simple square image: a red circle centered on a white background. No text.`，收到并展示 1024×1024 红圆白底 PNG；工具卡、消息图片和全屏灯箱均正常。使用系统下载后，设备 `Download/linhub-image.png` 为 794,986B、1024×1024，证明下载任务完成后的字节与尺寸有效。

- 消息图片编辑：在 Compose Canvas 上绘制可见蒙版并输入 `Change the red circle to blue. Keep the white background.`。先把 Android 系统代理指向不可达端口，提交失败后灯箱仍停留在编辑模式、描述和蒙版完整、按钮可直接重试；数据库余额保持 235 分，`image-edit` 与 `edited` 资产均为 0。恢复 Cloudflare 域名访问后原地重试，灯箱自动关闭、消息图片变为蓝圆，消息 part 更新为新的 `/api/media/{id}`；只新增 1 条编辑资产和 1 条 56 分计费，余额变为 179 分。
- 文件中心编辑：文件页同时显示红色生成图与蓝色消息编辑图。从蓝图进入灯箱并要求改成绿色；断网失败仍保留编辑现场且余额/计费不变，恢复网络后直接重试成功，灯箱关闭并立即刷新出绿色新资产。余额从 179 分变为 123 分，编辑资产和计费记录都只增加 1 条。
- 待发送附件编辑：通过 DocumentsUI 选择刚下载的红图，上传完成后从附件缩略图进入同一原生灯箱并要求改成紫色。断网失败同样保留描述、蒙版和重试按钮且 0 扣费；联网重试后附件缩略图变成紫圆，余额从 123 分变为 67 分，仍只增加 1 条编辑资产和 1 条 56 分计费。
- 服务端兼容性：首次消息编辑成功返回 `/api/media/{id}`，但 Lighthouse 旧消息回写路由只允许 `/generated`、`/uploads`。将路由同步为接受私有媒体 URL，并在回写前调用所有权校验；Next.js 16.2.10 Turbopack 生产构建通过，`linhub.service` 重启后消息回写为 200。
- 清理：通过原生侧栏删除图片测试会话，通过文件中心逐项删除 1 个上传、1 个生成和 3 个编辑资产，并删除模拟器下载文件。数据库最终 `test_conversations / test_messages / media_assets = 0 / 0 / 0`；3 条真实 `image-edit` 用量历史按计费审计要求保留。

### Lighthouse ASR 与 TTS 闭环

远端 TTS/ASR 使用已有 MiMo 配置，Android 继续通过 Cloudflare 域名访问。Pixel 9 AVD 首次点击语音输入弹出系统 `RECORD_AUDIO` 权限，选择“While using the app”后按钮切成“停止录音”；停止时原生 `AudioRecord` 生成 16kHz PCM16/WAV 并通过 multipart 上传。

- ASR：`POST /api/voice/transcribe` 在 22.2 秒返回 200，AVD 虚拟麦克风提供的合成语音被识别为完整西班牙语句并自动回填输入框，证明权限、录音、WAV、上传、上游识别和草稿合并均贯通。坐标自动化期间输入框高度改变，额外触发了两次短录音；本轮实际共 3 次 ASR 200，数据库精确新增 3 条 `engine:asr` 用量、每条 3 分。该虚拟音频可证明协议链路，但真人环境识别率仍留给真机复验。
- TTS：发送识别文本获得真实助手回复后点击“朗读”，`POST /api/voice/tts` 在 13.3 秒返回 480,768B MP3。语义按钮变为“停止朗读”；`dumpsys audio` 读到 LinHub `MediaPlayer` 为 started、24,000Hz、单声道、`USAGE_ASSISTANCE_ACCESSIBILITY / CONTENT_TYPE_SPEECH`。点击停止后按钮恢复“朗读”，播放器记录 `stopped` 后 `released`。数据库只新增 1 条 `engine:tts` 用量，价格 2 分。
- 计费与清理：本轮余额 67→53 分，对应 3 次 ASR 共 9 分、1 次聊天 3 分、1 次 TTS 2 分。语音测试会话通过原生侧栏删除，数据库同标题会话为 0、测试账号媒体资产仍为 0；真实用量与流水按审计要求保留。

### 真实混合 Markdown、公式与 Mermaid 回归

使用远端 `Claude Haiku 4.5` 生成包含标题、粗体、无序列表、任务列表、Kotlin 代码、显示公式和 Mermaid 流程图的真实助手消息。初次设备读回中，原生标题/粗体/列表/任务框/代码高亮正常，但公式与 Mermaid 两个隔离 WebView 都显示 `data:text/html... ERR_HTTP_RESPONSE_CODE_FAILURE`。

- 根因一：Android 17 WebView 的 `loadDataWithBaseURL` 会把主文档暴露为 `data:` 请求，原请求拦截器只允许 jsDelivr，把主页面本身返回为 403。新增共享纯函数策略，只允许本地 `data:`、释放时的 `about:` 和 `https://cdn.jsdelivr.net`，继续拒绝 HTTP、其他 HTTPS、`file:` 与 `content:`；修复后 KaTeX 正确排版 `E = mc²`。
- 根因二：Mermaid 页的 CSP 只允许 CDN，却没有授权应用内联的 module 启动脚本，因此静态 import 执行前就被拦，页面只保留 `flowchart LR / A --> B` 源码。改成带 `nonce="linhub-mermaid"` 的可信启动 module，并在 `try` 中动态 import，使 CDN/解析错误能显示；复装 APK 后真实显示两个节点和 A→B 箭头。
- GFM 表格：模型连续两次忽略“块间空行”，服务端原文为无效 GFM，所以最初按普通文本显示。仅在专用测试消息中补入表格前后两处空行后重新打开会话，语义树分别读到 `Column 1 / Column 2 / Data 1 / Data 2`，截图同时显示标准表头、数据行、任务框、代码、公式和 Mermaid，证明合法 GFM 的原生二维表格链路有效。
- 回归保护：新增隔离请求白名单和 Mermaid CSP/转义单测；全量 `testDebugUnitTest`、`lintDebug`、远端 Base URL Debug 构建通过。专用会话已通过原生侧栏删除，数据库同标题会话与测试账号媒体资产均为 0。

### Tavily 搜索、网页读取与来源外跳

在新对话确认原生工具面板的智能选择、联网搜索、图片、代码和资料检索开关均为启用，然后发送 `Use web search to find the current UTC time from time.is and cite the source URL. Do not answer from memory.`。真实 Claude 流中先出现说明文本和 `搜索「time.is current UTC time」/ 6 个来源` 工具卡，随后追加 `阅读 time.is / 1 个来源`，最终正文给出 UTC 时间与 `https://time.is/UTC`。

- 展开搜索工具卡后，原生端逐项显示 6 个来源的标题和摘要，包括 Time.is、TickCounter、UTC Time Now、24TimeZones 等；服务端消息 part 为 `web_search success`，有 6 个结构化 `url/title/snippet`。
- 第二张工具卡为 `web_read success`，包含 Time.is 页面正文和唯一来源。数据库产生 2 条 `engine:web-search` 用量，每条 1 分；本轮 Claude 回复为 23 分，计费总计 25 分且无重复记录。
- 点击首个来源后系统切换到 Chrome，地址栏明确读到 `time.is/UTC`，证明 `ACTION_VIEW` 外跳 URL 正确。Chrome 渲染该页数秒后，API 37.1 AVD 的 qemu 进程两次退出；一次为坏快照 `Failed to find ColorBuffer / bad color buffer handle`，禁用快照并改用 SwiftShader 后仍出现 `I/O thread spun for 1000 iterations`。这属于整台模拟器/gfxstream 退出而非 LinHub Activity 崩溃；冷启动后 App 会话和登录态均完整。真机仍需复验浏览器返回行为。
- 最终再次冷启动 AVD，仅通过原生侧栏删除工具测试会话；数据库该会话与测试账号媒体资产均为 0，真实搜索/聊天用量历史保留。

### 知识库资料检索与默认手动路由

按产品决定把 Web、Android 与服务端的智能路由默认值统一为关闭；用户显式开启时服务端仍尊重该选择，Skill 不再覆盖用户开关。Pixel 9 AVD 打开新装 Debug APK 的工具面板，语义树确认“智能选择”`checked=false`，联网、图片、代码和资料检索仍保持各自默认开启。

- 在 Lighthouse 创建 `Android_Knowledge_Tool_E2E`，上传 `android-knowledge-tool-e2e.txt`，服务端读到 `1 个文档 · 1 个片段`；原生检索范围中同名知识库为 `checked=true`。
- 发送 `Use the selected knowledge base. Return the exact verification phrase and answer number.` 后，原生消息流先展示 `检索知识库「verification phrase answer number」` 工具卡，再返回“验证短语：ORCHID-COMET-7429 / 答案号：314159”。这证明英文 selected/uploaded/private document 意图、工具挂载、流事件 reducer、原生工具卡和模型结果已端到端贯通。
- 服务端该轮用户消息参数为 `autoRouting=false / knowledgeSearch=true / knowledgeBaseIds=[kb-a0273fa2dd39]`，验证默认手动路由没有阻断显式资料检索。
- 验收后通过原生侧栏删除测试会话，通过知识库详情依次删除文档和知识库；列表恢复“还没有知识库”，本地与设备 fixture 均无残留。

### 知识库批次部分失败、异步状态与磁盘清理

以同一批 DocumentsUI 多选同时上传 `android-knowledge-batch-ok.txt` 和空文件 `android-knowledge-batch-empty.txt`。首轮发现服务端会为解析失败保留 `status=error` 文档，但客户端只把成功 POST 的返回值并入 Compose 状态，因此错误项必须退出详情后再进入才能看到；失败汇总还直接使用 `Uri.lastPathSegment`，显示成 `msf:3533` 一类内部 ID。

- 批次结束后现在统一回源 `/api/knowledge/{id}/documents`，把服务端的 `ready / processing / error` 权威列表写入 Compose 状态与 Room 快照；失败项则使用 `readContent()` 从 SAF 解析出的真实显示名。
- Pixel 9 AVD 无需退出页面即同时读到有效文件的 `1 个片段 · text` 和空文件的 `无法从文件中提取文本`；Snackbar 显示 `已上传 1 个文档，1 个失败`，下一行精确为 `android-knowledge-batch-empty.txt：无法从文件中提取文本`。截图保存在 `android/design-qa/knowledge-batch-partial-failure-final.png`。
- 另种入一条 `processing` 文档，界面先显示“处理中”；数据库把同一记录更新为 `error` 后，1.5 秒轮询自动显示 `异步解析失败 E2E-409`。截图保存在 `android/design-qa/knowledge-processing-error-poll-final.png`。
- 检查 Lighthouse 生产源码时发现本地已有的整库磁盘清理修复尚未部署：数据库级联删除后会遗留 `data/kb-docs` 原文件。同步 `src/app/api/knowledge/[id]/route.ts` 后完成生产构建与服务重启，再从原生 UI 新建知识库、上传文档并整库删除；数据库中的知识库和文档均为 0，对应磁盘文件为 `absent`。
- 验收后清理了批次知识库、轮询记录、运行时探针、AVD Downloads、本地 fixture、远端孤儿文件和部署回退目录；测试账号的 `data/kb-docs` 文件数为 0。

### 表格分析结构卡与服务端摘要修复

在 Lighthouse 生产后端创建独立会话，通过 Android Studio Pixel 9 AVD 的 DocumentsUI 上传 119B `android-spreadsheet-tool-e2e.csv`，真实调用 `analyze_spreadsheet`。首轮工具执行成功且模型能读取表格，但原生卡片只能显示文本摘要，未出现工作表结构。

- 根因是工具真实输出为 `name / sheets / text`，而服务端 `summarizeToolResult()` 持久化工具结果时没有保留 `name/sheets`；同一路径也会丢失 PPT 的 `slideCount/slides/layouts`。这不是 Compose 渲染问题。
- `ToolResultSummary` 已补齐表格与 PPT 结构字段，服务端摘要现在最多保留 12 个工作表、60 张幻灯片和 60 个版式，避免无界放大消息记录；修复已部署到 Lighthouse 生产构建。
- 在同一 AVD 会话重新生成后，折叠卡显示 `1 个工作表`；展开读到 `CSV`、`4 行`、`region · product · units · revenue` 与三条原生样例行。模型回复同时准确给出总收入 `705`、West 收入 `495`、最高收入产品 `ORBIT-BETA / 275`。
- 最终通过原生 UI 删除会话与文件中心资产，并删除设备 Downloads 和本地 fixture；数据库核对该测试会话、消息和媒体资产计数均为 0。

### PPT 提取结构卡与私有附件读取修复

使用 `pptxgenjs` 生成确定性三页 `android-pptx-tool-e2e.pptx`：标题依次为 `PITCH-ORION-731 / Market Signals / Action Plan`，正文包含 `NEBULA-2048 / September 2027 / Aurora Team`，每页分别带 `SPEAKER-NOTE-ALPHA/BETA/GAMMA`。通过 Android Studio Pixel 9 AVD 的 DocumentsUI 上传后，在智能路由保持关闭的真实 Lighthouse 会话要求调用 PPTX 提取工具。

- 首轮服务端路由已把 `pptx` 列入 `selectedBuiltins`，但工具装配代码错误地把 `buildPptxTools()` 放在 `toolSkill.kind === "pack"` 分支内；手动路由不会自动选择 Pack Skill，因此模型只拿到通用 `analyze_spreadsheet` 并报“仅支持 .xlsx / .xls / .csv / .tsv”。现改为 PPT builtin 或 Pack Skill 任一入口命中都会挂载专用工具，并明确禁止用表格工具处理 PPTX。
- 第二轮模型已调用 `pptx_extract_text`，但报“附件路径不可读取”。根因是 Android 上传统一落到私有 `media_assets`，`attachments.storage_path` 只保存 `/api/media/{id}` 鉴权 URL，而旧 PPT 工具只读取 `data/uploads`。现改为附件所有权校验后优先通过私有媒体记录读取字节，同时保留旧生成附件路径兼容。
- 两处修复均完成 TypeScript、定向 ESLint、本地与 Lighthouse 生产构建，并在服务重启后通过同一会话再次重新生成。原生折叠卡显示 `3 页演示文稿`；展开后显示 `演示文稿结构 / 3 页`，以及三行 `标题 · 3 个文本块 · 含备注`。完整工具结果和最终回复均读到全部确定性正文与备注。
- 验收后通过原生侧栏删除会话、从文件中心删除 PPTX，并清理 AVD Downloads 和本地 fixture；数据库核对会话、消息、附件、媒体资产计数均为 0。结构卡截图保存在 `android/design-qa/pptx-tool-structured-card-final.png`。

### MCP 聊天工具调用与结果卡

扩展 `android/tools/mcp-e2e-server.mjs` 的确定性端点，使 `tools/call` 可返回 `ANDROID_MCP_ECHO:*` 和 `ANDROID_MCP_STATUS_OK_731`。端点运行在 Lighthouse 本机，并仅在本轮通过临时 Cloudflare Quick Tunnel 暴露为生产 SSRF 规则允许的 HTTPS 地址；未放宽生产内网访问限制。

- 在原生设置的 MCP 连接器页创建 `Android-MCP-Chat-E2E`，首次测试时 Quick Tunnel DNS 尚未完全传播，界面如实显示 `error`；暖链路后原地重试读到 `connected · 2 个工具` 和“连接成功，发现 2 个工具”，工具名为 `echo_android_e2e / device_status_android_e2e`。
- 新对话打开工具面板，语义树确认智能选择仍为关闭，MCP 服务器初始未勾选；手动勾选后，用户消息落库的 `mcpServerIds` 与 `selectedMcpServerIds` 均精确为该连接器 ID，证明默认手动路由没有绕过用户选择。
- 首次同时调用两个工具时，Echo 工具成功返回 `ANDROID_MCP_ECHO:ORBIT-MCP-8642`，并发的状态请求遇到 Quick Tunnel 瞬时 `fetch failed`；原生端同时正确展示成功卡和错误卡。随后独立调用状态工具成功，服务端工具 part 为 `state=success`，结果含 `structuredContent.status=ANDROID_MCP_STATUS_OK_731 / isError=false`。
- 干净独立会话复验只调用状态工具，原生折叠卡显示带服务器前缀的工具名；展开卡显示完整 MCP JSON 结果，最终正文逐字返回 `ANDROID_MCP_STATUS_OK_731`。截图保存在 `android/design-qa/mcp-chat-tool-card-final.png`。
- 最终通过原生侧栏删除两个会话、通过设置页删除连接器；数据库会话、消息和 MCP 记录均为 0。临时 Quick Tunnel、Node 服务和测试文件已移除；一次性 1,000 分测试赠额已完整回滚，4 条真实 MCP 聊天用量（47 分）按既有测试策略保留。

### 项目临时对话与新建上下文语义

对照 Web `ChatHeader` 发现 Android 顶部加号原先无论上下文都调用普通 `newConversation()`：在项目空状态点击会悄悄丢项目但显示普通问候；在已有项目会话点击也会错误丢掉项目。新增纯策略层区分顶部和侧栏入口，并把 `temporaryProjectChat` 纳入原生状态：

- 创建专用 `Temp-Chat-E2Ek` 项目并点击“在项目中对话”，设备读到项目首字图标、项目名、`将在此项目中创建对话`、项目专属输入提示，顶部加号语义为“发起临时对话”。
- 点击该按钮后项目上下文被清除，页面显示 Web 同款 `临时对话 / 这是临时对话，不会使用项目文件或关联知识库。`，输入提示恢复普通聊天，顶部按钮恢复“新增对话”；再从侧栏“新对话”进入后临时标记清除并恢复 `夜深了，Android 远端测试` 普通问候。
- 从项目中新建并真实发送 `Reply OK only.`，收到 `OK` 且服务端会话属于该项目；随后在已有项目会话点击顶部“新增对话”，设备重新读到同一项目空状态与“发起临时对话”，证明项目上下文被继承。该最短回复只产生 1 分聊天用量。
- 默认模型也纳入同一转换：普通/临时新对话恢复账户默认，项目新对话优先项目默认；三种上下文分支都有纯策略单测。全量单测、Lint、远端 Base URL Debug 构建通过。
- 通过原生 UI 删除测试会话和项目，数据库专用项目、会话与测试账号媒体资产最终均为 0；用量历史保留。

### 项目聊天面包屑与定向详情

Web 聊天顶栏在项目上下文显示 `项目名 / 会话名`，项目名可直接进入 `/projects/{id}`；Android 原先只有会话标题。新增项目面包屑与独立无障碍点击区域，并复用项目页已有的会话详情弹层作为原生定向详情目标：

- 创建空项目 `Breadcrumb-E2E` 并进入项目新对话后，截图读到 `Breadcrumb-E2E / 新对话`，项目名语义为 `进入项目「Breadcrumb-E2E」`；下方项目首字图标、标题、项目输入提示保持原布局，窄屏没有挤压右侧新增/设置按钮。
- 点击面包屑项目名后，页面切换到原生项目页并自动打开 `Breadcrumb-E2E · 对话` 详情，空状态显示“项目里还没有可用会话”，同时提供“关闭/新对话”。该请求使用一次性 `projectConversationRequestId`，消费后清除，避免返回项目页时重复弹出。
- 已有项目会话使用同一标题结构，标题本身继续支持点击重命名；项目名与会话名拥有独立点击语义。全量单测、Lint 和远端 Base URL Debug 构建通过。
- 验证后通过原生项目页删除专用项目，数据库同名项目与测试账号媒体资产均为 0。

### 项目上下文建议卡

Web 在项目新对话中使用四个项目专属建议，并在项目没有文件时隐藏“概述项目文件”；Android 原先始终显示普通首页的六个建议。补齐同一筛选逻辑后创建无文件项目 `Prompt-E2E`，设备只读到：

- `📋 总结项目资料` → 总结项目资料与关联知识库；
- `🧭 按指令规划下一步` → 按项目指令规划；
- `📚 基于知识库提问` → 带项目知识库上下文提问。

设备语义树没有“概述项目文件”，也没有普通首页的“帮我写作/联网调研/画张图”等建议；项目面包屑和专属输入提示仍正常。代码在 `project.files.isNotEmpty()` 时才加入第四张 `📁 概述项目文件`，与 Web 的 `requiresFiles` 条件一致。全量单测、Lint、远端 Base URL Debug 构建通过；测试项目经原生 UI 删除，数据库项目与媒体资产为 0。

### 项目批次部分失败与会话过期中止

在 Lighthouse 生产后端和 Android Studio Pixel 9 AVD 上创建 `Project-Batch-E2Ek`，通过 DocumentsUI 同批选择 `android-project-batch-ok.txt` 与 `android-project-batch-invalid.linhub-invalid`：

- 有效 TXT 为 111B，上传后立即留在项目编辑器；不支持扩展名由 `/api/upload` 返回 400，数据库每轮只增加一条有效附件，没有为失败项产生附件或媒体记录。
- 项目批次原先在读取成功、服务端拒绝时仍用 `Uri.lastPathSegment` 汇总，可能显示 `msf:*`。现与知识库路径一致，在 `readContent()` 后保存 SAF 解析的 `picked.name`；设备失败提示完整读到 `android-project-batch-invalid.linhub-invalid：不支持的文件类型「.linhub-invalid」`。纯函数回归测试同时锁定“已上传 1 个项目文件，1 个步骤失败”及真实文件名。
- 会话过期分支在 DocumentsUI 已选择两项后执行：先备份当前 Better Auth 会话，再从服务端撤销；首个上传请求返回 401 后，`expireSession()` 清除 Keystore 令牌、取消 `viewModelScope` 中的上传任务并重置页面。设备立即回到登录页并显示“登录已失效，请重新登录”，数据库附件数保持撤销前的 2，证明第二项没有继续上传。截图保存在 `android/design-qa/project-upload-session-expired-final.png`。
- 验收后原样恢复服务端会话和设备加密登录态，强制停止并冷启动后首页读回“下午好，Android 远端测试”。最后通过原生 UI 删除测试项目；数据库项目、附件、媒体记录均为 0，临时会话备份表也已删除。

### Office 大文件分块上传、轻量列表与按需预览

使用文档技能和固定随机种子生成一页有效 DOCX：内嵌 2400×2400 高熵 PNG，使文件达到 17,351,044B，同时保留 `LNHUB-OFFICE-LARGE-20260712` 与 `LIGHTWEIGHT_METADATA_E2E` 两个文本口令。LibreOffice 渲染为单页，标题、正文、图片与页脚无裁切或重叠，ZIP 完整性检查通过。

- 首次沿用单 multipart 上传时，Android 在 60 秒后仍显示 0%，Lighthouse 于约 158 秒记录 `ECONNRESET`，数据库没有媒体或附件脏记录。这证明 20MB 客户端限制虽然存在，慢上行仍无法穿过公网边缘层。
- 新增兼容分块协议：4MB 以下继续走原快速路径；4MB 起先创建所有权绑定的上传任务，再按 1MB 顺序 PUT。每块校验索引和精确长度、支持同索引安全重试；完成端确认所有块齐全及总大小后才组装、解析并写媒体/附件，失败或完成都会清理临时目录。项目文件复用同一协议，取消任务会尝试删除服务器临时块。
- Pixel 9 AVD 公网上行仅约 25–30KB/s，但 17 个分块均在单请求超时前完成，界面进度从 0% 持续增加；约 14 分钟后服务端生成唯一 `att-e1752b39a86d4258`，大小精确为 17,351,044B，提取文本为 458 字符并包含两个口令，`data/upload-chunks` 恢复为空。
- 文件列表原先会把每项最多 100k 字符的 `extractedText` 一起下发并写入 Room，100 项时会无谓放大首屏。现数据库查询本身不再选择正文，只返回 `extractedTextAvailable`；本轮包含大 DOCX 的 100 项列表 JSON 仅 1,170B，且确认没有 `extractedText` 字段。
- 原生与 Web 预览均改为点开后访问 `/api/media/{id}/metadata`。冷启动进入文件页再打开 DOCX，logcat 只出现 metadata GET，488ms 返回后原生正文完整显示；没有请求原始 `/api/media/{id}`。截图保存在 `android/design-qa/office-large-lazy-preview-final.png`。
- 点击下载时才请求原文件；设备保存文件与 fixture 的 SHA-256 同为 `45d5560b36bcbf5a47e7b11316f3c93f4b7a8464a6c1b3f44d940ee0b8e4ffe2`。验收后通过原生文件页删除大 DOCX 和前三轮项目批次遗留媒体，数据库对应媒体/附件均为 0；同时清理 AVD Downloads、服务端分块目录、本地 fixture 与部署备份。

### 长会话“回到底部”

Web 在用户滚离最新消息时显示“回到底部”；Android 原先只停止自动跟随，没有返回入口。新增 40dp 原生圆形浮动按钮，按 `LazyListState.canScrollForward` 以淡入+0.82 倍缩放出现/退场；点击时恢复流式跟随，并动画滚到 `layoutInfo.totalItemsCount - 1`，因此流错误卡也包含在真实底部。

- 为专用账号插入一条不计费的 30 消息线性测试链。首次打开位于第 1–6 条，语义树读到“回到底部”；点击后显示第 25–30 条，按钮从语义树移除。
- 再从底部向上滑到第 22–27 条，按钮重新出现，证明不是一次性状态；右侧消息导航条仍可并存，没有遮挡。
- 全量单测、Lint 和远端 Base URL Debug 构建通过。测试会话经原生侧栏删除，数据库会话/消息为 `0 / 0`，测试账号媒体资产为 0。

### Lighthouse Artifact 与代码运行闭环

在远端测试账号下创建独立 `Artifact 全链路 E2E` 会话及 7 个确定性作品，通过原生工具卡逐项验收 HTML、React、SVG、Markdown、Mermaid、JavaScript 和 Python：

- HTML 正常渲染；React 首帧读到 `REACT_ARTIFACT_E2E_OK / COUNT_0`，设备点击后变为 `COUNT_1`。首次复验发现 WebView 放在 `AnimatedContent` 中会越过标签栏绘制并产生触摸坐标偏移，改为裁剪的 keyed 容器后首帧和点击稳定。
- Markdown 原生语义树读到标题、列表及 `Artifact / PASS` 表格；Mermaid 截图读到 `MERMAID_ARTIFACT_E2E_OK → PASS`。SVG 首轮为空白，CDP 证明 Android WebView 把百分比/视口高度计算为 0；移除视口高度依赖并为仅有 width/height 的 SVG 自动补 viewBox 后，完整读到 `SVG_ARTIFACT_E2E_OK`。
- JavaScript v2 运行输出 `JS_ARTIFACT_E2E_OK / 42`；切换 v1 时旧输出清空。Python 首轮因 CSP 缺少 WASM 权限在 120 秒超时；加入 `'wasm-unsafe-eval'` 和外部脚本失败回传后，30 秒内输出 `PY_ARTIFACT_E2E_OK / 42`，网络仍只允许 jsDelivr 固定 `/pyodide/` 路径。
- SAF 首轮建议名从 `.javascript` 修成 `.js` 后，DocumentsUI 又因 `text/plain` 实际落盘为 `.js.txt`；改用通用 MIME 后真实文件为 `JavaScript 沙箱.js`，48B 内容逐字节等于 v2 源码。
- 分享按钮拉起 Android Sharesheet 并包含 Cloudflare URL。远端补齐公开只读 JSON 路由后，匿名 API 返回作品；Debug Manifest 的 App Link host 改为从 `LINHUB_DEBUG_BASE_URL` 派生，HTTPS 深链在热启动 63ms、冷启动 732ms 均打开共享 v2 作品。
- `xiaolin.wenzhuolin.xyz/.well-known/assetlinks.json` 已部署仅授权独立 Debug 包名与当前 Android Studio 签名，Cloudflare 返回 200、`application/json`，线上/源码 SHA-256 一致。AVD 的 Google Statement Service 与 Mac 的 Google DAL API 均持续超时，自动重验仍为 `legacy_failure`；不伪报为生产验证成功。使用 Android 开发者批准状态做系统路由冒烟后，两次不指定组件的隐式 HTTPS Intent 分别以 COLD 4,428ms / WARM 681ms 进入 `com.linhub.android.debug.MainActivity`，无效 32 位 token 由原生端读回“分享作品不存在或已失效”，证明系统路由、冷/热 Intent 分发与原生解析链完整。正式 `com.linhub.android` 仍未写入声明，等待最终 Release 证书后再做真实自动验证。
- 最终通过原生侧栏删除会话，数据库 `conversations / messages / artifacts / share_token` 计数均为 `0 / 0 / 0 / 0`，公开 API 返回 404，模拟器 Downloads 为 0 项。

### 管理后台图像 / TTS / ASR 真实连接

在不接触真实管理员密码的前提下，将专用账号 `android-test-20260711@linhub.test` 临时提升为管理员，从 Pixel 9 AVD 的原生账户二级菜单进入“管理后台 → 系统设置”。所有 API Key 输入框保持为空，测试完成后账号已按条件更新恢复为 `user`；数据库再次核对图像配置保留原值，TTS/ASR 的 Base URL、模型和音色仍全部为 `null`，没有保存草稿或覆盖密钥。

- 图像生成使用现有 `gpt-image-2` 配置真实生成测试图，生产接口 795ms 返回；原生 Snackbar 为“图像生成连接成功（已生成 1 张测试图）”，截图为 `design-qa/admin-image-engine-success.png`。
- TTS/ASR 首轮均错误显示“域名解析失败”。Lighthouse 对 token-plan `/models` 的只读鉴权探针返回 200，并列出 `mimo-v2.5-tts / mimo-v2.5-asr`；直接发送与测试接口等价的请求也分别返回有效 MP3 base64 与转写“嗯。”，排除密钥、DNS 和上游服务故障。
- 根因是 `/api/admin/settings/engine-test` 在存在一个已禁用、无密钥的旧 Xiaomi 对话供应商时，把该供应商的默认对话地址与 token-plan 语音密钥错误拼接。现已限制旧供应商只能回退密钥，TTS/ASR Base URL 与正式语音链路一致，只能取 token-plan 供应商地址或 `https://token-plan-cn.xiaomimimo.com/v1`。
- 修复部署后重新进入系统设置清空未保存草稿，在 Base URL、模型、音色和 Key 全部留空的状态下，TTS 1,846ms 返回并显示“TTS 连接成功”，ASR 847ms 返回并显示“ASR 连接成功”；截图分别为 `design-qa/admin-tts-engine-success.png` 与 `design-qa/admin-asr-engine-success.png`。
- 本地 TypeScript、ESLint、Next 生产构建通过；Lighthouse 生产构建、systemd 重启与 Cloudflare 公网 200 检查通过。测试接口不写媒体、用量或余额记录，远端临时文件已清理。

### 侧栏动画与启动观测

侧栏重页面导航已统一改为先完整关闭抽屉，再执行目标动作，避免项目、技能、知识库、文件页组合与关闭动画同帧竞争。新增两项纯策略测试验证关闭完成前动作不会执行，以及动画缩放为 0 时动作仍立即执行。Debug APK 经全量单测、Lint 和构建后覆盖安装到固定的 Android Studio Pixel 9 AVD，登录态保留。

首次帧采集发现 AVD 由早期图形崩溃排查参数固定在 `SwiftShader` CPU 软件渲染，所有修改前样本都超过 34ms，不能作为 App 动画结论。恢复 Device Manager 默认的宿主 GPU 后，SurfaceFlinger 读到 Apple M5；项目、技能、知识库、文件和新对话预热后循环 4 轮，76 个有效输入相关样本 P50 / P95 为 18.28 / 22.09ms，最大 33.70ms，超过 34ms 为 0。系统整段统计为 24 / 1,634 帧卡顿（1.47%）、0 次 Missed Vsync。随后在设备把 `animator_duration_scale` 设为 0，抽屉仍立即关闭并进入项目页；测试后已恢复为系统默认 `null`。

同一路径现有独立 R8 Macrobenchmark：每轮在不计时的 setup 阶段解析当前设备坐标，正式测量区只执行五次开关侧栏和目的地触摸，10 / 10 轮通过并保留 Perfetto trace。AndroidX 端到端原始 P50 / P95 为 14.4 / 109.4ms；逐 trace 的 UI 主线程 P95 为 11.99–22.11ms。原始尾部已定位为模拟器 RenderThread 等待 SurfaceFlinger 释放缓冲区：509.52ms 极值中 `postAndWait` 占 507.49ms，Compose 绘制约 0.16ms。两组数据均保留，不用主线程值覆盖端到端异常；固定真机仍是最终门槛。

目标页加载现区分“合法空列表”和“尚未加载”，并在聊天首页显示后用 IO 线程预取项目、知识库、技能、全部文件、计费和设置六类缓存。Debug 冷启动日志只出现用户、模型、会话、项目和风格五类必要请求；缓存预取本身不访问网络，首次目标页导航只补齐缺失或过期数据。文件相同筛选快速进入两次只请求一次，离开文件页会取消仍在进行的 reset 请求，不再把延迟超时带回聊天页。

缓存预热后开启飞行模式，系统明确读到 `airplane_mode=1 / Active default network: none`。原生依次进入项目、知识库、技能和文件，分别直接显示“还没有项目 / 还没有知识库 / 还没有自定义技能 / 还没有文件”，四段导航的 OkHttp 请求数为 0；恢复飞行模式后 Debug App 仍保留登录态和普通聊天首页。

计费与设置进一步使用 stale-first 快照。计费现与 Web 一样按标签加载：已有当前用户时首次套餐只请求 `/api/plans`，首次用量只请求 `/api/usage`，首次流水只请求 `/api/ledger`，其他三项均为 0；三项分别在 767ms、1,001ms、719ms 返回 200。紧跟用量 200 后立即点击同一标签请求数为 0。只有套餐、用量和流水都在 30 秒内新鲜时才回写 grouped Room payload；等待缓存过期并在飞行模式冷启动后，页面仍立即显示 Pro、`¥81.28 / ¥120.00`、线性额度进度和套餐卡，只尝试当前 `/api/plans`，DNS 失败不清空 stale 数据；恢复网络后同标签 1,558ms 返回 200。

设置也改为按标签加载：首次账户设置域请求为 0，记忆只请求 `/api/memories`（846ms），风格只请求 `/api/styles`（999ms），MCP 只请求 `/api/mcp?scope=user`（739ms），MCP 紧跟 200 后重复点击为 0 请求。记忆、风格、个人 MCP 三类必须同时处于 60 秒 TTL 内才写 grouped payload；首轮跨窗刷新后直接检查 Room 确认 settings payload 不存在，严格窗口内刷新后读到 915B payload 和对应同步状态。等待其过期、飞行模式冷启动后，记忆标签立即显示“用户偏好用中文获取周度 AI 领域新闻摘要。”，仅 `/api/memories` DNS 失败且旧内容不清空；恢复网络后同标签 1,522ms 返回 200。验证后模拟器恢复 `delay none / speed full`。

管理后台也已从首次进入并发等待 9 组接口改为与 Web 相同的按标签读取。Pixel 9 AVD 首次打开“供应商”只出现 1 次 `/api/admin/providers`，其余管理请求为 0；首次网络请求超时后同标签可直接重试，第二次 1,543ms 返回 200，证明失败资源没有被错误标为已加载。“用户”只并发补齐 `/api/admin/users` 与订阅编辑所需的 `/api/admin/plans`，分别在 579ms / 575ms 返回 200；“系统设置”只补 `/api/admin/settings` 与模型选择所需的 `/api/admin/models`，两项均在 615ms 返回 200。返回已加载的“用户”标签请求数为 0，列表立即显示且无加载圈。另在飞行模式 `Active default network: none` 下打开未加载的“技能审核”，请求 45 秒超时后页面持续显示“当前标签加载失败 / 重试”；恢复网络并点击该按钮后，接口 1,725ms 返回 200，页面切换为“暂无待审核技能”。测试后专用账号恢复 `role=user`，注册与技能审核开关均为 `true`，App 回到普通聊天首页。

项目资源也按界面依赖收窄。清空当前账号 Room 目标页缓存但保留 Keystore 会话后，Pixel 9 AVD 冷启动 BASIC 日志只出现 `/api/projects`（647ms），没有 `/api/knowledge`；进入项目详情后首次切到“项目文件”，才出现一次 `/api/knowledge`（946ms），文件与关联知识库正常显示；再次进入已加载区域时相关请求为 0。详情“对话”不依赖知识库的分支由同一策略测试锁定。

同一 AVD 还用当前 Web 源码的官方 mock 数据源在 360×808 视口逐屏对照项目列表、详情、文件和设置。原生移除旧的卡内大按钮与居中会话弹窗，改为紧凑整卡、独立详情和 180ms 横向淡入过渡；详情头避让状态栏。最新 APK 逐项打开并取消项目信息、模型菜单、项目指令、文件删除、项目删除和新建项目，返回列表后真实项目与 `报送项目.jpg` 仍在。语义树明确读到可聚焦、可点击的 `打开项目「年度数字化项目」` 按钮。测试未创建、保存或删除任何项目、文件及知识库；最终完整单测、Lint、Debug、R8 Benchmark 与 Benchmark 测试 APK 构建在 74.82 秒内通过。

`am start -W` 的三次 Debug Activity 冷启动观测为 811 ms、864 ms、2,626 ms。第三次发生在 Chrome、DevTools 和数据库检查并行占用模拟器之后，说明 Debug/AVD 数据受宿主机调度影响很大；这些数字只用于发现异常，不作为“比 Web 更快”的验收结论。正式结论继续以 R8 benchmark 变体和固定真机为准。

### Web 同设备对照状态

已改用当前源码对应的 Next.js 16.2.10 生产构建，不再经过开发服 HMR。宿主机 `127.0.0.1:3001` 通过 `adb reverse` 提供给同一 AVD 的 Chrome 149；Chrome 保留与原生相同的管理员登录账号。

- 首页 10 轮 Web → 原生交替：Chrome 与 R8 profile 原生均登录同一管理员账号并连接同一生产后端；生产 Web 禁用缓存后可交互并完成两帧的 P50 为 320.7ms，同账号原生冷启动 P50 为 126.0ms；原生约快 60.7%。
- 同一真实 1,000 消息会话各 5 轮相同手势：原生 P95 为 19.52–19.78ms、0 / 596 帧超过 34ms；Web P95 为 150–233ms、110 / 390 个 rAF 间隔超过 34ms。
- 生产 Web 源码时间戳均早于 `.next/BUILD_ID`，确认不是旧构建；临时性能会话已通过原生 UI 删除，数据库会话和消息计数均为 0。

完整样本、限制和复现命令见 `android/BENCHMARK_RESULTS.md`。这些数据证明当前 AVD 上原生明显更快、更稳，但正式产品结论仍需固定 API 35+ 真机按相同协议复验。

### 计费页 Web 手机版逐屏对照

使用当前 Web 源码官方 mock 的 360×808 视口作为结构基线，并把最新 Debug APK 覆盖安装到固定的 Android Studio Pixel 9 AVD `emulator-5554`。原生连接 `https://xiaolin.wenzhuolin.xyz/` 的真实账号数据；两端金额和条目内容不同，因此只比较信息架构、组件层级、裁切和交互状态。完整前后截图与审计见 `design-qa/billing-mobile-audit-20260713/`。

- 套餐概览与四标签顺序保持 Web 同构；有限额度进度去掉 Material 3 默认的终点圆点和额外末端间隙，并使用弹簧插值平滑更新。最新真实状态下 `¥120.00 / ¥120.00` 进度连续填满，没有圆点或断裂。
- 充值从横向滚动 Chip 改为 Web 同款三列两行金额网格，六个金额在 360dp 宽度内全部可见；余额充值和兑换码分别放入独立 16dp 圆角卡片。兑换卡补齐管理员生成说明，支付提示保持生产语义，不沿用 Web mock 的 P8 占位文案。
- 设备先选 ¥10，再恢复默认 ¥50，按钮文案重新读到“去支付 ¥50.00”；没有点击支付、没有输入或提交兑换码，也没有选择套餐，因此本轮没有创建订单、充值、兑换或变更订阅。
- 用量保留窄屏可读的原生卡片列表，新增 Web 同层级的“最近用量 / 合计”摘要卡、边框、阴影、稳定 key 和 `animateItem`；避免复刻 Web 360px 表格已可见的费用列裁切。
- 余额流水改为首/中/末圆角连续分段卡，行间零间距并继续由 `LazyColumn` 虚拟化；真实流水的描述、时间、金额和余额都完整可读，没有原先的裸行大空白。
- 新增纯策略测试锁定三列金额分组和流水首/中/末位置；最终 `testDebugUnitTest`、`lintDebug`、Debug APK、R8 Benchmark APK 与 Benchmark 测试 APK 在 1 分 40 秒内全部通过。

### 聊天信息流复杂内容与 Web 交互层级

继续以当前 Web 手机版信息流源码和 411×924 基线截图为视觉真值，在同一 Pixel 9 AVD 上只读既有真实会话，补齐普通正文之外的复杂状态。设备证据集中在 `android/design-qa/chat-feed-mobile-audit-20260713/`。

- 真实“蒙特卡洛估算圆周率”会话中的 54 行 Python 代码块显示语言、运行、复制和“展开全部 54 行”；超过 24 行默认限制在 430dp，展开/收起语义与 Web 一致。点击运行后真实进入共享 Pyodide 安全沙箱；脚本中的 `matplotlib.pyplot.show()` 最终触发既定 120 秒限制，原生输出卡显示“运行失败：运行超时（120 秒）”，证明代码块、隔离运行、回调和错误输出链路闭环，不把脚本阻塞误报成 UI 崩溃。截图为 `20-native-python-code-block.png`、`21-native-python-code-output.png`。
- 运行输出区域现限制为 224dp 并支持内部纵向滚动，超长标准输出不再被固定高度直接裁掉；Python / JavaScript 继续复用 Artifact 的 120 秒 / 15 秒网络白名单沙箱，HTML 使用独立隔离预览。
- 真实“量化巨头GPU之谜”中的 Markdown 表格已改为 12dp 圆角外框、弱底色表头、仅横向行分隔；窄表均分可用宽度，宽表继续横向滚动。来源摘要展开后读取到 2 次搜索、12 个来源、两条调用状态、左侧来源线和收起语义。截图为 `22-native-markdown-table.png`、`23-native-source-expanded.png`。
- 本轮没有发送消息、创建会话、上传文件、运行支付或产生服务端计费；完整 `testDebugUnitTest`、`lintDebug` 与远端 Base URL Debug 构建通过。

### 前台恢复与当前页面重新验证

反向覆盖审计重新以当前 Web `DataService`、全部 API Routes 和 React Query 配置为权威真值。接口面没有发现 Web 路由缺少 Android 网络调用，但发现恢复语义不一致：Web QueryClient 的默认新鲜期为 30 秒并在窗口重新聚焦时重新验证，而原生旧实现长后台后只刷新会话和计费，项目、知识库、文件、技能、设置与管理后台会无限保留进入后台前的内存快照。

- 保留原有 5 秒会话刷新和计费当前标签刷新；后台达到 30 秒才异步重新验证当前可见目的地，避免短暂切换 App 放大网络请求。
- 页面继续先显现有内存/Room 数据，不清空列表、不切回骨架；项目刷新索引及本次会话中已打开的项目对话，知识库在同一加载周期并发刷新索引和当前文档，文件保留当前分类/搜索，设置和管理后台只刷新当前标签。
- 非计费、非设置账户页同时静默刷新当前用户，确保侧栏余额、订阅和资料不会长期过期；401 仍走统一会话失效，普通后台网络失败不弹出打断式错误。
- `ForegroundRefreshDecision` 新增 30 秒边界回归：29,999ms 不刷新当前功能域，30,000ms 开始刷新；既有 4,999/5,000ms、支付快速返回和一次性消费测试继续通过。
- Pixel 9 AVD 进入真实“文件”页后清空日志，后台 31 秒再返回：OkHttp 只记录 `/api/me`、`/api/conversations`、`/api/media?limit=60`，三项均为 200，约 2.47 秒后台完成；语义树仍停留在文件页，旧列表持续可见，崩溃缓冲为空。
- 同页清空日志后后台 6 秒再返回：只记录 `/api/conversations` 一项 200，没有 `/api/me` 或 `/api/media`，证明短后台没有被新策略扩大。测试全程只读，没有上传、删除、创建会话或产生计费。

完整记录见 `design-qa/foreground-refocus-20260714/AUDIT.md`。

### 聊天核心配置热刷新

在前台恢复策略补齐后继续对照 Web `ChatView` 的实际挂载查询，发现聊天页 30 秒后聚焦会重新验证模型、风格、知识库、用户、当前会话和 Artifact；原生旧路径只更新用户与会话。管理员在另一端停用当前模型时，原生可能继续展示并提交已失效模型，直到下次冷启动。

- 30 秒聊天页恢复现并发刷新模型、风格、知识库、用户和会话；已打开会话同时刷新 Artifact，活动项目或技能才按需刷新对应上下文，普通新对话不会无条件请求项目/技能。
- 模型刷新先在内存归并，再写 Room 与 15 分钟模型同步游标；缓存观察器继续复用同一 reducer，不会出现网络状态和 Room 状态选择规则不一致。
- 仍存在于新列表中的显式模型选择保持不变；失效选择回退到服务端默认可聊天模型，并重新计算该模型的思考强度。服务端默认若指向图像模型会跳过；没有任何可聊天模型时清空选择，不把旧 ID 发给聊天接口。
- 活动 Skill 强制刷新时改为“新值在前”去重，修复原有 `(旧列表 + 新值).distinctBy` 在强制刷新场景会错误保留旧 Skill 的隐患。
- 新增 4 组纯 reducer 测试：有效选择保持、停用模型回退、图像模型过滤、无可聊天模型清空。
- Pixel 9 AVD 聊天首页后台 31 秒后返回，OkHttp 只记录 `/api/models`、`/api/conversations`、`/api/styles`、`/api/me`、`/api/knowledge`，五项全部 200，约 3.1–3.5 秒并发完成；页面保持“早上好，温卓林”和可用模型选择器。6 秒对照只有 `/api/conversations` 一项 200。
- 全量验证首次还真实暴露 Debug Lint 与 `kspBenchmarkKotlin` 同任务图并发读写 Room 生成目录的竞态；`lintAnalyzeDebug*` 现只在两者同时被请求时 `mustRunAfter` Benchmark KSP，单独 Lint 不新增依赖。相同五任务命令随后稳定通过。

设备测试只读现有数据，没有停用模型、修改默认值、发送消息或产生计费。完整记录见 `design-qa/chat-configuration-refocus-20260714/AUDIT.md`。

### 网络重连自动恢复

Web TanStack Query 默认 `refetchOnReconnect=true`，网络恢复会重新验证活动查询。原生旧 `NetworkMonitor` 只切换 `isOffline` 并显示“网络已恢复”，当前失败页面仍需手动重试或重新导航。本轮把网络重连接入统一恢复决策：

- 初始网络状态、重复在线事件和无有效会话不触发刷新。
- App 前台发生 offline→online 时，无视普通 5 秒/30 秒阈值，立即刷新会话和当前可见功能域。
- 网络在 App 后台恢复时不执行 HTTP，只记录一次 `RefreshOnForeground`；首个 `ON_START` 消费后执行相同刷新，避免后台耗电和返回时重复请求。
- 支付返回仍复用同一决策：如果两种恢复同时发生，完整计费快照优先，普通计费标签不会叠加请求。
- 新增纯策略覆盖 `RefreshNow / RefreshOnForeground / None`、无会话、初始状态和强制网络刷新无视时间阈值。

Pixel 9 AVD 最终 APK 的真实飞行模式验证：

1. 聊天首页保持前台，开启飞行模式后再关闭；网络恢复立即请求 `/api/models`、`/api/conversations`、`/api/styles`、`/api/me`、`/api/knowledge`，五项均为 200，约 1.5–2.1 秒完成，页面和模型选择器始终可用。
2. 再次开启飞行模式，把 App 切到 Launcher 后恢复网络并等待 7 秒；目标进程日志中 HTTP 请求为 0。重新打开 App 后同五项各请求一次并全部 200，约 1.3–1.6 秒完成，Crash Buffer 为空。
3. 设备最终 `airplane-mode=disabled`，前台 Activity 恢复为 `com.linhub.android.debug/com.linhub.android.MainActivity`。

审计过程中尝试要求 `NET_CAPABILITY_VALIDATED`，但设备所在中国网络能正常访问业务域名，Android 的 HTTPS Google 探测却持续超时并把网络标为 partial；该实现会永久误报离线，因此依据实际运行证据撤回，保留 `INTERNET` 能力并用业务 API 成功作为恢复真值。完整记录见 `design-qa/network-reconnect-20260714/AUDIT.md`。

### 外部支付返回状态同步

计费订单的系统浏览器跳转原先在成功调用 `ACTION_VIEW` 后立即丢弃 URL，而普通前台恢复只在后台达到 5 秒且当前仍位于计费页时刷新当前标签。用户快速支付或取消后回到聊天页，可能继续看到旧余额或旧订阅状态。本轮补成显式的一次性返回状态机：

- 只有系统支付页确实打开成功才记录“等待支付返回”；无法处理 URL 时清除待打开事件并显示错误，不误触发后续刷新。
- 首次回前台时无视普通 5 秒阈值和当前目的地，全量并发读取当前用户、套餐、用量和流水；归并后同时更新全局用户余额、四类计费新鲜时间、账户 Room 行和 grouped 计费缓存。
- 返回状态在决定刷新时同步消费，第二次 `ON_START` 不会重复请求；长时间后台且位于计费页时也不会再叠加一次标签刷新。
- 新增四组 JVM 回归，覆盖普通短后台不刷新、普通长后台刷新、快速支付返回强制刷新且只消费一次，以及停留聊天页仍更新全局余额和完整计费快照。
- 本轮没有点击支付、创建订单、充值、兑换或切换套餐。`testDebugUnitTest`、`lintDebug`、`assembleDebug`、`assembleBenchmark` 和 `:benchmark:assembleBenchmark` 全部通过；最新 Debug APK 覆盖安装到 `emulator-5554` 后前台 Activity 正常、崩溃缓冲为空。真实渠道成功、取消、失败的服务端状态变化仍保留为外部 E2E 门槛。

代码与测试证据见 `ui/ExternalPaymentReturnPolicy.kt`、`LinHubViewModel.kt`、`LinHubApp.kt` 和 `ExternalPaymentReturnPolicyTest.kt`。

### 五档字号与输入框位置

账户二级菜单新增“字号”，提供“极小 / 小 / 适中 / 大 / 极大”五档；当前 Web 对齐尺寸作为默认“小”，应用倍率依次为 0.9 / 1.0 / 1.1 / 1.2 / 1.3，并继续叠加系统无障碍字体缩放。

- 设备语义树同时读到五个选项，默认“小”具有“当前字号”描述；选择“极大”后侧栏、历史会话正文、标题、列表和操作栏即时放大，固定行没有文字上下裁切。强制结束并冷启动后账户菜单仍显示“极大”，证明 DataStore 持久化有效；验收结束已切回默认“小”，再次冷启动仍显示“小”。证据为 `25-native-font-size-entry.png`、`26-native-font-size-options.png`、`27-native-font-extra-large-drawer.png`、`28-native-font-extra-large-chat.png`。
- 历史会话输入框底部外边距从 8dp 增至 14dp，关闭键盘时相对原版上移 6dp；证据为 `29-native-small-chat-composer-raised.png`。键盘路径首次暴露出系统 resize 与 Compose IME inset 配置不完整时会产生大空白或遮挡，最终在 Activity 显式使用 `adjustResize` 并保留 Compose `imePadding()`，输入框稳定贴在 Gboard 上方且保留 14dp 间距，证据为 `34-native-history-composer-ime-resize-padding.png`。
- 字号解码、无效值回退到“小”和五档倍率递增均有纯单元测试；最终 `testDebugUnitTest`、`lintDebug`、`assembleDebug` 全部通过。设备验证只切换本地 UI 偏好，没有服务端写入。

### 流式聊天根重组隔离

外观设置接入后继续审计高频状态路径，确认 Activity 根层原先会为读取主题/字号而收集完整 `LinHubUiState`，因此聊天流每次 24ms 合帧、草稿和工具状态更新都可能使根组合域失效。现改为只收集 `themeMode + fontSizePreset` 的去重投影，聊天正文仍在页面层收集完整状态；等价字体 `Density` 只在系统密度、系统字号或五档预设变化时重建。

- 设备选择“大”后强制结束并冷启动，侧栏保持 1.2 倍字号；切回“小”后再次冷启动恢复当前 Web 对齐尺寸，证明根外观流隔离没有破坏 DataStore 恢复或即时换肤。
- 聚焦测试证明仅修改草稿/消息不会改变根外观投影，而主题或字号变化一定会改变；这把流式内容更新与全局主题重组从数据路径上解耦。
- Pixel 9 AVD 的 R8 长会话 Macrobenchmark 在导航条开启/关闭两种 1,000 消息场景各跑 10 轮、0 失败；`frameDurationCpuMs` P50 / P95 分别为 `2.90 / 4.42ms` 与 `2.78 / 4.60ms`，P95 `frameOverrunMs` 仍为 `-8.68ms / -8.29ms`。这只作为模拟器无回退证据，正式“比 Web 更快”结论仍保留真机门槛。

### 侧栏壳层与流式正文隔离

`ConversationDrawer` 原先直接接收完整 `LinHubUiState`，聊天每次 24ms 文本合帧都会改变侧栏参数。现把用户、会话/项目列表、搜索、选中项、项目折叠/置顶和外观等真实依赖投影为稳定 `WorkspaceShellState`；正文、附件、工具、计费、设置和后台状态变化不再使整个侧栏会话树失效。

- 单元测试证明草稿/工具等变化不改变投影，目的地/当前会话/外观变化会改变；100 个不同流式帧全部保持与初始壳层相等。
- 最新 Debug APK 打开侧栏后完整显示工作区入口、项目与历史会话；在搜索框输入 `GPU` 后真实返回“量化巨头GPU之谜”，点击可打开同名会话并更新标题。测试只执行 GET 搜索，没有修改会话或产生计费。
- 本轮 R8 长会话基准受宿主持续高负载影响，两次投影版复测 P95 约 89–106ms。临时切回旧完整状态实现做同机 A/B 后，导航条开启场景 P95 仍为 106.99ms，证明慢尾部不是壳层投影引入；对照后已恢复最终隔离实现。快、慢和旧实现对照均保留在 `BENCHMARK_RESULTS.md`，不以早前快样本覆盖当前异常。

### 确定性流式聊天性能与自动跟随

新增 R8 `StreamingChatBenchmark`，每轮在本地 fixture 中按真实 reducer 路径提交 120 次、间隔 24ms 的文本增量，完成时切换 Markdown 和消息操作栏；10 轮不读取真实账号、Room 或网络。Pixel 9 AVD 连续三组均为 10/10 通过，并保留 30 份 Perfetto trace。最终 post-profile 原始汇总为 `frameDurationCpuMs P50 / P90 / P95 = 22.4 / 83.6 / 156.4ms`，`frameOverrunMs P50 / P90 / P95 = 19.7 / 156.8 / 188.6ms`。异常尾部没有隐藏：代表 trace 的 RenderThread 仍有约 210.6ms `waitForBufferRelease`，属于模拟器 SurfaceFlinger/宿主窗口回压。

针对首轮 trace 暴露的 App 热点，流式消息现复用稳定树路径并 O(1) 覆盖最后一项，分支/导航条/Markdown 预热不再每帧重建，正文按换行边界冻结为稳定片段，自动滚动只把真实拖拽视为用户离底。优化前/最终代表 trace 中，文本节点测量平均从 3.316ms 降到 1.490ms，TextLayout 初始化从 1.694ms 降到 0.590ms；设备终态截图和语义树读到 `STREAMING_BENCHMARK_DONE` 及完整操作栏，没有“生成中”或“回到底部”。完整证据位于 `design-qa/streaming-benchmark-20260714/`。

流式优化阶段的 Baseline Profile 新增流式旅程，当时生成 23,043 条 Baseline / 18,156 条 Startup 规则，关键流式方法均已进入 profile；`updateBaselineProfile` 的 configuration cache 序列化问题也改为独立 Gradle Task 类型并完成真实 3/3 设备采集。随后反向覆盖审计又加入工作区八页导航旅程，当前源码为 24,985 条 Baseline / 18,155 条 Startup 规则；项目、技能、知识库、文件、设置、计费和管理后台主 Compose 方法均进入 Baseline，新增页面没有进入 Startup。最终 4/4 Profile 采集通过；进一步以每轮 ART 状态硬断言完成 Profile-on/off 各 10 轮导航 A/B，UI 主线程 `doFrame` P50/P95 的逐轮中位数下降 34.1%/46.4%，而 RenderThread 缓冲等待保持约 212ms。全量单测、Lint、Debug、R8 Benchmark 和 Benchmark 测试 APK 构建通过。

在进入剩余外部验收前，新增 R8 `WorkspaceSurfaceSmokeTest` 使用 benchmark-only 管理员 fixture 自动遍历 22 个原生 surface：项目、技能、知识库、文件、新对话，设置/计费各 4 标签，管理后台 9 标签。Pixel 9 AVD 最终 1/1 通过，约 40 秒；目标 PID 日志中没有 OkHttp 请求、FATAL 或 AndroidRuntime 崩溃。fixture 结构另有 JVM 单测，普通 Debug/Release 仍使用真实加载路径。完整记录位于 `design-qa/workspace-surface-smoke-20260714/AUDIT.md`。

### Artifact Markdown 代码块复制闭环

继续扫描空回调时确认 `ArtifactDialog` 的 Markdown 预览把非空 `onCopyCode` 传给渲染器，因此按钮会显示并在点击后切换为“已复制”，但旧回调体为空，系统剪贴板没有收到代码；Web `ArtifactPreview` 则复用真实 `CodeBlock` 剪贴板链路。这是 Android 独有的功能缺口，不是视觉占位。

- Markdown Artifact 预览现通过 `ClipboardManager` 写入 `ClipData.newPlainText("LinHub 作品代码", code)`，保留代码块原有的即时勾选和“已复制”语义反馈。
- 新增 `ArtifactMarkdownClipboardTest`，在 Compose 设备测试中渲染含 Kotlin fenced code 的真实 Markdown，点击“复制代码”，再从目标 App 的系统剪贴板读取内容并逐字符断言 `val marker = "ARTIFACT-COPY-E2E"\n`，同时断言按钮切换为“已复制代码”。
- 固定 Pixel 9 AVD `emulator-5554` 上 1/1 通过（3.193 秒）；随后最新 Debug APK 已重新安装并启动，`MainActivity` 状态正常，Crash Buffer 为空。
- `testDebugUnitTest`、`lintDebug`、`assembleDebug` 与 `assembleDebugAndroidTest` 同轮通过；设备测试不访问网络、不创建作品、不修改服务端数据，也不产生计费。

完整记录位于 `design-qa/artifact-markdown-copy-20260714/AUDIT.md`。

### 文件预览代码块与复制对齐

同一轮 Web 对照进一步确认：Web 文件预览对 `.js/.ts/.py/.kt/.json/.txt` 等原始文本使用完整 `CodeBlock`，保留语言、高亮、折叠和复制，但传入 `showRunButton=false`；Markdown、Office、CSV/TSV 预览复用可复制的 Markdown 代码块。原生旧实现对前者只显示可选中的等宽正文，对后者没有 `onCopyCode`，两条路径均少于 Web 功能。

- 原生 Markdown 代码块抽出可复用 `MarkdownCodeBlock`，默认聊天/Artifact 行为不变；文件预览传 `showRunButton=false`，避免用户在文件中心误执行代码。
- 文件扩展名补齐与 Web 对齐的语言映射，并新增 JVM 测试锁定 Kotlin、TypeScript、Python 和无扩展名回退。
- `MediaPreviewClipboardTest` 在固定 Pixel 9 AVD 上分别渲染 `.kt` 原始文件和含 Kotlin fenced code 的 Markdown 文件：前者断言“运行”节点数量为 0，两者点击“复制代码”后都从系统剪贴板读取并逐字符比对原文。
- 与 Artifact 回归合并运行共 3/3 通过，耗时 5.765 秒；`testDebugUnitTest`、`lintDebug`、`assembleDebug`、`assembleDebugAndroidTest` 全部通过。最新 Debug APK 冷启动 `MainActivity` 成功，Crash Buffer 为空。

完整记录位于 `design-qa/media-preview-copy-20260714/AUDIT.md`。

### Artifact 系统分享失败回退

Web Artifact 分享在公开 token 创建成功后优先复制链接，浏览器剪贴板失败则打开手动复制窗口；Android 公开 token 与系统 Sharesheet 成功路径已有真实设备证据，但 `startActivity` 异常被 `runCatching` 静默吞掉并立即消费链接。极端设备若没有可处理 `ACTION_SEND` 的目标，用户会看到按钮结束加载却拿不到链接。

- 新增独立 `launchArtifactShare`：构造 `ACTION_CHOOSER` 包裹的 `ACTION_SEND`、`text/plain` Intent；启动成功保持原生 Sharesheet，失败则把同一 URL 以“LinHub 分享链接”写入系统剪贴板。
- `LinHubApp` 只在回退分支显示“无法打开系统分享，链接已复制”，两条分支都会一次性消费待分享 URL，不重复打开。
- `ArtifactShareLauncherTest` 在固定 Pixel 9 AVD 上覆盖成功/失败 2 条分支：成功分支逐项断言 chooser、内层 action、MIME 与 URL，且剪贴板保持为空；失败分支注入 `ActivityNotFoundException`，在前台 App 中读取并逐字符比对回退 URL 和剪贴板标签。
- 分享、Artifact Markdown 和文件预览剪贴板测试合并运行 5/5 通过，耗时 7.184 秒；`testDebugUnitTest`、`lintDebug`、`assembleDebug`、`assembleDebugAndroidTest` 全部通过。最新 Debug APK 冷启动成功，Crash Buffer 为空。

完整记录位于 `design-qa/artifact-share-fallback-20260714/AUDIT.md`。

### 外部链接安全启动与文件 Markdown 点击

继续审计可点击内容时确认三条语义不一致：聊天 Markdown/搜索来源和 Artifact Markdown 会尝试 `LocalUriHandler.openUri`，但异常被静默吞掉；文件中心 Markdown 甚至使用 `MarkdownText` 的默认空 `onLink`，因此链接有颜色和下划线却点击必定无效。Web 三条路径均输出可打开的新窗口链接。

- 新增统一 `launchExternalLink`，接受带有效 host 的 HTTP/HTTPS、非空 mailto，以及解析到当前 `BuildConfig.API_BASE_URL` 的单斜杠站内路径；正常分支构造 `ACTION_VIEW`，系统无浏览器/邮件处理器时复制同一地址并返回可提示状态，`javascript:`、缺 host HTTPS、`//host` 协议相对地址、无 scheme 和空值均直接拒绝且不触碰剪贴板。
- `LinHubApp` 统一展示“无法打开链接，地址已复制”或“链接格式不受支持”，并把同一回调传给聊天 Markdown、搜索来源、工具卡、普通/公开 Artifact Markdown 以及文件中心 Markdown/Office/CSV 预览。
- `ExternalLinkLauncherTest` 在固定 Pixel 9 AVD 上覆盖 HTTPS、mailto、站内相对路径、安全拒绝、`ActivityNotFoundException` 回退 5 条分支；回退分支从前台目标 App 的系统剪贴板逐字符读取地址与标签。
- `MediaPreviewClipboardTest` 和 `ArtifactMarkdownClipboardTest` 分别点击真实 Compose Markdown 链接，确认 URL 被完整委托到统一启动器，而非只验证纯函数。
- 与系统分享、Artifact/文件代码复制测试合并运行 12/12 通过，耗时 14.661 秒；`testDebugUnitTest`、`lintDebug`、`assembleDebug`、`assembleDebugAndroidTest` 全部通过。最新 Debug APK 冷启动成功，Crash Buffer 为空。

完整记录位于 `design-qa/external-link-recovery-20260714/AUDIT.md`。

### 文件首屏图片后台预取

性能声明反向核对发现文档已有“列表进入前预取首屏”，但源码只在聊天首页后台读取媒体 Room payload，没有任何 Coil `enqueue`；图片网络请求仍从 `FilesScreen` 的 `AsyncImage` 首次组合开始。全局 `LinHubApplication` Coil 客户端本身正确：只对与 `API_BASE_URL` 同源的 URL 动态附加当前 Bearer，外部 CDN 不泄露令牌，并启用内存/磁盘缓存。

- 新增 `MediaThumbnailPrefetch`：核心工作区刷新完成、当前在线时，从媒体快照选择前 6 个唯一图片 URL，以 512px / INEXACT 请求加入全局 Coil；非图片、空 URL、重复项跳过。
- 请求不再因从聊天导航到文件页而取消，网格可加入同 URL 的进行中请求或读取相同磁盘缓存键；离线、退出登录或核心刷新时会 dispose。`BENCHMARK_ENABLED` 在组件内部硬禁用，避免真实网络污染本地 fixture 性能数据。
- 纯策略测试锁定顺序、去重、6 项上限、0 上限、相对/绝对 URL 解析。
- Pixel 9 AVD 只删除 Debug App 的 `cache/image_cache`，保留账号与 Room。旧实现聊天首页等待 8 秒仍为 0 个缓存文件，进入文件页 6 秒后变为 13 个 / 1,828 KiB；最终实现聊天首页等待 15 秒已经是 13 个 / 3,924 KiB，进入文件页 5 秒后仍为 13 个 / 5,660 KiB。文件数不增加证明复用同一缓存键；体积继续增长如实记录为慢链路请求仍在完成。
- 最终 Debug 单测、Lint、Debug/AndroidTest APK、R8 Benchmark App 与测试 APK 全部通过。R8 22-surface smoke 在先停止 Debug 包并清空日志后 1/1 通过（37.989 秒），目标期间无 OkHttp、FATAL 或 Crash Buffer；最新 Debug APK 已恢复前台且 Crash Buffer 为空。

完整记录位于 `design-qa/media-thumbnail-prefetch-20260714/AUDIT.md`。

### 工作区富数据交互自动化

原 `WorkspaceSurfaceSmokeTest` 已覆盖 22 个页面/标签，但项目、知识库、技能和文件使用空状态。本轮新增独立 `workspace-interaction` Benchmark 夹具，预载项目会话、项目文件与关联知识库、知识库文档、Prompt Skill 和 Kotlin 媒体正文；生产 Debug/Release 不受影响。

- Pixel 9 AVD 的 R8 测试真实点击项目整卡，读到项目会话，切换项目文件/项目设置，打开项目文件删除确认后取消。
- 选择非空知识库并读到 ready 文档，打开文档删除确认后取消；进入技能编辑器核对既有系统提示词后取消；打开 `automation.kt` 并读到代码块复制入口和正文 marker 后关闭。
- 富数据交互 1/1 通过（29.384 秒），原 22-surface smoke 复跑 1/1 通过（25.535 秒）；两轮均为 0 OkHttp、0 FATAL、空 Crash Buffer。完整六任务构建通过。
- 该测试不确认删除、不触发服务端写操作、不读取真实账号、Room 或网络。完整记录位于 `design-qa/workspace-interaction-smoke-20260714/AUDIT.md`。

### 计费与管理后台重复提交加固

反向状态机审计确认：旧计费入口在协程启动后才设置 loading，同一帧快速双击可能创建两个订单或重复兑换；管理后台通用 mutation 没有 single-flight 门槛，重复赠送、订阅更新或兑换码生成也只依赖按钮稍后禁用。

- 新增原子 single-flight gate；充值/订阅/兑换共享一个，管理后台通用 mutation 共享另一个，两个域互不阻塞。
- 所有权在创建协程前同步获取并立即发布 loading；成功、异常和取消均在 `finally` 释放，不会让页面永久卡住。
- 3 组单测覆盖同 gate 重入拒绝、32 路并发只有一个 owner、释放后可重试及两域独立获取。
- 完整六任务构建通过；Pixel 9 AVD 的 R8 22-surface smoke 1/1（22.403 秒），目标期间 0 OkHttp、0 FATAL、空 Crash Buffer。
- 本轮没有创建订单、充值、兑换、赠送余额、修改订阅、生成兑换码或执行其他生产写操作。完整记录位于 `design-qa/billing-admin-singleflight-20260714/AUDIT.md`。

### 订单幂等、原子结算与 Lighthouse 部署

进程内 single-flight 完成后继续追踪到网络和数据库边界，发现随机订单 ID 不能防代理重放，旧卡密兑换在占用与入账之间存在崩溃窗口。

- Web 与 Android 订单请求新增 `Idempotency-Key`；服务端用用户 ID 与操作键派生 96-bit 稳定商户订单号，同键不同订单语义返回 409。
- Android 将订单签名与键写入 DataStore：超时、5xx 或进程终止后，同金额/套餐重试继续复用；成功或明确 4xx 后清除，不同订单语义自动换键。
- 订单 `pending→paid` 条件抢占与余额/流水或订阅更新合并为单事务；兑换的卡密占用、余额、流水、订单也合并为单事务。
- 本地 TypeScript、定向 ESLint、Next production build、Android 策略单测和完整六任务构建全部通过；远端独立 staging production build 成功后，以保留旧 `.next` 的方式部署。
- Lighthouse 服务保持 active，公网首页返回 200；最终 Debug APK 冷启动后 `/api/me`、模型、会话、项目、风格全部 200，首页显示“晚上好，温卓林”，Crash Buffer 为空。
- 数据库只读检查确认部署时间窗新增订单数为 0。本轮没有创建订单、充值、兑换或修改余额。完整记录位于 `design-qa/billing-idempotency-20260714/AUDIT.md`。
- 本地隔离集成命令 `npm run verify:billing-idempotency` 连续两次通过：2 个同键充值请求只产生 1 个 paid 订单、1 条流水和 100 分入账；2 个同卡密请求得到 1 次 200 / 1 次 400，只产生 1 条流水、1 个订单和 123 分入账；强制 ledger 写入失败返回 500，卡密恢复未使用且余额不变。每轮结束后临时用户、卡密、触发器和函数计数均为 0，端口 3107 已关闭。

### 用户侧保存与认证重复提交加固

重新从 Web `DataService`、Route Handlers、Android `LinHubApi`、ViewModel 和 Compose 入口逐项映射后，没有发现整块功能域缺失，但发现计费/后台之外的写操作仍在进入协程后才发布 loading。同一帧快速双击可在按钮重组禁用前创建两个注册、技能/项目/知识库、记忆/风格/MCP 或资料保存请求；Artifact 打开/分享也有同类重复请求窗口。

- 认证、技能、项目、知识库、设置、计费和后台现分属七个独立 single-flight 域；校验后在协程创建前同步占位，成功、错误、取消均在 `finally` 释放。
- 设置域覆盖昵称、头像、账户导出、默认模型、记忆、回复风格与 MCP 保存；Artifact 使用同步 loading 加 `finally` 清理。原本已有按 ID job/set 或同步乐观更新的删除、开关、反馈路径保持原策略。
- Gate 单测覆盖重入、32 路并发只有一个 owner、释放重试及七域独立；完整六任务构建通过。
- Pixel 9 AVD 的 R8 22-surface smoke 1/1 通过（28.426 秒），测试时段无目标网络请求、无 Crash Buffer。最新 Debug APK 冷启动 831ms，用户、模型、会话、项目、风格读取全部 200，前台 Activity 正确。
- 本轮没有真实注册或创建/编辑任何生产技能、项目、知识库、记忆、风格、MCP，也没有修改用户资料。完整记录位于 `design-qa/user-mutation-singleflight-20260714/AUDIT.md`。

### 工作区读取去重与并行 loading

审计加载状态机时确认计费、设置、后台和媒体已有同步 resource/job 所有权，但项目、知识库、技能和 Artifact 仍在协程启动后才发布 loading；相同入口快速触发可能重复请求。知识库索引与文档共用布尔 loading，先完成者还会提前隐藏仍在运行的另一个子资源。

- 新增按资源键的线程安全 single-flight，覆盖项目、知识库索引/逐库文档、技能列表/逐技能详情和逐会话 Artifact；同键只允许一个 owner，不同资源继续并行。
- 页面 loading 使用引用计数，直到最后一个并行子资源结束才移除；缓存命中、失败和取消均在 `finally` 释放。
- 单测确认 32 路同键并发只有一个 owner、不同键独立、释放后可重试，以及 `2→1→0` loading 生命周期且不会负数。
- 完整六任务通过；Pixel 9 AVD 的 R8 22-surface smoke 1/1（27.238 秒），清空日志后的测试时段 0 OkHttp、0 FATAL、空 Crash Buffer。
- 最新真实 Debug APK 冷启动 757ms，用户/模型/会话/项目/风格五类 GET 各 1 次。项目、技能、知识库快速双击命中新鲜缓存且没有额外 GET；不把该缓存样本伪报为慢网络 gate 证据。本轮没有生产写操作。完整记录位于 `design-qa/read-singleflight-20260714/AUDIT.md`。

### 正式 Release 安全发布链路

- Release 默认后端与 App Link 固定为 `https://xiaolin.wenzhuolin.xyz/`，URL 配置必须为规范 HTTPS；版本号和签名凭据可由环境变量或 Gradle 属性提供，keystore 文件与本地配置已加入忽略规则。
- 无签名运行 `assembleRelease` 会在 `verifyReleaseConfiguration` 明确拒绝 unsigned 正式包；该 Task 已验证兼容 Configuration Cache，不影响 `help`、Debug 或 Benchmark。
- 仅用于链路验证的 1 天 RSA 测试证书成功构建 R8 `app-release.apk`。`apksigner` 确认单 signer 的 v2/v3 签名，`aapt` 确认包名 `com.linhub.android`、HTTPS host `xiaolin.wenzhuolin.xyz`、`autoVerify=true`；Debug/Benchmark/Profile 仍为 `.debug/.benchmark/.profile` 且使用 Debug 证书。
- 临时测试 keystore 与 APK 已删除；它不是正式发布证书。完整六任务回归通过，最新 Debug APK 覆盖安装到 `emulator-5554` 后冷启动 872ms，前台 Activity 正确且 Crash Buffer 为空。
- 正式 keystore、生产 `assetlinks.json` 的最终证书 SHA-256 和 API 35+ 真机自动路由仍待发布负责人提供/验收。完整记录位于 `design-qa/release-pipeline-20260714/AUDIT.md`。

### 写操作提交后校准

Web 在订单/兑换成功后立即提示并异步失效查询；Android 旧实现却等待用户、套餐、用量和流水四个 GET，任一读回失败都会把已经成功的写入误报为失败，支付跳转也被额外延迟。后台批量模型导入、余额赠送和兑换码生成有相同语义风险。

- 新增通用提交后校准管线：`commit` 返回后先同步发布本地结果，再执行 `reconcile`；校准失败保持 `Committed`，取消继续传播，401 仍触发会话失效。
- 订单成功后立即发布安全 HTTPS 支付 URL；兑换成功后即时增加内存余额并清空兑换码。后台三条复合写路径会先应用可安全推导的状态并把资源标为待校准，读回失败提示“已成功，列表暂未刷新”。
- JVM 回归覆盖成功顺序、提交失败、校准失败、取消、401、余额增量与消息语义；Pixel 9 AVD 的 `BillingRedeemUiTest` 1/1（4.818 秒），确认成功事件前输入保留、事件后清空。
- 完整六任务通过；R8 22-surface smoke 1/1（38.502 秒），0 OkHttp、0 FATAL、Crash Buffer 为空。
- 重启 AVD 恢复 Apple M5 host GLES 后，固定生产后端 Debug APK 三次冷启动为 759 / 841 / 744ms；真实核心 GET 约 1.45–1.73 秒后 200，但 Room 缓存首屏不等待网络。
- 本轮没有创建订单、充值、订阅、兑换、赠送余额、导入模型或生成兑换码。完整记录位于 `design-qa/postcommit-reconciliation-20260714/AUDIT.md`。

### 图片编辑幂等、跨进程恢复与生产部署

旧消息图片编辑在“新媒体已生成并计费”与“消息已关联新 URL”之间存在网络未知结果窗口；用户重试可能再次调用图片模型。当前服务端要求稳定操作键，以用户和操作键派生固定媒体 ID，同键 32 路请求共享一次执行；Android 在调用模型前把消息、原图、描述、操作键和可选新 URL 写入 Room，未知结果、冷启动、前台恢复与网络重连都先查询已完成结果，已有图片时只重试消息关联。

- `npm run verify:image-edit-idempotency` 与真实本地路由集成均通过：结果查询 200，32 次 POST 重放为唯一资产、0 额外用量，消息 PATCH 重放返回 `alreadyApplied=true`。临时用户、会话、媒体和用量均由验证器清理。
- `DurableOperationCacheTest` 在 Pixel 9 AVD 插入 201 个普通缓存与 1 个极旧操作记录，执行 90 天清理和 200 项淘汰后操作记录仍可按前缀读取，1/1 通过。
- Lighthouse staging production build 经校验和核对后原子交换；生产构建由 `xgkpZxhS2EHuZn4sSiomV` 更新为 `YBW_jgXPPoGYlPL94rBql`，旧构建保存在 `.next.rollback-20260715-imageedit`。本机与公网均确认首页 200、未登录 `GET /api/edit-image` 为 401，服务 active，Next.js 191ms 就绪。
- Android 六任务全部通过；R8 22-surface smoke 首轮暴露横向后台标签动画中一次点击注入丢失，页面用相同 APK 手动重跑 22.195 秒通过。测试改为重新获取节点并最多补点一次、仍必须等待唯一目标内容，正式 Gradle 回归 1/1；富数据交互另为 1/1。Debug APK 冷启动 708ms，0 FATAL、Crash Buffer 为空。
- 本轮没有向生产图片编辑 POST、消息 PATCH 或其他业务写接口发请求，没有新增媒体、消息或计费。完整记录位于 `design-qa/image-edit-idempotency-20260715/AUDIT.md`。

### 计费与管理后台本地 API 合同

此前 single-flight、幂等键和提交后校准已有策略测试，但没有设备级可控服务器覆盖 `LinHubApi` 的真实请求头、JSON、响应解析和网络超时。新增 `BillingAdminApiContractTest`，在 Pixel 9 AVD 的 loopback MockWebServer 上使用真实 `SessionStore + LinHubApi + OkHttp`，不读取生产账号或网络。

- 订单成功分支验证 Bearer、`Idempotency-Key`、`POST /api/orders`、充值 JSON 和 pending 订单解析；401 分支保留 `status=401` 与服务端安全文案，供 ViewModel 触发会话失效。
- 服务端延迟响应 2 秒、客户端测试 call timeout 250ms 时，在 281ms 返回非 `ApiException` 的 `IOException`，且服务器只收到一个请求；该未知结果会继续走既有“保留幂等键”策略。
- 后台分支验证余额赠送的 `userId/amountCents/note`、两条兑换码响应，以及 500 `ledger failed` 的状态和文案保真。
- 四条设备测试 4/4，通过，总测试逻辑 0.461 秒。MockWebServer 只在 AndroidTest runtime；`debugRuntimeClasspath` 明确无该依赖，生产默认 `callTimeoutMillis=0`，既有连接/读写超时不变。
- 完整六任务通过；non-debuggable R8 22-surface smoke 1/1（25.337 秒）。测试只访问设备 localhost，没有创建生产订单、兑换、余额赠送或兑换码。完整记录位于 `design-qa/billing-admin-api-contract-20260715/AUDIT.md`。

## 尚未形成设备证据

- API 35+ 真机上的安装、音频焦点、来电中断、系统分享和文件提供器行为。
- 支付渠道、最终 Release 证书对应的 App Links / Digital Asset Links 自动验证。
- 同一真机上的 Web/PWA 与原生冷启动、可交互首屏、长会话滚动交替对照。
