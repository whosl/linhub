import "server-only";

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type SandboxLanguage = "python" | "node" | "bash";

export type SandboxInputFile =
  | {
      path: string;
      content: string | Uint8Array;
      sourcePath?: never;
      mode?: never;
    }
  | {
      path: string;
      sourcePath: string;
      /** 默认复制，只有受信任的调用方才应选择只读挂载。 */
      mode?: "copy" | "mount";
      content?: never;
    };

export interface CodeSandboxLimits {
  timeoutMs?: number;
  memoryMb?: number;
  cpus?: number;
  pids?: number;
  stdoutStderrBytes?: number;
  outputBytes?: number;
  outputFiles?: number;
  inputBytes?: number;
}

export interface RunCodeSandboxOptions {
  language: SandboxLanguage;
  code: string;
  args?: string[];
  inputFiles?: SandboxInputFile[];
  env?: Record<string, string>;
  limits?: CodeSandboxLimits;
}

export interface SandboxOutputFile {
  path: string;
  size: number;
  data: Buffer;
}

export interface CodeSandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  outputFiles: SandboxOutputFile[];
  durationMs: number;
  timedOut: boolean;
  stdoutStderrLimitExceeded: boolean;
  outputLimitExceeded: boolean;
}

export class CodeSandboxUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CodeSandboxUnavailableError";
  }
}

const SANDBOX_UID = 65_532;
const SANDBOX_GID = 65_532;
const MAIN_FILES: Record<SandboxLanguage, string> = {
  python: "main.py",
  node: "main.js",
  bash: "main.sh",
};
const IMAGE_ENV: Record<SandboxLanguage, string> = {
  python: "LINHUB_SANDBOX_PYTHON_IMAGE",
  node: "LINHUB_SANDBOX_NODE_IMAGE",
  bash: "LINHUB_SANDBOX_BASH_IMAGE",
};
const DEFAULT_IMAGES: Record<SandboxLanguage, string> = {
  python: "python:3.12-slim",
  node: "node:22-slim",
  bash: "bash:5.2",
};
const COMMANDS: Record<SandboxLanguage, readonly string[]> = {
  python: ["python3", "/workspace/main.py"],
  node: ["node", "/workspace/main.js"],
  bash: ["bash", "/workspace/main.sh"],
};
const RESERVED_ENV_KEYS = new Set([
  "HOME",
  "PATH",
  "TMPDIR",
  "LINHUB_INPUT_DIR",
  "LINHUB_OUTPUT_DIR",
]);
const RUNNER_SCRIPT = `#!/bin/sh
set +e
"$@"
exit_code=$?
umask 077
printf '%s\\n' "$exit_code" > /linhub-status/exit-code
while :; do
  sleep 3600
done
`;

interface NormalizedLimits {
  timeoutMs: number;
  memoryMb: number;
  cpus: number;
  pids: number;
  stdoutStderrBytes: number;
  outputBytes: number;
  outputFiles: number;
  inputBytes: number;
}

interface PreparedWorkspace {
  root: string;
  codeDir: string;
  copiedOutputDir: string;
  mountedInputs: { source: string; destination: string }[];
}

interface AttachedProcess {
  child: ChildProcessWithoutNullStreams;
  completion: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  stdout: Buffer[];
  stderr: Buffer[];
  totalBytes: number;
  limitExceeded: boolean;
}

/**
 * 确认 Docker daemon 明确注册了名为 runsc 的 runtime。
 * 这里不会接受其他 runtime，也不会尝试任何本机进程执行回退。
 */
export async function assertCodeSandboxAvailable(): Promise<void> {
  const docker = dockerBinary();
  let result: CommandResult;
  try {
    result = await runCommand(
      docker,
      ["info", "--format", "{{json .Runtimes}}"],
      10_000,
      128 * 1024
    );
  } catch (error) {
    throw new CodeSandboxUnavailableError(
      "代码沙盒不可用：无法连接 Docker daemon。",
      { cause: error }
    );
  }
  if (result.code !== 0) {
    throw new CodeSandboxUnavailableError(
      `代码沙盒不可用：Docker 检查失败：${cleanDockerError(result.stderr)}`
    );
  }

  try {
    const runtimes = JSON.parse(result.stdout) as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(runtimes, "runsc")) {
      throw new CodeSandboxUnavailableError(
        "代码沙盒不可用：Docker 未注册 runsc runtime，已拒绝回退到 runc。"
      );
    }
  } catch (error) {
    if (error instanceof CodeSandboxUnavailableError) throw error;
    throw new CodeSandboxUnavailableError(
      "代码沙盒不可用：无法确认 Docker 的 runsc runtime。",
      { cause: error }
    );
  }
}

export async function runCodeSandbox(
  options: RunCodeSandboxOptions
): Promise<CodeSandboxResult> {
  validateOptions(options);
  const limits = normalizeLimits(options.limits);
  const startedAt = Date.now();

  // 必须先检查 runtime；失败时绝不创建普通 Docker/runc 容器。
  await assertCodeSandboxAvailable();

  const workspace = await prepareWorkspace(options, limits);
  const docker = dockerBinary();
  let containerId: string | undefined;
  let attached: AttachedProcess | undefined;
  let containerPaused = false;

  try {
    const createResult = await runCommand(
      docker,
      dockerCreateArgs(options, limits, workspace),
      60_000,
      256 * 1024
    );
    if (createResult.code !== 0) {
      throw new Error(`创建 runsc 沙盒失败：${cleanDockerError(createResult.stderr)}`);
    }
    containerId = createResult.stdout.trim();
    if (!/^[a-f0-9]{12,64}$/u.test(containerId)) {
      throw new Error("创建 runsc 沙盒失败：Docker 未返回有效容器 ID。");
    }

    attached = startAttachedContainer(
      docker,
      containerId,
      limits.stdoutStderrBytes
    );

    const deadline = Date.now() + limits.timeoutMs;
    let exitCode: number | null = null;
    let timedOut = false;
    let stdoutStderrLimitExceeded = false;
    let infrastructureFailure: string | undefined;

    while (exitCode === null) {
      if (attached.limitExceeded) {
        stdoutStderrLimitExceeded = true;
        break;
      }
      if (Date.now() >= deadline) {
        timedOut = true;
        break;
      }

      const status = await readContainerExitCode(docker, containerId, workspace.root);
      if (status !== null) {
        exitCode = status;
        break;
      }

      const attachmentState = await settledValue(attached.completion);
      if (attachmentState) {
        infrastructureFailure =
          `runsc 容器在返回执行状态前退出（Docker 退出码 ${attachmentState.code ?? "null"}）`;
        break;
      }
      await delay(50);
    }

    if (infrastructureFailure) {
      throw new Error(
        `${infrastructureFailure}：${bufferText(attached.stderr) || "无错误输出"}`
      );
    }

    // 超时或标准输出超限时先冻结，再复制有限 tmpfs 中的输出，避免复制期间继续写入。
    if (timedOut || stdoutStderrLimitExceeded) {
      const pauseResult = await runCommand(
        docker,
        ["pause", containerId],
        5_000,
        64 * 1024
      ).catch(() => null);
      containerPaused = pauseResult?.code === 0;
    }

    let outputCopyFailed = false;
    if ((!timedOut && !stdoutStderrLimitExceeded) || containerPaused) {
      const copyResult = await runCommand(
        docker,
        ["cp", `${containerId}:/workspace/output/.`, workspace.copiedOutputDir],
        15_000,
        128 * 1024
      ).catch(() => null);
      outputCopyFailed = copyResult === null || copyResult.code !== 0;
    } else {
      outputCopyFailed = true;
    }

    const collected = outputCopyFailed
      ? { files: [] as SandboxOutputFile[], exceeded: false }
      : await collectOutputFiles(
          workspace.copiedOutputDir,
          limits.outputFiles,
          limits.outputBytes
        );

    if (outputCopyFailed && !timedOut && !stdoutStderrLimitExceeded) {
      throw new Error("沙盒已结束，但无法安全取回输出目录。");
    }

    return {
      stdout: bufferText(attached.stdout),
      stderr: bufferText(attached.stderr),
      exitCode,
      outputFiles: collected.files,
      durationMs: Date.now() - startedAt,
      timedOut,
      stdoutStderrLimitExceeded,
      outputLimitExceeded: collected.exceeded,
    };
  } finally {
    if (containerId) {
      if (containerPaused) {
        await runCommand(docker, ["unpause", containerId], 5_000, 64 * 1024).catch(
          () => undefined
        );
      }
      await runCommand(docker, ["rm", "--force", "--volumes", containerId], 10_000, 64 * 1024).catch(
        () => undefined
      );
    }
    if (attached) {
      attached.child.stdout.destroy();
      attached.child.stderr.destroy();
      attached.child.kill("SIGKILL");
      await Promise.race([attached.completion, delay(2_000)]).catch(() => undefined);
    }
    await rm(workspace.root, { recursive: true, force: true }).catch(() => undefined);
  }
}

function dockerCreateArgs(
  options: RunCodeSandboxOptions,
  limits: NormalizedLimits,
  workspace: PreparedWorkspace
): string[] {
  const image = configuredImage(options.language);
  const codeMount = dockerMount(workspace.codeDir, "/workspace", true);
  const args = [
    "create",
    "--runtime=runsc",
    "--pull=never",
    "--network=none",
    "--ipc=none",
    "--read-only",
    `--user=${SANDBOX_UID}:${SANDBOX_GID}`,
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges:true",
    `--pids-limit=${limits.pids}`,
    `--memory=${limits.memoryMb}m`,
    `--memory-swap=${limits.memoryMb}m`,
    `--cpus=${limits.cpus}`,
    `--ulimit=nofile=256:256`,
    `--ulimit=fsize=${limits.outputBytes}:${limits.outputBytes}`,
    "--stop-timeout=1",
    "--workdir=/workspace",
    `--mount=${codeMount}`,
    "--tmpfs",
    `/workspace/output:rw,noexec,nosuid,nodev,size=${limits.outputBytes},uid=${SANDBOX_UID},gid=${SANDBOX_GID},mode=0700`,
    "--tmpfs",
    `/linhub-status:rw,noexec,nosuid,nodev,size=64k,uid=${SANDBOX_UID},gid=${SANDBOX_GID},mode=0700`,
    "--tmpfs",
    `/tmp:rw,noexec,nosuid,nodev,size=64m,uid=${SANDBOX_UID},gid=${SANDBOX_GID},mode=1777`,
    "--env=HOME=/tmp",
    "--env=TMPDIR=/tmp",
    "--env=LINHUB_INPUT_DIR=/workspace/input",
    "--env=LINHUB_OUTPUT_DIR=/workspace/output",
    "--env=LANG=C.UTF-8",
  ];

  for (const [key, value] of Object.entries(options.env ?? {})) {
    args.push("--env", `${key}=${value}`);
  }
  for (const mounted of workspace.mountedInputs) {
    args.push("--mount", dockerMount(mounted.source, mounted.destination, true));
  }

  args.push(
    "--entrypoint=/bin/sh",
    image,
    "/workspace/.linhub-runner.sh",
    ...COMMANDS[options.language],
    ...(options.args ?? [])
  );
  return args;
}

async function prepareWorkspace(
  options: RunCodeSandboxOptions,
  limits: NormalizedLimits
): Promise<PreparedWorkspace> {
  const tempBase = path.resolve(
    process.env.LINHUB_SANDBOX_TMPDIR?.trim() || os.tmpdir()
  );
  await mkdir(tempBase, { recursive: true, mode: 0o700 });
  const root = await mkdtemp(path.join(tempBase, "linhub-sandbox-"));
  const codeDir = path.join(root, "workspace");
  const inputDir = path.join(codeDir, "input");
  const copiedOutputDir = path.join(root, "collected-output");
  const mountedInputs: PreparedWorkspace["mountedInputs"] = [];

  try {
    await mkdir(inputDir, { recursive: true, mode: 0o700 });
    await mkdir(path.join(codeDir, "output"), { mode: 0o700 });
    await mkdir(copiedOutputDir, { mode: 0o700 });
    await writeFile(path.join(codeDir, MAIN_FILES[options.language]), options.code, {
      encoding: "utf8",
      mode: 0o444,
      flag: "wx",
    });
    await writeFile(path.join(codeDir, ".linhub-runner.sh"), RUNNER_SCRIPT, {
      encoding: "utf8",
      mode: 0o555,
      flag: "wx",
    });

    let inputBytes = 0;
    const seen = new Set<string>();
    for (const input of options.inputFiles ?? []) {
      const relativePath = safeRelativePath(input.path);
      if (seen.has(relativePath)) throw new Error(`输入文件路径重复：${relativePath}`);
      seen.add(relativePath);
      const destination = path.join(inputDir, ...relativePath.split("/"));
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });

      if (input.content !== undefined) {
        const bytes =
          typeof input.content === "string"
            ? Buffer.byteLength(input.content)
            : input.content.byteLength;
        inputBytes += bytes;
        assertInputSize(inputBytes, limits.inputBytes);
        await writeFile(destination, input.content, { mode: 0o444, flag: "wx" });
        continue;
      }

      const source = await realpath(input.sourcePath);
      const sourceStat = await stat(source);
      if (!sourceStat.isFile()) throw new Error(`输入源不是普通文件：${input.path}`);
      inputBytes += sourceStat.size;
      assertInputSize(inputBytes, limits.inputBytes);

      if ((input.mode ?? "copy") === "mount") {
        if ((sourceStat.mode & 0o004) === 0) {
          throw new Error(`只读挂载的输入文件必须允许容器内非 root 用户读取：${input.path}`);
        }
        assertDockerMountSource(source);
        await writeFile(destination, "", { mode: 0o444, flag: "wx" });
        mountedInputs.push({
          source,
          destination: `/workspace/input/${relativePath}`,
        });
      } else {
        await copyFile(source, destination);
        await chmod(destination, 0o444);
      }
    }

    await makeTreeReadOnly(inputDir);
    await chmod(path.join(codeDir, "output"), 0o555);
    await chmod(codeDir, 0o555);
    assertDockerMountSource(codeDir);
    return { root, codeDir, copiedOutputDir, mountedInputs };
  } catch (error) {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function makeTreeReadOnly(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await makeTreeReadOnly(entryPath);
      await chmod(entryPath, 0o555);
    } else {
      await chmod(entryPath, 0o444);
    }
  }
  await chmod(directory, 0o555);
}

async function collectOutputFiles(
  root: string,
  maxFiles: number,
  maxBytes: number
): Promise<{ files: SandboxOutputFile[]; exceeded: boolean }> {
  await makeCollectedTreeReadable(root);
  const files: SandboxOutputFile[] = [];
  let totalBytes = 0;
  let exceeded = false;

  async function visit(directory: string, prefix: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fullPath = path.join(directory, entry.name);
      const metadata = await lstat(fullPath);
      if (metadata.isSymbolicLink()) continue;
      if (metadata.isDirectory()) {
        await visit(fullPath, relativePath);
        continue;
      }
      if (!metadata.isFile()) continue;
      if (files.length >= maxFiles || totalBytes + metadata.size > maxBytes) {
        exceeded = true;
        continue;
      }
      const data = await readFile(fullPath);
      totalBytes += data.byteLength;
      files.push({ path: relativePath, size: data.byteLength, data });
    }
  }

  await visit(root, "");
  return { files, exceeded };
}

async function makeCollectedTreeReadable(directory: string): Promise<void> {
  await chmod(directory, 0o700);
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    const metadata = await lstat(entryPath);
    if (metadata.isSymbolicLink()) continue;
    if (metadata.isDirectory()) {
      await makeCollectedTreeReadable(entryPath);
    } else if (metadata.isFile()) {
      await chmod(entryPath, 0o400);
    }
  }
}

function startAttachedContainer(
  docker: string,
  containerId: string,
  byteLimit: number
): AttachedProcess {
  // child_process 只启动 Docker CLI；用户代码始终由 runsc 容器执行。
  const child = spawn(docker, ["start", "--attach", containerId], {
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end();
  const attached: AttachedProcess = {
    child,
    stdout: [],
    stderr: [],
    totalBytes: 0,
    limitExceeded: false,
    completion: Promise.resolve({ code: null, signal: null }),
  };

  const collect = (target: Buffer[], chunk: Buffer) => {
    const remaining = Math.max(0, byteLimit - attached.totalBytes);
    if (remaining > 0) {
      target.push(Buffer.from(chunk.subarray(0, remaining)));
      attached.totalBytes += Math.min(chunk.byteLength, remaining);
    }
    if (chunk.byteLength > remaining) {
      attached.limitExceeded = true;
      child.stdout.pause();
      child.stderr.pause();
    }
  };
  child.stdout.on("data", (chunk: Buffer) => collect(attached.stdout, chunk));
  child.stderr.on("data", (chunk: Buffer) => collect(attached.stderr, chunk));
  attached.completion = new Promise((resolve) => {
    child.once("error", () => resolve({ code: null, signal: null }));
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  return attached;
}

async function readContainerExitCode(
  docker: string,
  containerId: string,
  workspaceRoot: string
): Promise<number | null> {
  const statusDir = path.join(workspaceRoot, "status");
  await mkdir(statusDir, { recursive: true, mode: 0o700 });
  const result = await runCommand(
    docker,
    ["cp", `${containerId}:/linhub-status/exit-code`, statusDir],
    2_000,
    32 * 1024
  ).catch(() => null);
  if (!result || result.code !== 0) return null;
  const raw = await readFile(path.join(statusDir, "exit-code"), "utf8").catch(
    () => ""
  );
  const value = Number(raw.trim());
  return Number.isInteger(value) && value >= 0 && value <= 255 ? value : null;
}

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCommand(
  command: string,
  args: readonly string[],
  timeoutMs: number,
  outputLimit: number
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let settled = false;

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        reject(new Error(`命令超时：${command}`));
      }
    }, timeoutMs);

    const collect = (target: Buffer[], chunk: Buffer) => {
      const remaining = Math.max(0, outputLimit - bytes);
      if (remaining > 0) target.push(Buffer.from(chunk.subarray(0, remaining)));
      bytes += chunk.byteLength;
      if (bytes > outputLimit) child.kill("SIGKILL");
    };
    child.stdout.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk));
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (bytes > outputLimit) {
        reject(new Error(`命令输出超过限制：${command}`));
        return;
      }
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

function validateOptions(options: RunCodeSandboxOptions): void {
  if (!(options.language in MAIN_FILES)) throw new Error("不支持的沙盒语言");
  if (typeof options.code !== "string" || options.code.length === 0) {
    throw new Error("沙盒代码不能为空");
  }
  if (Buffer.byteLength(options.code, "utf8") > 1024 * 1024) {
    throw new Error("沙盒代码不能超过 1 MiB");
  }
  if ((options.args?.length ?? 0) > 128) throw new Error("沙盒参数过多");
  for (const argument of options.args ?? []) {
    if (typeof argument !== "string" || argument.includes("\0")) {
      throw new Error("沙盒参数格式不正确");
    }
  }
  if ((options.inputFiles?.length ?? 0) > 256) throw new Error("输入文件过多");
  for (const [key, value] of Object.entries(options.env ?? {})) {
    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key) ||
      RESERVED_ENV_KEYS.has(key) ||
      value.includes("\0")
    ) {
      throw new Error(`沙盒环境变量格式不正确：${key}`);
    }
  }
}

function normalizeLimits(limits: CodeSandboxLimits = {}): NormalizedLimits {
  const maximums = {
    timeoutMs: envInteger("LINHUB_SANDBOX_MAX_TIMEOUT_MS", 300_000, 1_000, 3_600_000),
    memoryMb: envInteger("LINHUB_SANDBOX_MAX_MEMORY_MB", 1_024, 64, 16_384),
    cpus: envNumber("LINHUB_SANDBOX_MAX_CPUS", 4, 0.1, 64),
    pids: envInteger("LINHUB_SANDBOX_MAX_PIDS", 256, 8, 4_096),
    stdoutStderrBytes: envInteger(
      "LINHUB_SANDBOX_MAX_STDIO_BYTES",
      4 * 1024 * 1024,
      1_024,
      256 * 1024 * 1024
    ),
    outputBytes: envInteger(
      "LINHUB_SANDBOX_MAX_OUTPUT_BYTES",
      64 * 1024 * 1024,
      1_024,
      1024 * 1024 * 1024
    ),
    outputFiles: envInteger("LINHUB_SANDBOX_MAX_OUTPUT_FILES", 1_000, 1, 100_000),
    inputBytes: envInteger(
      "LINHUB_SANDBOX_MAX_INPUT_BYTES",
      64 * 1024 * 1024,
      1_024,
      1024 * 1024 * 1024
    ),
  };
  return {
    timeoutMs: bounded(limits.timeoutMs ?? 30_000, 100, maximums.timeoutMs),
    memoryMb: bounded(limits.memoryMb ?? 256, 32, maximums.memoryMb),
    cpus: bounded(limits.cpus ?? 1, 0.1, maximums.cpus),
    pids: Math.round(bounded(limits.pids ?? 64, 8, maximums.pids)),
    stdoutStderrBytes: Math.round(
      bounded(limits.stdoutStderrBytes ?? 1024 * 1024, 1_024, maximums.stdoutStderrBytes)
    ),
    outputBytes: Math.round(
      bounded(limits.outputBytes ?? 16 * 1024 * 1024, 1_024, maximums.outputBytes)
    ),
    outputFiles: Math.round(bounded(limits.outputFiles ?? 100, 1, maximums.outputFiles)),
    inputBytes: Math.round(
      bounded(limits.inputBytes ?? 16 * 1024 * 1024, 1_024, maximums.inputBytes)
    ),
  };
}

function configuredImage(language: SandboxLanguage): string {
  const image = process.env[IMAGE_ENV[language]]?.trim() || DEFAULT_IMAGES[language];
  if (!/^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,511}$/u.test(image)) {
    throw new Error("沙盒镜像配置不正确");
  }
  // Docker 原生接受 name@sha256:...，因此可通过环境变量固定 digest。
  return image;
}

function dockerBinary(): string {
  const value = process.env.LINHUB_SANDBOX_DOCKER_BINARY?.trim() || "docker";
  if (value.includes("\0")) throw new Error("Docker 命令配置不正确");
  return value;
}

function safeRelativePath(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 512 ||
    value.includes("\0") ||
    value.includes(",") ||
    value.includes("\n") ||
    value.includes("\\") ||
    path.posix.isAbsolute(value)
  ) {
    throw new Error("输入文件路径不正确");
  }
  const normalized = path.posix.normalize(value);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error("输入文件路径越权");
  }
  return normalized;
}

function dockerMount(source: string, destination: string, readOnly: boolean): string {
  assertDockerMountSource(source);
  return `type=bind,src=${source},dst=${destination}${readOnly ? ",readonly" : ""}`;
}

function assertDockerMountSource(source: string): void {
  if (source.includes(",") || source.includes("\0") || source.includes("\n")) {
    throw new Error("Docker 挂载源路径包含不支持的字符");
  }
}

function assertInputSize(actual: number, maximum: number): void {
  if (actual > maximum) throw new Error("输入文件总大小超过限制");
}

function bounded(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(Math.max(value, minimum), maximum);
}

function envInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) ? bounded(value, minimum, maximum) : fallback;
}

function envNumber(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? bounded(value, minimum, maximum) : fallback;
}

function bufferText(chunks: Buffer[]): string {
  return Buffer.concat(chunks).toString("utf8");
}

function cleanDockerError(value: string): string {
  return value.trim().slice(0, 2_000) || "未知 Docker 错误";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function settledValue<T>(promise: Promise<T>): Promise<T | undefined> {
  const pending = Symbol("pending");
  const result = await Promise.race([promise, Promise.resolve(pending)]);
  return result === pending ? undefined : result;
}
