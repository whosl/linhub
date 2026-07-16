import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ALLOWED_FRONTMATTER_FIELDS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);
const RESOURCE_DIRECTORIES = ["scripts", "references", "assets", "agents"] as const;
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-zA-Z]:[\\/]/;

export const AGENT_SKILL_LIMITS = {
  name: 64,
  description: 1_024,
  compatibility: 500,
} as const;

export type AgentSkillResourceDirectory = (typeof RESOURCE_DIRECTORIES)[number];

export interface AgentSkillFrontmatter {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata: Record<string, string>;
  /** 由 Agent Skills 规范中的空格分隔字符串规范化而来。 */
  allowedTools: string[];
  allowedToolsRaw?: string;
}

export interface ParsedAgentSkill {
  frontmatter: AgentSkillFrontmatter;
  body: string;
}

export interface AgentSkillFileLists {
  scripts: string[];
  references: string[];
  assets: string[];
  agents: string[];
}

export type AgentSkillFileKind = "script" | "reference" | "asset" | "agent";

export interface AgentSkillPackageFile {
  /** 相对 package 根目录的 POSIX 路径。 */
  path: string;
  kind: AgentSkillFileKind;
  size: number;
  mimeType: string;
}

export interface AgentSkillPackage extends ParsedAgentSkill {
  /** root / instructions / linhubManifest 是导入与注册层使用的语义化名称。 */
  root: string;
  rootPath: string;
  skillPath: string;
  instructions: string;
  digest: string;
  linhubPath?: string;
  linhub?: Record<string, unknown>;
  linhubManifest?: Record<string, unknown>;
  files: AgentSkillPackageFile[];
  fileGroups: AgentSkillFileLists;
}

export interface AgentSkillScanError {
  path: string;
  messages: string[];
}

export interface AgentSkillScanResult {
  packages: AgentSkillPackage[];
  errors: AgentSkillScanError[];
}

export class AgentSkillSpecError extends Error {
  readonly sourcePath?: string;
  readonly messages: string[];

  constructor(messages: string | string[], sourcePath?: string) {
    const normalized = Array.isArray(messages) ? messages : [messages];
    super(normalized.join("；"));
    this.name = "AgentSkillSpecError";
    this.sourcePath = sourcePath;
    this.messages = normalized;
  }
}

type ParsedYamlValue = string | Record<string, string>;

/**
 * 解析并校验一个 SKILL.md 字符串。
 *
 * 不引入 YAML 依赖，仅接受 Agent Skills frontmatter 所需的安全子集：
 * 顶层标量、metadata 的一层字符串映射，以及 | / > 块标量。
 */
export function parseAgentSkillMarkdown(
  source: string,
  directoryName?: string
): ParsedAgentSkill {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  if (lines[0] !== "---") {
    throw new AgentSkillSpecError("SKILL.md 必须以 YAML frontmatter（---）开头");
  }

  const closingLine = lines.findIndex((line, index) => index > 0 && line === "---");
  if (closingLine < 0) {
    throw new AgentSkillSpecError("SKILL.md frontmatter 缺少结束标记（---）");
  }

  const raw = parseFrontmatterLines(lines.slice(1, closingLine));
  const frontmatter = validateAgentSkillFrontmatter(raw, directoryName);
  return {
    frontmatter,
    body: lines.slice(closingLine + 1).join("\n").trim(),
  };
}

/** 校验已解析的 frontmatter，并返回规范化字段。 */
export function validateAgentSkillFrontmatter(
  input: Record<string, unknown>,
  directoryName?: string
): AgentSkillFrontmatter {
  const errors: string[] = [];
  const unknownFields = Object.keys(input)
    .filter((field) => !ALLOWED_FRONTMATTER_FIELDS.has(field))
    .sort();
  if (unknownFields.length > 0) {
    errors.push(`frontmatter 包含未知字段：${unknownFields.join("、")}`);
  }

  const name = readRequiredString(input, "name", errors);
  const description = readRequiredString(input, "description", errors);
  const license = readOptionalString(input, "license", errors);
  const compatibility = readOptionalString(input, "compatibility", errors);
  const allowedTools = readOptionalString(input, "allowed-tools", errors);

  if (name) {
    const length = characterLength(name);
    if (length > AGENT_SKILL_LIMITS.name) {
      errors.push(`name 最长为 ${AGENT_SKILL_LIMITS.name} 个字符，当前为 ${length} 个`);
    }
    if (!NAME_PATTERN.test(name)) {
      errors.push("name 只能包含小写英文字母、数字和单个连字符，且不能以连字符开头或结尾");
    }
    if (directoryName !== undefined && name !== directoryName) {
      errors.push(`name「${name}」必须与目录名「${directoryName}」一致`);
    }
  }

  if (description) {
    const length = characterLength(description);
    if (length > AGENT_SKILL_LIMITS.description) {
      errors.push(
        `description 最长为 ${AGENT_SKILL_LIMITS.description} 个字符，当前为 ${length} 个`
      );
    }
  }

  if (compatibility) {
    const length = characterLength(compatibility);
    if (length > AGENT_SKILL_LIMITS.compatibility) {
      errors.push(
        `compatibility 最长为 ${AGENT_SKILL_LIMITS.compatibility} 个字符，当前为 ${length} 个`
      );
    }
  }

  if (allowedTools && /[\r\n\t]/.test(allowedTools)) {
    errors.push("allowed-tools 必须是由空格分隔的单行字符串");
  }

  let metadata: Record<string, string> | undefined;
  if (Object.hasOwn(input, "metadata")) {
    const candidate = input.metadata;
    if (!isPlainObject(candidate)) {
      errors.push("metadata 必须是字符串键到字符串值的映射");
    } else {
      metadata = {};
      for (const [key, value] of Object.entries(candidate)) {
        if (!key.trim()) {
          errors.push("metadata 的键不能为空");
        } else if (typeof value !== "string") {
          errors.push(`metadata.${key} 必须是字符串`);
        } else {
          metadata[key] = value;
        }
      }
    }
  }

  if (errors.length > 0 || !name || !description) {
    throw new AgentSkillSpecError(errors);
  }

  return {
    name,
    description,
    ...(license === undefined ? {} : { license }),
    ...(compatibility === undefined ? {} : { compatibility }),
    metadata: metadata ?? {},
    allowedTools: allowedTools?.split(/ +/u).filter(Boolean) ?? [],
    ...(allowedTools === undefined ? {} : { allowedToolsRaw: allowedTools }),
  };
}

/** 加载并安全校验一个 Agent Skill package 目录。 */
export async function loadAgentSkillPackage(packageDirectory: string): Promise<AgentSkillPackage> {
  rejectTraversalInput(packageDirectory, "技能包路径");
  const rootPath = path.resolve(packageDirectory);
  await assertRealDirectory(rootPath, "技能包目录");

  const skillPath = path.join(rootPath, "SKILL.md");
  await assertRegularFile(skillPath, rootPath, "SKILL.md");

  let parsed: ParsedAgentSkill;
  try {
    parsed = parseAgentSkillMarkdown(
      await readFile(skillPath, "utf8"),
      path.basename(rootPath)
    );
  } catch (error) {
    throw withSourcePath(error, skillPath);
  }

  const files: AgentSkillPackageFile[] = [];
  const digestFiles: InspectedFile[] = [];
  await inspectPackageTree(rootPath, rootPath, files, digestFiles);
  files.sort((left, right) => left.path.localeCompare(right.path));
  const fileGroups = groupPackageFiles(files);
  const digest = await digestPackageFiles(digestFiles);

  const preferredLinhubPath = path.join(rootPath, "agents", "linhub.yaml");
  const legacyLinhubPath = path.join(rootPath, "linhub.yaml");
  let linhubPath = preferredLinhubPath;
  let linhub: Record<string, unknown> | undefined;
  try {
    let stats = await lstat(preferredLinhubPath).catch((error: unknown) => {
      if (isMissingFileError(error)) return null;
      throw error;
    });
    if (!stats) {
      linhubPath = legacyLinhubPath;
      stats = await lstat(legacyLinhubPath);
    }
    if (stats.isSymbolicLink()) {
      throw new AgentSkillSpecError("linhub.yaml 不能是符号链接", linhubPath);
    }
    if (!stats.isFile()) {
      throw new AgentSkillSpecError("linhub.yaml 必须是普通文件", linhubPath);
    }
    linhub = parseLinhubManifest(await readFile(linhubPath, "utf8"), linhubPath);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }

  return {
    ...parsed,
    root: rootPath,
    rootPath,
    skillPath,
    instructions: parsed.body,
    digest,
    ...(linhub === undefined
      ? {}
      : { linhubPath, linhub, linhubManifest: linhub }),
    files,
    fileGroups,
  };
}

/**
 * 从根目录递归发现所有大小写精确匹配的 SKILL.md。
 * 单个包失败时继续扫描，并将错误汇总到 errors。
 */
export async function scanAgentSkillsRoot(rootDirectory: string): Promise<AgentSkillScanResult> {
  const result: AgentSkillScanResult = { packages: [], errors: [] };
  try {
    rejectTraversalInput(rootDirectory, "扫描根目录");
    const rootPath = path.resolve(rootDirectory);
    await assertRealDirectory(rootPath, "扫描根目录");
    const skillDirectories: string[] = [];
    await discoverSkillDirectories(rootPath, rootPath, skillDirectories, result.errors);

    for (const directory of skillDirectories.sort()) {
      try {
        result.packages.push(await loadAgentSkillPackage(directory));
      } catch (error) {
        result.errors.push(toScanError(error, directory));
      }
    }
  } catch (error) {
    result.errors.push(toScanError(error, path.resolve(rootDirectory)));
  }

  result.packages.sort((left, right) => left.rootPath.localeCompare(right.rootPath));
  return deduplicateScanErrors(result);
}

/** 扫描并加载全部 package；任一 package 无效时以聚合错误拒绝。 */
export async function scanAgentSkillPackages(rootDirectory: string): Promise<AgentSkillPackage[]> {
  const result = await scanAgentSkillsRoot(rootDirectory);
  if (result.errors.length > 0) {
    throw new AgentSkillSpecError(
      result.errors.flatMap((error) =>
        error.messages.map((message) => `${error.path}：${message}`)
      ),
      path.resolve(rootDirectory)
    );
  }
  return result.packages;
}

function parseFrontmatterLines(lines: string[]): Record<string, unknown> {
  const result: Record<string, ParsedYamlValue> = {};
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) {
      index += 1;
      continue;
    }
    if (/^\s/.test(line)) {
      throw new AgentSkillSpecError(`frontmatter 第 ${index + 2} 行出现意外缩进`);
    }

    const pair = splitYamlPair(line, index + 2);
    if (Object.hasOwn(result, pair.key)) {
      throw new AgentSkillSpecError(`frontmatter 字段「${pair.key}」重复`);
    }

    if (pair.value === "" && pair.key === "metadata") {
      const nested = parseMetadataBlock(lines, index + 1);
      result[pair.key] = nested.value;
      index = nested.nextIndex;
      continue;
    }
    if (pair.value === "") {
      throw new AgentSkillSpecError(`frontmatter 字段「${pair.key}」缺少值`);
    }

    const blockMatch = pair.value.match(/^([|>])([+-])?$/);
    if (blockMatch) {
      const block = parseBlockScalar(lines, index + 1, blockMatch[1] as "|" | ">", blockMatch[2]);
      result[pair.key] = block.value;
      index = block.nextIndex;
      continue;
    }

    result[pair.key] = parseYamlString(pair.value, index + 2);
    index += 1;
  }

  return result;
}

function parseMetadataBlock(
  lines: string[],
  startIndex: number
): { value: Record<string, string>; nextIndex: number } {
  const metadata: Record<string, string> = {};
  let index = startIndex;
  let indentation: number | undefined;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) {
      index += 1;
      continue;
    }
    const currentIndentation = leadingSpaces(line, index + 2);
    if (currentIndentation === 0) break;
    indentation ??= currentIndentation;
    if (currentIndentation !== indentation) {
      throw new AgentSkillSpecError(`metadata 第 ${index + 2} 行缩进不一致`);
    }

    const pair = splitYamlPair(line.slice(currentIndentation), index + 2);
    if (!pair.value) {
      throw new AgentSkillSpecError(`metadata.${pair.key} 必须是字符串`);
    }
    if (Object.hasOwn(metadata, pair.key)) {
      throw new AgentSkillSpecError(`metadata 字段「${pair.key}」重复`);
    }
    metadata[pair.key] = parseYamlString(pair.value, index + 2);
    index += 1;
  }

  if (indentation === undefined) {
    throw new AgentSkillSpecError("metadata 必须包含至少一个字符串键值");
  }
  return { value: metadata, nextIndex: index };
}

function parseBlockScalar(
  lines: string[],
  startIndex: number,
  style: "|" | ">",
  chomping?: string
): { value: string; nextIndex: number } {
  const content: string[] = [];
  let index = startIndex;
  let indentation: number | undefined;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      content.push("");
      index += 1;
      continue;
    }
    const currentIndentation = leadingSpaces(line, index + 2);
    if (currentIndentation === 0) break;
    indentation ??= currentIndentation;
    if (currentIndentation < indentation) break;
    content.push(line.slice(indentation));
    index += 1;
  }

  if (indentation === undefined) {
    throw new AgentSkillSpecError(`frontmatter 第 ${startIndex + 1} 行的块标量没有内容`);
  }

  let value = style === "|" ? content.join("\n") : foldYamlLines(content);
  if (chomping === "+") value += "\n";
  else if (chomping !== "-") value += "\n";
  return { value, nextIndex: index };
}

function foldYamlLines(lines: string[]): string {
  let output = "";
  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index];
    const next = lines[index + 1];
    output += current;
    if (next !== undefined) output += current === "" || next === "" ? "\n" : " ";
  }
  return output;
}

function splitYamlPair(line: string, lineNumber: number): { key: string; value: string } {
  if (line.includes("\t")) {
    throw new AgentSkillSpecError(`frontmatter 第 ${lineNumber} 行不能使用制表符缩进`);
  }
  const separator = line.indexOf(":");
  if (separator <= 0) {
    throw new AgentSkillSpecError(`frontmatter 第 ${lineNumber} 行不是有效的 key: value`);
  }
  const key = line.slice(0, separator).trim();
  if (!/^[A-Za-z0-9_-]+$/.test(key)) {
    throw new AgentSkillSpecError(`frontmatter 第 ${lineNumber} 行的键无效`);
  }
  return {
    key,
    value: stripYamlComment(line.slice(separator + 1).trim()),
  };
}

function parseYamlString(value: string, lineNumber: number): string {
  if (value.startsWith("[") || value.startsWith("{") || value.startsWith("&") || value.startsWith("*")) {
    throw new AgentSkillSpecError(`frontmatter 第 ${lineNumber} 行使用了不支持的复杂 YAML 值`);
  }
  if (value.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed !== "string") throw new Error("not a string");
      return parsed;
    } catch {
      throw new AgentSkillSpecError(`frontmatter 第 ${lineNumber} 行的双引号字符串无效`);
    }
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2) {
      throw new AgentSkillSpecError(`frontmatter 第 ${lineNumber} 行的单引号字符串无效`);
    }
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.endsWith('"') || value.endsWith("'")) {
    throw new AgentSkillSpecError(`frontmatter 第 ${lineNumber} 行的引号不匹配`);
  }
  return value;
}

function stripYamlComment(value: string): string {
  let singleQuoted = false;
  let doubleQuoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "'" && !doubleQuoted) singleQuoted = !singleQuoted;
    if (char === '"' && !singleQuoted && value[index - 1] !== "\\") doubleQuoted = !doubleQuoted;
    if (char === "#" && !singleQuoted && !doubleQuoted && /\s/.test(value[index - 1] ?? "")) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value;
}

function readRequiredString(
  input: Record<string, unknown>,
  field: string,
  errors: string[]
): string | undefined {
  if (!Object.hasOwn(input, field)) {
    errors.push(`frontmatter 缺少必填字段：${field}`);
    return undefined;
  }
  return readString(input[field], field, errors);
}

function readOptionalString(
  input: Record<string, unknown>,
  field: string,
  errors: string[]
): string | undefined {
  if (!Object.hasOwn(input, field)) return undefined;
  return readString(input[field], field, errors);
}

function readString(value: unknown, field: string, errors: string[]): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${field} 必须是非空字符串`);
    return undefined;
  }
  return value.trim();
}

function characterLength(value: string): number {
  return Array.from(value).length;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface InspectedFile {
  absolutePath: string;
  relativePath: string;
}

async function inspectPackageTree(
  rootPath: string,
  directory: string,
  files: AgentSkillPackageFile[],
  digestFiles: InspectedFile[]
): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    assertInsideRoot(rootPath, absolutePath);
    const stats = await lstat(absolutePath);
    if (stats.isSymbolicLink()) {
      throw new AgentSkillSpecError("技能包内禁止使用符号链接", absolutePath);
    }
    if (stats.isDirectory()) {
      await inspectPackageTree(rootPath, absolutePath, files, digestFiles);
      continue;
    }
    if (!stats.isFile()) {
      throw new AgentSkillSpecError("技能包内只允许普通文件和目录", absolutePath);
    }

    const relativePath = toPosixPath(path.relative(rootPath, absolutePath));
    digestFiles.push({ absolutePath, relativePath });
    const category = RESOURCE_DIRECTORIES.find(
      (candidate) => relativePath === candidate || relativePath.startsWith(`${candidate}/`)
    );
    if (category) {
      files.push({
        path: relativePath,
        kind: resourceKind(category),
        size: stats.size,
        mimeType: inferMimeType(relativePath),
      });
    }
  }
}

function groupPackageFiles(files: AgentSkillPackageFile[]): AgentSkillFileLists {
  const groups: AgentSkillFileLists = { scripts: [], references: [], assets: [], agents: [] };
  for (const file of files) {
    if (file.kind === "script") groups.scripts.push(file.path);
    else if (file.kind === "reference") groups.references.push(file.path);
    else if (file.kind === "asset") groups.assets.push(file.path);
    else groups.agents.push(file.path);
  }
  return groups;
}

function resourceKind(directory: AgentSkillResourceDirectory): AgentSkillFileKind {
  if (directory === "scripts") return "script";
  if (directory === "references") return "reference";
  if (directory === "assets") return "asset";
  return "agent";
}

async function digestPackageFiles(files: InspectedFile[]): Promise<string> {
  const hash = createHash("sha256");
  for (const file of files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))) {
    hash.update(file.relativePath, "utf8");
    hash.update("\0", "utf8");
    hash.update(await readFile(file.absolutePath));
    hash.update("\0", "utf8");
  }
  return hash.digest("hex");
}

function inferMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  const known: Record<string, string> = {
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".json": "application/json",
    ".yaml": "application/yaml",
    ".yml": "application/yaml",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".cjs": "text/javascript",
    ".ts": "text/typescript",
    ".tsx": "text/typescript",
    ".py": "text/x-python",
    ".sh": "text/x-shellscript",
    ".html": "text/html",
    ".css": "text/css",
    ".csv": "text/csv",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
  };
  return known[extension] ?? "application/octet-stream";
}

async function discoverSkillDirectories(
  rootPath: string,
  directory: string,
  directories: string[],
  errors: AgentSkillScanError[]
): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    assertInsideRoot(rootPath, absolutePath);
    const stats = await lstat(absolutePath);
    if (stats.isSymbolicLink()) {
      errors.push({ path: absolutePath, messages: ["扫描目录内禁止使用符号链接"] });
      continue;
    }
    if (stats.isDirectory()) {
      await discoverSkillDirectories(rootPath, absolutePath, directories, errors);
    } else if (stats.isFile() && entry.name === "SKILL.md") {
      directories.push(directory);
    }
  }
}

async function assertRealDirectory(targetPath: string, label: string): Promise<void> {
  let stats;
  try {
    stats = await lstat(targetPath);
  } catch (error) {
    if (isMissingFileError(error)) {
      throw new AgentSkillSpecError(`${label}不存在`, targetPath);
    }
    throw error;
  }
  if (stats.isSymbolicLink()) {
    throw new AgentSkillSpecError(`${label}不能是符号链接`, targetPath);
  }
  if (!stats.isDirectory()) {
    throw new AgentSkillSpecError(`${label}必须是目录`, targetPath);
  }
}

async function assertRegularFile(targetPath: string, rootPath: string, label: string): Promise<void> {
  assertInsideRoot(rootPath, targetPath);
  let stats;
  try {
    stats = await lstat(targetPath);
  } catch (error) {
    if (isMissingFileError(error)) {
      throw new AgentSkillSpecError(`缺少必需文件：${label}`, targetPath);
    }
    throw error;
  }
  if (stats.isSymbolicLink()) {
    throw new AgentSkillSpecError(`${label} 不能是符号链接`, targetPath);
  }
  if (!stats.isFile()) {
    throw new AgentSkillSpecError(`${label} 必须是普通文件`, targetPath);
  }
}

function parseLinhubManifest(source: string, sourcePath: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new AgentSkillSpecError(`linhub.yaml 必须是 JSON-compatible YAML：${detail}`, sourcePath);
  }
  if (!isPlainObject(parsed)) {
    throw new AgentSkillSpecError("linhub.yaml 顶层必须是 JSON 对象", sourcePath);
  }
  validateManifestPaths(parsed, "$", sourcePath);
  return parsed;
}

function validateManifestPaths(value: unknown, location: string, sourcePath: string): void {
  if (typeof value === "string") {
    if (value.includes("\0")) {
      throw new AgentSkillSpecError(`linhub.yaml 的 ${location} 包含 NUL 字符`, sourcePath);
    }
    if (value.split(/[\\/]/).includes("..")) {
      throw new AgentSkillSpecError(`linhub.yaml 的 ${location} 包含路径穿越（..）`, sourcePath);
    }
    if (value.startsWith("/") || value.startsWith("\\") || WINDOWS_ABSOLUTE_PATH_PATTERN.test(value)) {
      throw new AgentSkillSpecError(`linhub.yaml 的 ${location} 包含绝对本地路径`, sourcePath);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateManifestPaths(item, `${location}[${index}]`, sourcePath));
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      validateManifestPaths(child, `${location}.${key}`, sourcePath);
    }
  }
}

function rejectTraversalInput(inputPath: string, label: string): void {
  if (!inputPath || inputPath.includes("\0")) {
    throw new AgentSkillSpecError(`${label}无效`, inputPath);
  }
  if (inputPath.split(/[\\/]/).includes("..")) {
    throw new AgentSkillSpecError(`${label}不能包含路径穿越（..）`, inputPath);
  }
}

function assertInsideRoot(rootPath: string, candidatePath: string): void {
  const relative = path.relative(rootPath, candidatePath);
  if (relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative))) {
    return;
  }
  throw new AgentSkillSpecError("检测到越出技能包根目录的路径", candidatePath);
}

function leadingSpaces(line: string, lineNumber: number): number {
  const indentation = line.length - line.trimStart().length;
  if (line.slice(0, indentation).includes("\t")) {
    throw new AgentSkillSpecError(`frontmatter 第 ${lineNumber} 行不能使用制表符缩进`);
  }
  return indentation;
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function withSourcePath(error: unknown, sourcePath: string): AgentSkillSpecError {
  if (error instanceof AgentSkillSpecError) {
    return new AgentSkillSpecError(error.messages, error.sourcePath ?? sourcePath);
  }
  return new AgentSkillSpecError(error instanceof Error ? error.message : String(error), sourcePath);
}

function toScanError(error: unknown, fallbackPath: string): AgentSkillScanError {
  if (error instanceof AgentSkillSpecError) {
    return { path: error.sourcePath ?? fallbackPath, messages: error.messages };
  }
  return {
    path: fallbackPath,
    messages: [error instanceof Error ? error.message : String(error)],
  };
}

function deduplicateScanErrors(result: AgentSkillScanResult): AgentSkillScanResult {
  const seen = new Set<string>();
  result.errors = result.errors.filter((error) => {
    const key = `${error.path}\0${error.messages.join("\0")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  result.errors.sort((left, right) => left.path.localeCompare(right.path));
  return result;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
