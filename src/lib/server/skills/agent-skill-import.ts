import "server-only";

import crypto from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { loadAgentSkillPackage } from "@/lib/server/skills/agent-skill-spec";

const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 300;

export async function importAgentSkillZip(bytes: Buffer) {
  if (bytes.length === 0 || bytes.length > MAX_ARCHIVE_BYTES) {
    throw new Error("Skill 压缩包必须小于 20 MB");
  }
  const archive = await JSZip.loadAsync(bytes, { createFolders: true });
  const entries = Object.values(archive.files).filter(
    (entry) => !entry.dir && !entry.name.startsWith("__MACOSX/")
  );
  if (entries.length === 0 || entries.length > MAX_FILES) {
    throw new Error(`Skill 文件数量必须在 1 到 ${MAX_FILES} 之间`);
  }
  for (const entry of entries) assertArchiveEntry(entry);
  const skillFiles = entries.filter((entry) => /(^|\/)SKILL\.md$/u.test(entry.name));
  if (skillFiles.length !== 1) {
    throw new Error("压缩包必须且只能包含一个 SKILL.md");
  }
  const skillRootPrefix = path.posix.dirname(skillFiles[0].name);
  if (skillRootPrefix === ".") {
    throw new Error("请把 Skill 文件放入与 name 同名的顶层目录后再压缩");
  }
  if (
    entries.some(
      (entry) =>
        entry.name !== skillRootPrefix && !entry.name.startsWith(`${skillRootPrefix}/`)
    )
  ) {
    throw new Error("压缩包只能包含一个顶层 Skill 目录");
  }

  const importsRoot = path.resolve(process.cwd(), "data", "skills", "imported");
  const tempRoot = path.join(importsRoot, `.tmp-${uid()}`);
  const stagedSkillRoot = path.join(tempRoot, path.posix.basename(skillRootPrefix));
  await mkdir(stagedSkillRoot, { recursive: true });
  let expandedBytes = 0;
  try {
    for (const entry of entries) {
      const relative = entry.name.slice(skillRootPrefix.length + 1);
      if (!relative) continue;
      const output = path.resolve(stagedSkillRoot, relative);
      if (!isWithin(stagedSkillRoot, output)) throw new Error("Skill 包存在路径穿越");
      const content = await entry.async("nodebuffer");
      expandedBytes += content.length;
      if (expandedBytes > MAX_EXPANDED_BYTES) {
        throw new Error("Skill 解压后不能超过 50 MB");
      }
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, content, { flag: "wx" });
    }

    const skill = await loadAgentSkillPackage(stagedSkillRoot);
    const finalRoot = path.join(importsRoot, skill.frontmatter.name, skill.digest);
    await mkdir(path.dirname(finalRoot), { recursive: true });
    await rm(finalRoot, { recursive: true, force: true });
    await rename(stagedSkillRoot, finalRoot);
    await rm(tempRoot, { recursive: true, force: true });
    return { packageRoot: finalRoot, skill };
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

function assertArchiveEntry(entry: JSZip.JSZipObject) {
  const name = entry.name.replaceAll("\\", "/");
  if (
    name.startsWith("/") ||
    name.includes("\0") ||
    name.split("/").some((part) => part === ".." || part === "")
  ) {
    throw new Error(`Skill 包含非法路径：${entry.name}`);
  }
  const mode = typeof entry.unixPermissions === "number" ? entry.unixPermissions : 0;
  if ((mode & 0o170000) === 0o120000) {
    throw new Error(`Skill 包不能包含符号链接：${entry.name}`);
  }
}

function isWithin(root: string, target: string) {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function uid() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
