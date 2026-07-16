import "server-only";

import { spawn } from "node:child_process";
import {
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { db, schema } from "@/lib/server/db";

type SkillPackage = Pick<
  typeof schema.skills.$inferSelect,
  "id" | "name" | "packagePath"
>;

export interface DashiGoalSpec {
  title: string;
  goal: string;
  audience: string;
  owner?: string;
  randomSeed: string;
  pageCount?: number;
  themePack: string;
  language?: "zh" | "en";
  slides: { layout: string; props: Record<string, unknown> }[];
}

const DATA_SKILLS_ROOT = path.resolve(process.cwd(), "data", "skills");
const DATA_JOBS_ROOT = path.resolve(process.cwd(), "data", "dashi-jobs");
const DATA_UPLOADS_ROOT = path.resolve(process.cwd(), "data", "uploads");
const COMMAND_OUTPUT_LIMIT = 48_000;
const QUERY_TIMEOUT_MS = 30_000;
const RENDER_TIMEOUT_MS = 300_000;
const DASHI_THEMES = new Set(Array.from({ length: 12 }, (_, i) => `theme${String(i + 1).padStart(2, "0")}`));

let activeRenderJobs = 0;

export async function queryDashiLayouts(
  skill: SkillPackage,
  input: {
    theme: string;
    role: string;
    limit?: number;
    needsMedia?: boolean;
  }
) {
  assertTheme(input.theme);
  const projectRoot = await resolveDashiProject(skill);
  const args = [
    path.join(projectRoot, "scripts", "layout-query.mjs"),
    "--theme",
    input.theme,
    "--role",
    input.role,
    "--limit",
    String(Math.min(Math.max(input.limit ?? 8, 1), 12)),
  ];
  if (input.needsMedia) args.push("--needs-media");
  const result = await runCommand(process.execPath, args, {
    cwd: projectRoot,
    timeoutMs: QUERY_TIMEOUT_MS,
  });
  return parseJsonOutput(result.stdout, "版式查询");
}

export async function inspectDashiLayouts(skill: SkillPackage, layouts: string[]) {
  const projectRoot = await resolveDashiProject(skill);
  const safeLayouts = Array.from(new Set(layouts)).slice(0, 12);
  if (safeLayouts.length === 0) throw new Error("请至少提供一个版式 id");
  if (safeLayouts.some((layout) => !/^theme\d{2}_page\d{3}$/u.test(layout))) {
    throw new Error("版式 id 格式不正确");
  }
  const result = await runCommand(
    process.execPath,
    [path.join(projectRoot, "scripts", "inspect-layout.mjs"), "--compact", ...safeLayouts],
    { cwd: projectRoot, timeoutMs: QUERY_TIMEOUT_MS }
  );
  return parseJsonOutput(result.stdout, "版式检查");
}

export async function renderDashiDeck(
  skill: SkillPackage,
  userId: string,
  goal: DashiGoalSpec,
  format: "pptx" | "html",
  signal?: AbortSignal
) {
  if (activeRenderJobs >= 1) {
    throw new Error("当前已有 Dashi PPT 生成任务，请等待任务完成后重试");
  }
  validateGoal(goal);
  activeRenderJobs += 1;
  const jobId = `dashi-${uid()}`;
  const jobRoot = path.join(DATA_JOBS_ROOT, safePathPart(userId), jobId);
  const deckRoot = path.join(jobRoot, "deck");
  const deckDir = path.join(deckRoot, "ppt");
  const goalPath = path.join(deckRoot, "goal.json");
  const htmlPath = path.join(deckDir, "index.html");

  try {
    const projectRoot = await resolveDashiProject(skill);
    await mkdir(deckDir, { recursive: true });
    await writeFile(goalPath, `${JSON.stringify(goal, null, 2)}\n`, "utf-8");

    await runNodeScript(
      projectRoot,
      "write-safe-props.mjs",
      ["--goal", goalPath, "--write"],
      RENDER_TIMEOUT_MS,
      signal
    );
    await runNodeScript(projectRoot, "validate-goal-spec.mjs", [goalPath], RENDER_TIMEOUT_MS, signal);
    await runTsxScript(projectRoot, "render-goal-deck.jsx", [goalPath, htmlPath], signal);
    await runNodeScript(projectRoot, "validate-swiss-deck.mjs", [htmlPath], RENDER_TIMEOUT_MS, signal);
    await runNodeScript(projectRoot, "validate-goal-copy.mjs", [goalPath, htmlPath], RENDER_TIMEOUT_MS, signal);

    if (format === "html") {
      const archive = await zipDirectory(deckRoot);
      const attachment = await persistGeneratedAttachment({
        ownerId: userId,
        title: goal.title,
        suffix: "dashi-html.zip",
        mimeType: "application/zip",
        bytes: archive,
      });
      return {
        text: `已生成 Dashi PPT「${attachment.name}」，共 ${goal.slides.length} 页；下载并解压后打开 ppt/index.html，可在浏览器中离线编辑。`,
        attachments: [attachment],
      };
    }

    const pptxPath = path.join(deckRoot, `${safeTitle(goal.title)}.pptx`);
    await runNodeScript(
      projectRoot,
      "export-pptx.mjs",
      [deckDir, pptxPath, "--title", goal.title],
      RENDER_TIMEOUT_MS,
      signal
    );
    const attachment = await persistGeneratedAttachment({
      ownerId: userId,
      title: goal.title,
      suffix: "dashi.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      bytes: await readFile(pptxPath),
    });
    return {
      text: `已生成 Dashi PPT「${attachment.name}」，共 ${goal.slides.length} 页，可下载并继续编辑。`,
      attachments: [attachment],
    };
  } finally {
    activeRenderJobs -= 1;
    await rm(jobRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function resolveDashiProject(skill: SkillPackage) {
  if (skill.id !== "skill-dashi-ppt") throw new Error("当前技能不是 Dashi PPT");
  if (!skill.packagePath) throw new Error("Dashi PPT 技能包尚未安装");
  const [skillsRoot, packageRoot] = await Promise.all([
    realpath(DATA_SKILLS_ROOT),
    realpath(path.resolve(skill.packagePath)),
  ]);
  if (!packageRoot.startsWith(`${skillsRoot}${path.sep}`)) {
    throw new Error("技能包路径不在受信任目录中");
  }
  const projectRoot = await realpath(path.join(packageRoot, "project"));
  if (!projectRoot.startsWith(`${packageRoot}${path.sep}`)) {
    throw new Error("Dashi PPT project 路径越权");
  }
  const packageJson = path.join(projectRoot, "package.json");
  const packageStat = await stat(packageJson).catch(() => null);
  if (!packageStat?.isFile()) throw new Error("Dashi PPT 运行时文件不完整");
  return projectRoot;
}

async function runNodeScript(
  projectRoot: string,
  script: string,
  args: string[],
  timeoutMs = RENDER_TIMEOUT_MS,
  signal?: AbortSignal
) {
  return runCommand(
    process.execPath,
    [path.join(projectRoot, "scripts", script), ...args],
    { cwd: projectRoot, timeoutMs, signal }
  );
}

async function runTsxScript(
  projectRoot: string,
  script: string,
  args: string[],
  signal?: AbortSignal
) {
  const cli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
  return runCommand(
    process.execPath,
    [cli, path.join(projectRoot, "scripts", script), ...args],
    { cwd: projectRoot, timeoutMs: RENDER_TIMEOUT_MS, signal }
  );
}

function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number; signal?: AbortSignal }
) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new Error("Dashi PPT 任务已停止"));
      return;
    }
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
        HOME: process.env.HOME ?? "/home/ubuntu",
        TMPDIR: process.env.TMPDIR ?? "/tmp",
        NODE_ENV: "production",
        NO_UPDATE_NOTIFIER: "1",
        INIT_CWD: options.cwd,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        finish();
        reject(new Error("Dashi PPT 任务已停止"));
      }
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        finish();
        reject(new Error("Dashi PPT 生成超时，任务已终止"));
      }
    }, options.timeoutMs);
    options.signal?.addEventListener("abort", onAbort, { once: true });

    const collect = (chunk: Buffer, target: "stdout" | "stderr") => {
      const next = (target === "stdout" ? stdout : stderr) + chunk.toString("utf-8");
      if (next.length > COMMAND_OUTPUT_LIMIT) {
        child.kill("SIGKILL");
        if (!settled) {
          settled = true;
          finish();
          reject(new Error("Dashi PPT 运行日志过大，任务已终止"));
        }
        return;
      }
      if (target === "stdout") stdout = next;
      else stderr = next;
    };
    child.stdout.on("data", (chunk: Buffer) => collect(chunk, "stdout"));
    child.stderr.on("data", (chunk: Buffer) => collect(chunk, "stderr"));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      finish();
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      finish();
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(scrubRuntimeError(stderr || stdout || `退出码 ${code}`)));
    });
  });
}

function parseJsonOutput(output: string, label: string) {
  try {
    return JSON.parse(output) as unknown;
  } catch {
    throw new Error(`${label}返回了无效数据`);
  }
}

function validateGoal(goal: DashiGoalSpec) {
  assertTheme(goal.themePack);
  if (!goal.title.trim() || !goal.goal.trim() || !goal.audience.trim()) {
    throw new Error("标题、目标和受众不能为空");
  }
  if (goal.slides.length < 1 || goal.slides.length > 30) {
    throw new Error("Dashi PPT 页数必须在 1 到 30 页之间");
  }
  if (goal.slides.some((slide) => !/^theme\d{2}_page\d{3}$/u.test(slide.layout))) {
    throw new Error("存在无效的 Dashi PPT 版式 id");
  }
  if (new Set(goal.slides.map((slide) => slide.layout)).size !== goal.slides.length) {
    throw new Error("同一份 Dashi PPT 不能重复使用相同版式");
  }
}

function assertTheme(theme: string) {
  if (!DASHI_THEMES.has(theme)) throw new Error("Dashi PPT 主题不存在");
}

async function zipDirectory(root: string) {
  const zip = new JSZip();
  async function addDirectory(current: string, prefix = "") {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await addDirectory(absolute, relative);
      else if (entry.isFile()) zip.file(relative, await readFile(absolute));
    }
  }
  await addDirectory(root);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function persistGeneratedAttachment(input: {
  ownerId: string;
  title: string;
  suffix: string;
  mimeType: string;
  bytes: Buffer;
}) {
  await mkdir(DATA_UPLOADS_ROOT, { recursive: true });
  const id = `att-${uid()}`;
  const filename = `${id}-${safeTitle(input.title)}-${input.suffix}`;
  await writeFile(path.join(DATA_UPLOADS_ROOT, filename), input.bytes);
  const name = `${safeTitle(input.title)}-${input.suffix}`;
  await db.insert(schema.attachments).values({
    id,
    ownerId: input.ownerId,
    name,
    mimeType: input.mimeType,
    size: input.bytes.length,
    storagePath: `data/uploads/${filename}`,
    extractedText: input.title,
  });
  return {
    id,
    name,
    mimeType: input.mimeType,
    size: input.bytes.length,
    url: `/api/attachments/${id}`,
  };
}

function safeTitle(value: string) {
  return (
    value
      .replace(/[\\/:*?"<>|]+/gu, " ")
      .replace(/\s+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 48) || "dashi-presentation"
  );
}

function safePathPart(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/gu, "_").slice(0, 80) || "user";
}

function scrubRuntimeError(value: string) {
  return value
    .replaceAll(process.cwd(), "<linhub>")
    .replaceAll(DATA_SKILLS_ROOT, "<skills>")
    .replaceAll(DATA_JOBS_ROOT, "<jobs>")
    .slice(0, 4_000);
}

function uid() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
