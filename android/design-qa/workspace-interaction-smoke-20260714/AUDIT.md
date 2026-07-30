# 工作区富数据交互 R8 Smoke 审计

日期：2026-07-14（Asia/Shanghai）  
设备：Android Studio Pixel 9 AVD `emulator-5554`  
被测包：R8 Benchmark App `com.linhub.android.benchmark`

## Findings

1. 原 `WorkspaceSurfaceSmokeTest` 能自动进入 22 个 Web 对应 surface，但工作区四个核心域使用空列表，只能证明页面和标签可达，不能证明真实数据行、详情页、危险操作确认框、编辑器和文件预览可以组合及响应触摸。
2. 新增独立 `workspace-interaction` 富数据夹具，预载项目/会话/项目文件/关联知识库、知识库文档、Prompt Skill 和 Kotlin 媒体正文。夹具只存在于 `BENCHMARK_ENABLED` 变体，不读取真实账号、Room 或网络。
3. 项目详情和知识库选择的生产动作原本会无条件启动详情 GET。Benchmark 变体现显式复用内存夹具并拒绝这两条网络路径，保证 UI smoke 不会污染真实后端或把网络时延误算成 Compose 行为。
4. 最终交互测试实际触摸项目整卡，切换“项目文件 / 项目设置”，打开项目文件删除确认后取消；选择知识库，打开文档删除确认后取消；打开技能编辑器并核对预填提示词后取消；打开 Kotlin 文件预览并核对代码块后关闭。没有确认服务端写操作。

## Traceability Matrix

| 要求或阶段 | 期望行为 | 代码证据 | 测试/运行证据 | 状态 | 缺口 |
| --- | --- | --- | --- | --- | --- |
| 富数据夹具 | 代表性行与详情完全本地、确定性、无账号/网络/Room | `BenchmarkFixtures.kt` | `BenchmarkFixturesTest` 断言四域实体与预载关系 | complete | — |
| 项目详情 | 整卡进入、会话、项目文件、关联知识库、设置与删除确认可达 | `WorkspaceScreens.kt`、`WorkspaceInteractionSmokeTest.kt` | Pixel 9 AVD 实际触摸并取消删除 | complete | 未确认真实删除，避免破坏数据 |
| 知识库详情 | 选库后展示文档与状态，危险操作有确认且可取消 | `WorkspaceScreens.kt`、`LinHubViewModel.kt` | Pixel 9 AVD 实际选择、打开确认、取消 | complete | — |
| 技能编辑 | 非空 Prompt Skill 可进入编辑器且预填现有提示词 | `SkillsScreen.kt`、`BenchmarkFixtures.kt` | Pixel 9 AVD 核对预填值后取消 | complete | — |
| 文件预览 | 非空代码资产可进入原生代码块并关闭 | `MediaPreviewDialog.kt`、`MarkdownRenderer.kt` | Pixel 9 AVD 读到 `复制代码` 与正文 marker | complete | 复制闭环由独立设备测试覆盖 |
| Benchmark 隔离 | 两套 smoke 均不访问真实后端、不崩溃 | `LinHubViewModel.kt` 的 benchmark 门控 | 交互 1/1（29.384 秒）、22-surface 1/1（25.535 秒）；两轮 0 OkHttp / 0 FATAL / 0 crash | complete | — |

## Progress Summary

当前未提交工作区把“页面空状态可达”扩展为“四个核心工作区域的非空数据与代表性交互自动可达”。这提升了自动化证据强度，但不替代真实后端成功/失败/回滚、支付渠道或固定真机性能验收。

## Next Work

1. 继续把管理后台和计费的高风险写操作提升为可注入失败的状态机/自动化回归，仍不触碰生产数据。
2. 在真实支付测试渠道可用后验证成功、取消、失败及支付返回全量刷新。
3. 在固定 API 35+ 真机完成 Web/PWA 与原生交替性能采样及双方 trace。
