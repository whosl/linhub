---
name: code-lab
description: 在强隔离、无网络的代码沙盒中运行和验证 Python、Node.js 或 Bash，读取用户附件并生成可下载输出文件。用户要求执行代码、复现错误、验证算法、处理本地文件、运行脚本、生成程序输出或明确提到 Code Lab/代码沙盒时使用；只需解释代码、编写但不运行代码或需要访问互联网安装依赖时不要使用。
license: Proprietary
compatibility: Requires LinHub gVisor Code Sandbox, Docker runsc runtime, and preloaded runtime images.
metadata:
  author: LinHub
  version: "1.0.0"
  category: code
allowed-tools: run_code
---

# 代码实验室

通过 `run_code` 在临时 gVisor 沙盒中执行代码。不要展示或声称存在未实际得到的运行结果。

## 工作流

1. 选择最适合任务的语言。数据处理优先 Python，前端或 JavaScript 逻辑优先 Node.js，系统脚本才使用 Bash。
2. 把需要读取的用户文件作为 `inputs` 传入。代码从 `/workspace/input` 读取，不能尝试访问项目源码、环境变量、宿主机路径或网络。
3. 将需要交付给用户的文件写入 `/workspace/output`。标准输出只放日志、摘要和验证结果。
4. 调用 `run_code`，检查退出码、stderr、超时和输出限制。失败时根据真实错误修正代码后最多重试两次。
5. 用简短结论说明执行了什么、结果是否通过，并把工具返回的输出附件交付给用户。

## 约束

- 不要通过网络下载安装依赖；只使用运行镜像已有的标准库和依赖。
- 不要把密钥、令牌或敏感配置写入代码、日志或输出文件。
- 不要用 shell 绕过输入/输出目录或沙盒限制。
- 对不受信任的输入设置合理超时，避免无限循环和输出洪泛。
- 若沙盒不可用，明确说明基础设施未配置，不要在宿主机或普通 Docker runtime 上回退执行。

运行环境与文件约定见 [沙盒约定](references/sandbox-contract.md)。
