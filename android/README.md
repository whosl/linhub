# LinHub Android

原生 Jetpack Compose 客户端。Next.js 应用继续作为统一后端，Android 通过 HTTPS、Bearer 会话和 NDJSON 流复用现有业务能力。

## 工具链

- JDK 17 或更新版本（编译目标仍为 Java 17）
- Gradle 9.4.1（使用项目 Wrapper）
- Android Gradle Plugin 9.2.1
- Android SDK Platform 37，Target SDK 37

## 本地服务

Android 模拟器的 Debug 默认访问 `http://10.0.2.2:3000/`，明文流量仅对白名单中的模拟器宿主地址开放。真机必须使用 HTTPS 后端：

```bash
./gradlew :app:assembleDebug -PLINHUB_DEBUG_BASE_URL=https://dev.example.com/
```

### Lighthouse 远端服务

需要直接联调已部署的 LinHub 时，可通过 Cloudflare Tunnel 域名构建 Debug APK；不需要
`adb reverse`，Android Studio Emulator 和真机使用同一条命令：

```bash
./gradlew :app:assembleDebug \
  -PLINHUB_DEBUG_BASE_URL=https://xiaolin.wenzhuolin.xyz/
```

切回本机后端时，重新使用下方 `http://127.0.0.1:3000/` 参数构建并恢复 `adb reverse` 即可。
服务端账号、SSH 密码和 API 密钥不得写入 Gradle 参数或仓库文件。

### Android Studio Pixel 9 AVD

在 Android Studio Device Manager 启动 Pixel 9 AVD 后执行：

```bash
ADB="$PWD/.sdk/platform-tools/adb"
"$ADB" -s emulator-5554 reverse tcp:3000 tcp:3000

./gradlew :app:assembleDebug \
  -PLINHUB_DEBUG_BASE_URL=http://127.0.0.1:3000/
"$ADB" -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk
```

`adb reverse` 让 Android Studio Emulator 内的 `127.0.0.1:3000` 映射到 Mac 上的 Next.js 服务；
它仅用于 Debug，Release 仍强制使用 HTTPS。若 `adb devices -l` 显示的序列号不是
`emulator-5554`，把后续命令中的 `-s` 参数替换为实际序列号。

Device Manager 的 Emulated Performance → Graphics 保持 `Automatic` 或硬件加速，不要把日常动画测试
固定到 `SwiftShader`。可用下面的命令确认 AVD 是否正在使用 Mac 宿主 GPU；输出应包含 Apple GPU，
而不是 `SwiftShader Device`：

```bash
adb -s emulator-5554 shell dumpsys SurfaceFlinger | grep 'GLES:'
```

SwiftShader 仅用于隔离模拟器图形驱动崩溃。它是 CPU 软件渲染，会把正常抽屉动画放大成数百毫秒长帧，
不能用来判断 App 的动画性能。

Release 必须指定 HTTPS 地址，否则构建产物只会指向不可用的占位域名：

```bash
./gradlew :app:bundleRelease -PLINHUB_BASE_URL=https://your-linhub.example/
```

## 构建

```bash
./gradlew :app:testDebugUnitTest
./gradlew :app:lintDebug
./gradlew :app:assembleDebug
./gradlew :app:assembleBenchmark :benchmark:assembleBenchmark
```

从仓库根目录运行 Web → Android 功能面漂移校验；Web 新增 `DataService` 方法、页面或 API Route 但未登记原生覆盖时会直接失败：

```bash
npm run verify:android-parity
```

准备纳入 Git 或交付源码前运行下列检查；它会拒绝 APK、keystore、本机配置、构建目录、原始 Perfetto trace、大文件、符号链接和高置信秘密格式，但不会自动暂存或删除文件：

```bash
npm run verify:android-delivery
```

## 性能基准

`benchmark` 是使用 Debug 签名、Release 优化和独立 application id 的测试变体。它只在
`BuildConfig.BENCHMARK_ENABLED=true` 时注入确定性的假用户数据，不读取真实令牌、Room 数据或网络。
连接 API 28+ 的设备后可分别运行冷启动、1,000 条消息滚动和 Baseline Profile 生成器：

```bash
./gradlew :benchmark:connectedBenchmarkAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=com.linhub.android.benchmark.StartupBenchmark

./gradlew :benchmark:connectedBenchmarkAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=com.linhub.android.benchmark.LongChatScrollBenchmark

./gradlew :benchmark:connectedBenchmarkAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=com.linhub.android.benchmark.DrawerNavigationBenchmark \
  -Pandroid.testInstrumentationRunnerArguments.androidx.benchmark.suppressErrors=EMULATOR

./gradlew :benchmark:connectedBenchmarkAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=com.linhub.android.benchmark.StreamingChatBenchmark \
  -Pandroid.testInstrumentationRunnerArguments.androidx.benchmark.suppressErrors=EMULATOR

./gradlew :app:updateBaselineProfile \
  -Pandroid.testInstrumentationRunnerArguments.androidx.benchmark.suppressErrors=EMULATOR
```

模拟器只做链路冒烟时，需要显式承认并抑制精度警告：

```bash
./gradlew :benchmark:connectedBenchmarkAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.androidx.benchmark.suppressErrors=EMULATOR
```

Macrobenchmark 的 JSON 与 Perfetto trace 位于
`benchmark/build/outputs/connected_android_test_additional_output/`。独立 `baselineprofile` 模块先把采集结果
写入隔离目录，`updateBaselineProfile` 校验后再更新所有 R8 变体共享的
`app/src/main/baseline-prof.txt` 与 `app/src/main/startup-prof.txt`。正式 P50/P95 验收应关闭省电模式，固定设备、
系统版本和刷新率，并使用非 Debuggable 的 `benchmark` 变体；模拟器只用于流程冒烟，不作为性能结论。
最近一次可复现记录见 [BENCHMARK_RESULTS.md](BENCHMARK_RESULTS.md)。

生产 Web 与原生同设备对照需要先启动独立生产服务，并把 Chrome DevTools 端口转发到宿主机：

```bash
npm run start -- --hostname 127.0.0.1 --port 3001
adb reverse tcp:3001 tcp:3001
adb forward tcp:9222 localabstract:chrome_devtools_remote

./gradlew :app:assembleProfile \
  -PLINHUB_PROFILE_BASE_URL=http://127.0.0.1:3001/
adb install -r app/build/outputs/apk/profile/app-profile.apk
# 首次安装后在 profile App 与 Chrome 登录同一测试账号，并打开首页完成缓存预热。

ITERATIONS=10 node android/tools/web-performance-cdp.mjs
TARGET_PACKAGE=com.linhub.android.profile RUNS=10 zsh android/tools/compare-startup.zsh
RUNS=5 node android/tools/web-scroll-cdp.mjs
RUNS=5 zsh android/tools/native-scroll-framestats.zsh
```

滚动对照脚本要求 Chrome 和原生已打开同一条长会话；脚本不会创建或保留业务数据。模拟器结果只用于发现回归，正式交付仍按 [BENCHMARK_RESULTS.md](BENCHMARK_RESULTS.md) 的真机门槛执行。

## 流式断线恢复回归

`tools/chat-drop-proxy.mjs` 会转发本地后端，并只把下一次 `/api/chat` POST 响应在指定字节数后断开；上游生成仍继续，可确定性验证 Android 的终态校验和 GET 续接：

```bash
node tools/chat-drop-proxy.mjs
adb reverse tcp:3000 tcp:3002
```

验证结束后停止代理，并恢复普通调试映射：

```bash
adb reverse --remove tcp:3000
adb reverse tcp:3000 tcp:3000
```

完整迁移范围与当前状态见 [FEATURE_MATRIX.md](FEATURE_MATRIX.md)。

## 目标页缓存回归

聊天首页稳定后会在 IO 线程预取项目、知识库、技能、全部文件、计费和设置六类 Room payload；预取只读本地缓存，不额外发起 HTTP。文件结果有 30 秒内存新鲜期，计费和设置分别使用 30 秒、60 秒 stale-first 快照。计费网络读取按当前套餐/用量/流水标签拆分，设置按账户/记忆/风格/MCP 标签拆分；两类 grouped payload 都只在全部子资源新鲜时回写。过期快照仍会立即显示，同时后台刷新；刷新失败后下次进入继续重试。App 后台超过 Web QueryClient 的 30 秒新鲜期再返回时，也只异步重新验证当前可见功能域与用户，不清空先显缓存；聊天页会同步热刷新模型、风格、知识库和当前上下文，失效模型自动回退，短后台仍只走轻量会话恢复。网络重连同样会重新验证当前页面：前台立即执行，后台只记录一次并延迟到首个 `ON_START`，不在后台耗电。Pixel 9 AVD 的 fresh、expired 慢网、飞行模式、重连和 31 秒/6 秒恢复 A/B 见 [DEVICE_E2E_RESULTS.md](DEVICE_E2E_RESULTS.md)。

管理后台不在首屏预取全部管理数据，而是按标签加载；用户标签只额外依赖套餐，系统设置只额外依赖模型。已成功资源在当前进程内复用，失败资源不会被标记为完成，并显示持续可见的标签级重试入口。

项目页同样按实际界面依赖加载：项目列表和详情“对话”标签只使用项目索引；进入“项目文件”、新建项目或编辑项目信息时才按需加载知识库，已加载后快速重进不会重复请求。详情页按 Web 手机版拆为“对话 / 项目文件 / 项目设置”三个标签，列表整卡进入详情，不使用项目会话弹窗；卡片同时提供“打开项目「名称」”的 TalkBack 语义。

设置页按“账户 / 记忆 / 回复风格 / MCP 连接器”四标签独立加载，并按 Web 手机断点保持相同信息结构。记忆卡显示相对更新时间，回复风格使用单独的默认选择卡；记忆和风格列表增删使用稳定 key 与 `animateItem`，避免整页重排闪烁。本轮 Web/原生逐屏证据见 `design-qa/settings-mobile-audit-20260713/`。

计费页同样按 Web 手机断点保持“订阅套餐 / 充值 / 用量明细 / 余额流水”四标签结构。充值金额固定为三列两行，充值与兑换分别使用独立卡片；用量和流水继续使用带稳定 key 的 `LazyColumn`，分别呈现摘要卡式明细和连续分段行。额度进度、标签切换、金额选择与列表变化使用原生动画，且不会为了复刻 Web 的 360px 表格而裁掉费用列。本轮逐屏证据见 `design-qa/billing-mobile-audit-20260713/`。
