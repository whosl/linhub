#!/usr/bin/env node

import path from "node:path";

// 当前项目使用可直接剥离类型的 Node 运行脚本；隐藏其两条实验性加载提示，
// 避免把英文运行时警告混入面向用户的中文校验结果。
const emitWarning = process.emitWarning;
process.emitWarning = () => undefined;
const { scanAgentSkillsRoot } = await import(
  "../src/lib/server/skills/agent-skill-spec.ts"
);
process.emitWarning = emitWarning;

const roots = process.argv.slice(2);
if (roots.length === 0) roots.push(path.join(process.cwd(), "data", "skills"));

let packageCount = 0;
let errorCount = 0;

for (const inputRoot of roots) {
  const root = path.resolve(inputRoot);
  const result = await scanAgentSkillsRoot(root);
  packageCount += result.packages.length;

  for (const skillPackage of result.packages) {
    console.log(`✓ ${skillPackage.frontmatter.name}（${skillPackage.rootPath}）`);
  }
  for (const error of result.errors) {
    for (const message of error.messages) {
      console.error(`错误：${error.path}：${message}`);
      errorCount += 1;
    }
  }
}

if (errorCount > 0) {
  console.error(`校验失败：发现 ${errorCount} 个错误，${packageCount} 个有效技能包。`);
  process.exitCode = 1;
} else {
  console.log(`校验通过：共发现 ${packageCount} 个技能包。`);
}
