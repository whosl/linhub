#!/usr/bin/env python3
"""Validate deterministic Data Analyst deliverables before publishing."""

from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(os.environ.get("LINHUB_OUTPUT_DIR", "/workspace/output")).resolve()
REQUIRED = {"profile.json", "quality-report.md", "chart.svg", "cleaned-data.csv", "analysis-preview.html"}
MAX_TOTAL = 32 * 1024 * 1024


def main() -> None:
    files = {item.name: item for item in ROOT.iterdir() if item.is_file() and not item.is_symlink()}
    missing = sorted(REQUIRED - files.keys())
    if missing:
        raise ValueError(f"缺少输出文件：{', '.join(missing)}")
    total = sum(item.stat().st_size for item in files.values())
    if total > MAX_TOTAL:
        raise ValueError("输出文件总大小超过 32 MiB")
    profile = json.loads(files["profile.json"].read_text(encoding="utf-8"))
    if not isinstance(profile.get("sheets"), list) or not profile["sheets"]:
        raise ValueError("profile.json 不包含工作表结果")
    if "<svg" not in files["chart.svg"].read_text(encoding="utf-8")[:500]:
        raise ValueError("chart.svg 格式无效")
    print(json.dumps({"ok": True, "files": len(files), "bytes": total}, ensure_ascii=False))


if __name__ == "__main__":
    main()
