# Skill Run 冷启动缓存与动画审计

日期：2026-07-23（Asia/Shanghai）  
范围：当前 Android 未提交工作区；不运行生产 Skill 或模型任务

## Findings

1. SSE 改造后，任务进行中的更新已快于旧轮询，但 App 进程重建会清空内存 `skillRuns`。历史任务卡必须等待边缘网络首个 SSE snapshot，弱网或离线时只能显示“正在连接任务”。
2. 当前把最后权威 `SkillRunSnapshot` 写入已有 `cached_payloads`，数据库本身按 account id 分库；退出登录和 401 失效继续删除整个账户数据库，不会跨账号展示任务内容。
3. Room 读取与 SSE 并发启动以获得最低首显延迟。缓存只在当前 run 为空且 id 匹配时填入；若 SSE 先到，慢 Room 结果被丢弃，避免进度从新值倒退到旧值。
4. 任务更新可能较密集，非终态缓存写入按 run id 做 180ms 合并；completed/failed/cancelled 等终态立即落盘。新快照会取消旧写任务，退出和会话失效清理全部任务缓存 Job。
5. 进度条和详情箭头改为原生 spring；任务卡去掉与 `AnimatedVisibility` 重叠的外层 `animateContentSize`，减少 SSE 更新或展开时的双重布局动画。
6. 设备测试证明 snapshot 真实写入磁盘、关闭并重开数据库后完整解码，同 key 在另一个账户数据库不可见。该证据覆盖持久化与隔离，不替代真实生产任务的进程终止闭环。

## Traceability Matrix

| 要求 | 期望行为 | 代码证据 | 测试/运行证据 | 状态 | 缺口 |
| --- | --- | --- | --- | --- | --- |
| 冷启动先显 | 网络首帧前展示最后任务状态 | `restoreCachedSkillRun()`、`PAYLOAD_SKILL_RUN_PREFIX` | codec JVM 回归、磁盘设备测试 | complete | 真实任务 UI 进程终止待受控账号复验 |
| 新旧竞态 | 缓存不得覆盖 SSE 新快照 | `selectSkillRunSnapshot()` | JVM 三分支测试 | complete | — |
| 写入成本 | 高频进度不逐事件同步写盘，终态不延迟 | `scheduleSkillRunCache()` | 编译与策略审查 | complete | 真实高事件量 trace 待生产任务 |
| 账户隔离 | A 账号任务不得在 B 账号出现 | `CacheDatabaseManager.databaseFor()`、登出删除 | Pixel 9 AVD 1/1 | complete | — |
| 动画流畅度 | 进度平滑、展开无重复尺寸动画 | `DurableSkillRunCard()` | 构建/Lint 与 AVD 启动冒烟 | partial | 真实事件动画帧 trace 尚未采集 |

## Verification

- `:app:testDebugUnitTest`、`:app:compileDebugAndroidTestKotlin`、`:app:lintDebug`、`:app:assembleDebug`：passed。
- `SkillRunSnapshotCacheTest`：Pixel 9 Android Studio AVD 1/1 passed。
- `SkillRunCardTest`：同一 Pixel 9 AVD 2/2 passed，覆盖展开/停止/重试与 PPT 表单。
- 远端后端 Debug APK 已安装冷启动，`MainActivity` 为 top resumed，crash buffer 为空。

## Next Work

1. 获得不计费或受控测试账号后，运行一条持续任务，在 running 状态强制结束进程并离线重开，记录缓存首显与 SSE 校准时间。
2. 同一任务采集更新/展开 Perfetto，确认动画主线程帧时间没有被 Room 写入或重复测量拉高。
