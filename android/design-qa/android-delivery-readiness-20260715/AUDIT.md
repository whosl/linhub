# Android Git 交付就绪审计

日期：2026-07-15（Asia/Shanghai）  
范围：`android/` 当前已跟踪文件与未跟踪但未被忽略的候选文件  
限制：本轮不执行 `git add`、commit、push 或生成正式 keystore

## Findings

1. Android 工程整体仍未进入 Git。初始候选为 367 个文件、约 66MB，其中 4 个原始 Perfetto trace 占 30,514,021 bytes；直接提交会永久膨胀仓库，但删除又会损失本机诊断证据。
2. `.gitignore` 现排除 `design-qa/**/*.perfetto-trace`。汇总 JSON、截图和审计结论仍可交付，4 个原始 trace 留在本机；没有删除或覆盖用户证据。
3. 新增 `npm run verify:android-delivery`，基于 Git 实际的 cached + untracked + exclude-standard 集合检查，而不是遍历所有构建目录。当前交付候选为 365 个文件、35,561,787 bytes，最大单文件是 2,669,833-byte Baseline Profile，低于 5MiB 门槛。
4. verifier 禁止 APK/AAB、keystore/私钥、`local.properties`、构建/Gradle/SDK 目录、`.DS_Store`、原始 trace、超过 5MiB 的单文件和符号链接；同时检查 8 类高置信密钥/凭据/绝对主机路径模式，只输出规则与文件名，不打印疑似秘密内容。
5. 唯一允许的 URL userinfo 命中限定为 `PaymentUrlPolicyTest.kt` 的恶意 URL 拒绝夹具；生产源码没有豁免。当前没有高置信秘密、带凭证 URL、macOS 用户主目录或服务器用户主目录等本机耦合路径进入交付集合。
6. Gradle Wrapper 文件齐全，`gradlew` 有可执行权限，分发 URL 为 HTTPS，`distributionSha256Sum` 为 64 位十六进制；`README.md`、`RELEASE.md` 与核心构建文件均在候选集合。

## Verification

| 检查 | 结果 |
| --- | --- |
| `npm run verify:android-delivery` | passed |
| 候选文件 | 365 |
| 候选总大小 | 35,561,787 bytes |
| 最大候选 | `baseline-prof.txt`，2,669,833 bytes |
| 本机保留且忽略的 Perfetto trace | 4 个，30,514,021 bytes |
| 高置信秘密模式 | 8 类，0 未豁免命中 |
| `npx eslint --no-ignore` | passed |
| `npm run verify:android-parity` | passed，80 methods / 13 pages / 58 routes |
| `npx tsc --noEmit` | passed |

## Remaining gate

源码集合已经达到可安全审查状态，但尚未纳入 Git，因为用户没有授权本轮暂存或提交。正式交付仍需要有意选择提交边界、审查当前 Web/后端脏改动与 Android 的关系，并由发布负责人提供正式 Release keystore；verifier 会在暂存前后使用同一规则继续生效。
