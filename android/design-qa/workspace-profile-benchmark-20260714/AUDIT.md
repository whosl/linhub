# 工作区导航 Baseline Profile A/B

日期：2026-07-14（Asia/Shanghai）  
设备：Android Studio Pixel 9 AVD `emulator-5554`，Android 17 / API 37  
被测 APK：R8 `com.linhub.android.benchmark`  
场景：项目 → 技能 → 知识库 → 文件 → 新对话，每组 10 轮

## 正确性门控

- Benchmark APK 内含 `assets/dexopt/baseline.prof`（10,653B）和 `baseline.profm`（1,236B）。
- 手动复现 ProfileInstaller 广播返回 `result=1`；ART 编译返回 `Success`；`dumpsys package dexopt` 为 `status=speed-profile / reason=cmdline`。
- 所有 `CompilationMode.Partial` 基准现在显式使用 `BaselineProfileMode.Require`。
- 每轮 `setupBlock` 在测量前直接读取 ART dexopt：Profile 组必须为 `speed-profile`，无 Profile 组必须不是 `speed-profile`；状态不符会立即失败。
- Profile-on / Profile-off 两组共 20 / 20 轮通过，证明本次 A/B 的编译状态真实不同。AndroidX JSON 的单个顶层 `context.compilationMode=verify` 不能表达两组状态，因此不再把它作为分组依据。

## AndroidX 原始结果

| 分组 | CPU P50 | CPU P90 | CPU P95 | Overrun P50 | Overrun P95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 无 Profile | 19.351ms | 117.151ms | 184.899ms | 28.796ms | 199.833ms |
| Baseline Profile | 14.474ms | 127.428ms | 197.824ms | 25.494ms | 197.149ms |
| 变化 | -25.2% | +8.8% | +7.0% | -11.5% | -1.3% |

中位 CPU 帧改善，但 P90/P95 被 AVD 宿主和 SurfaceFlinger 慢尾淹没，因此 AndroidX 汇总本身不能证明端到端真机达标。

## Perfetto App/系统分离

对每组 10 份 trace 分别计算每轮指标，再比较两组的“每轮指标中位数”：

| 指标 | 无 Profile | Baseline Profile | 变化 |
| --- | ---: | ---: | ---: |
| UI 主线程 `Choreographer#doFrame` P50 | 4.846ms | 3.195ms | -34.1% |
| UI 主线程 `Choreographer#doFrame` P95 | 30.307ms | 16.258ms | -46.4% |
| `AndroidOwner:measureAndLayout` P95 | 12.778ms | 5.154ms | -59.7% |
| `Recomposer:recompose` P95 | 4.942ms | 2.948ms | -40.4% |
| UI 主线程 `postAndWait` P95 | 12.034ms | 11.416ms | -5.1% |
| RenderThread `waitForBufferRelease` 最大值 | 211.953ms | 212.694ms | +0.3% |

Profile 组的 App 自身组合、测量和帧调度成本一致下降；与 App 代码无关的缓冲区等待完全不变。该分离解释了“中位帧更快，但 AndroidX P95 没改善”的表面矛盾。

## 结论与限制

当前证据证明新的工作区 Baseline Profile 在 AVD 上真实生效，并明显降低 App 自身首次页面组合成本；不证明 AVD 端到端 P95 或真机最终性能已经达标。正式“比 Web 更快、更流畅”声明仍要求固定 API 35+ 真机、同一数据、Web/PWA 与原生交替执行，并保留双方 trace。

原始 AndroidX JSON、20 份 Perfetto trace 和每组文本汇总位于当前构建输出：

`benchmark/build/outputs/connected_android_test_additional_output/benchmark/connected/Pixel_9(AVD) - 17/`
