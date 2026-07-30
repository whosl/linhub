# Skill Run 按卡片重组隔离审计

日期：2026-07-23（Asia/Shanghai）  
范围：Android Skill Run SSE → ViewModel → Compose 状态传播

## Findings

1. SSE 与 Room 先显已降低网络等待，但所有任务状态仍存放在 `LinHubUiState`。每个 snapshot 都创建新全局状态；`LinHubApp` 将该对象直接传给 `ChatScreen`，因此顶栏、信息流、输入框和 Artifact 分支都会进入重组检查。
2. 当前把 snapshot/loading/mutating/error 拆到独立 `MutableStateFlow<Map<runId, SkillRunCardUiState>>`。`LinHubUiState` 不再包含任务进度字段，进行中快照不会触发应用根状态 emission。
3. 每张可见任务卡通过 `selectSkillRunCardState(runId)` 单独订阅并 `distinctUntilChanged`。run-2 更新不会向 run-1 collector 发射，避免多张历史任务卡互相唤醒。
4. 完成回执仍属于真实聊天内容：只有 snapshot 带 completionMessage 且对应转录已加载时，主状态才幂等 upsert 消息并立即落 Room。功能语义没有为性能优化而缩减。
5. 登出与 401 失效会取消任务 Job、清空独立状态流并删除账户数据库；停止观察只关闭该 run 的连接和 loading，不影响已缓存快照。

## Traceability Matrix

| 要求 | 期望行为 | 代码证据 | 测试/运行证据 | 状态 | 缺口 |
| --- | --- | --- | --- | --- | --- |
| 根状态隔离 | 进行中 snapshot 不更新 `LinHubUiState` | `_skillRunCardStates`、`publishSkillRunSnapshot()` | 代码路径审计、完整编译 | complete | — |
| runId 隔离 | 其他任务变化不唤醒当前卡 | `selectSkillRunCardState()` | JVM Flow 测试、Compose 重组计数 1/1 | complete | — |
| 完成回执 | 最终消息仍进入转录且幂等 | `upsertSkillRunCompletionMessage()` | 既有策略测试与 API/卡片回归 | complete | 生产 worker 闭环另列 |
| 生命周期 | 离屏、登出、401 正确取消/清理 | observer 引用计数、session cleanup | 代码审计与设备回归 | complete | 真机进程终止复验另列 |
| UI 交互 | 展开、停止、重试、PPT 表单不退化 | `BoundSkillRunPanel()`、`SkillRunPanel()` | Pixel 9 AVD 3/3 | complete | — |

## Verification

- `:app:testDebugUnitTest`：passed，含 runId Flow emission 隔离。
- `:app:compileDebugAndroidTestKotlin`、`:app:lintDebug`、`:app:assembleDebug`：passed。
- `SkillRunCardTest`：Pixel 9 Android Studio AVD 3/3；新增测试直接统计两张 collector 的 Compose 次数。
- Skill Run API、磁盘缓存与卡片合并设备回归：6/6 passed。

## Next Work

1. 在受控真实任务上采集 snapshot burst 前后的 Perfetto，对比聊天根 `recompose` 与 `measure` slice。
2. 若任务事件密度继续提高，再把完成回执 cache flush 与任务 snapshot 写入合并到专用顺序队列，避免终态瞬间的双 IO 峰值。

