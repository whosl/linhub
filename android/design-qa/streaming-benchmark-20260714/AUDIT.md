# 确定性流式聊天基准审计

日期：2026-07-14（Asia/Shanghai）  
设备：Android Studio Pixel 9 AVD `emulator-5554`，Android 17 / API 37，16KB page  
图形：Android Emulator OpenGL ES Translator（Apple M5）  
被测变体：non-debuggable、R8 `benchmark`，`CompilationMode.Partial`

## 场景

- Benchmark-only fixture：一条用户消息和一条空的 streaming assistant。
- 专用 `singleTop` Intent 触发 `AssistantStart → 120 × TextDelta → Done`。
- 每个 TextDelta 间隔 24ms，复用生产 `ChatTranscriptReducer` 和聊天 UI。
- 完成态正文包含 `STREAMING_BENCHMARK_DONE`，随后切换 Markdown 与消息操作栏。
- `BuildConfig.BENCHMARK_ENABLED` 和 `streaming-chat` 场景双重门控；Debug/Release 不会执行。
- 无网络、账号、Room、发送消息或计费副作用。

## 正确性

- fixture、120 帧数量、Done 状态和双重门控均有 JVM 策略测试。
- 分片测试证明 `chunks.joinToString("\n")` 与原文逐字符一致，旧分片在新 delta 到来后保持稳定。
- 自动跟随只响应真实拖拽，底部距离包含 LazyColumn trailing padding。
- [终态截图](post-profile/streaming-follow-final.png)显示完成标记及复制、重试、反馈、朗读、引用操作栏。
- [终态语义树](post-profile/streaming-follow-final.xml)包含 `STREAMING_BENCHMARK_DONE`，不包含“生成中”或“回到底部”。

## AndroidX 原始结果

每一阶段均 10/10 轮通过；模拟器警告保留。

| 阶段 | CPU P50 | CPU P90 | CPU P95 | CPU P99 | Overrun P50 | Overrun P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 优化前 | 22.3ms | 97.3ms | 154.8ms | 210.7ms | 24.4ms | 185.8ms |
| 热路径优化、Profile 前 | 19.0ms | 97.5ms | 154.2ms | 207.6ms | 25.6ms | 185.0ms |
| 热路径优化 + 新 Profile | 22.4ms | 83.6ms | 156.4ms | 211.7ms | 19.7ms | 188.6ms |

原始结果位于 `baseline/`、`final/`、`post-profile/` 的 `summary.txt` 和 `benchmarkData.json`。P50/P95 随宿主窗口回压漂移，不能只选快轮作为结论。

## Perfetto 归因

选择帧数接近中位数的优化前和 post-profile trace：

| App 主线程切片 | 优化前平均 | 最终平均 | 变化 |
| --- | ---: | ---: | ---: |
| `TextStringSimpleNode::measure` | 3.316ms | 1.490ms | -55.1% |
| `TextLayout:initLayout` | 1.694ms | 0.590ms | -65.2% |
| `Constructing StaticLayout` | 0.832ms | 0.319ms | -61.7% |
| `AndroidOwner:measureAndLayout` | 1.593ms | 1.293ms | -18.8% |

最终代表 trace 中 RenderThread 的 `waitForBufferRelease` 仍最高约 210.6ms；优化前代表 trace 约 205.6ms。端到端 P95 没有随 App 文本排版等比例下降，主要限制仍是 AVD SurfaceFlinger / 宿主缓冲区回压。所有阶段都如实保留，不用 App 内切片覆盖 AndroidX 原始异常。

## Baseline Profile 与构建

- 流式优化阶段的 Profile 生成器覆盖启动、1,000 消息滚动、120 帧流式聊天三条旅程。
- 该阶段结果为 23,043 条 Baseline、18,156 条 Startup 规则；同日后续加入工作区八页导航旅程后，当前源码为 24,985 / 18,155 条，流式方法仍在 Profile 中。
- 相比前一轮 Baseline：新增 43、移除 17、未改 23,000。
- `StreamingPlainText`、`streamingTextChunks`、`LastItemOverrideList`、`runStreamingBenchmark` 均在 Baseline Profile 中。
- `updateBaselineProfile` 已改为 configuration-cache 兼容 Task，并完成 3/3 设备采集和 cache 存储。
- `testDebugUnitTest`、`lintDebug`、`assembleDebug`、`assembleBenchmark`、测试 APK 与最终 Streaming Macrobenchmark 均通过。

## 限制

该证据证明确定性流式链路、App 热路径优化和自动跟随正确性，但模拟器不是最终性能设备。“原生流式比 Web 更快”的最终声明仍要求固定 API 35+ 真机、同一回复数据、Web/PWA 与原生交替执行并保留双方 trace。
