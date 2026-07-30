#!/usr/bin/env python3
"""Profile normalized spreadsheet rows inside the LinHub sandbox."""

from __future__ import annotations

import csv
import html
import json
import math
import os
import statistics
from collections import Counter
from pathlib import Path
from typing import Any

INPUT = Path(os.environ.get("LINHUB_INPUT_DIR", "/workspace/input"))
OUTPUT = Path(os.environ.get("LINHUB_OUTPUT_DIR", "/workspace/output"))
OUTPUT.mkdir(parents=True, exist_ok=True)


def clean(value: Any) -> str:
    return "" if value is None else str(value).strip()


def number(value: str) -> float | None:
    raw = clean(value).replace(",", "")
    percent = raw.endswith("%")
    if percent:
        raw = raw[:-1]
    try:
        parsed = float(raw)
        if not math.isfinite(parsed):
            return None
        return parsed / 100 if percent else parsed
    except ValueError:
        return None


def profile_column(values: list[str]) -> dict[str, Any]:
    normalized = [clean(value) for value in values]
    present = [value for value in normalized if value != ""]
    numeric = [parsed for value in present if (parsed := number(value)) is not None]
    counts = Counter(present)
    result: dict[str, Any] = {
        "count": len(normalized),
        "present": len(present),
        "missing": len(normalized) - len(present),
        "missingRate": round((len(normalized) - len(present)) / max(1, len(normalized)), 4),
        "unique": len(counts),
        "topValues": [{"value": key, "count": count} for key, count in counts.most_common(8)],
        "inferredType": "numeric" if present and len(numeric) / len(present) >= 0.8 else "text",
    }
    if numeric:
        result["numeric"] = {
            "count": len(numeric),
            "min": min(numeric),
            "max": max(numeric),
            "mean": statistics.fmean(numeric),
            "median": statistics.median(numeric),
        }
    return result


def profile_sheet(source_name: str, sheet: dict[str, Any]) -> dict[str, Any]:
    headers = [clean(value) for value in sheet.get("headers", [])]
    rows = [[clean(cell) for cell in row] for row in sheet.get("rows", [])]
    width = max([len(headers), *(len(row) for row in rows)], default=0)
    if len(headers) < width:
        headers.extend(f"列{index + 1}" for index in range(len(headers), width))
    columns = {
        headers[index]: profile_column([row[index] if index < len(row) else "" for row in rows])
        for index in range(width)
    }
    duplicate_count = len(rows) - len({tuple(row) for row in rows})
    issues: list[str] = []
    for name, column in columns.items():
        if column["missingRate"] >= 0.2:
            issues.append(f"{name} 缺失率 {column['missingRate']:.1%}")
        if column["unique"] <= 1 and column["present"] > 0:
            issues.append(f"{name} 基本无变化")
    if duplicate_count:
        issues.append(f"发现 {duplicate_count} 行重复记录")
    if sheet.get("truncated"):
        issues.append("分析样本已截断，不能代表未读取的全部行")
    return {
        "source": source_name,
        "name": clean(sheet.get("name")) or "Sheet",
        "analyzedRows": len(rows),
        "totalRows": int(sheet.get("totalRows", len(rows))),
        "truncated": bool(sheet.get("truncated")),
        "duplicateRows": duplicate_count,
        "columns": columns,
        "issues": issues,
        "headers": headers,
        "rows": rows,
    }


def markdown_report(question: str, sheets: list[dict[str, Any]]) -> str:
    lines = ["# 数据质量报告", "", f"分析问题：{question}", ""]
    for sheet in sheets:
        lines.extend([
            f"## {sheet['source']} / {sheet['name']}",
            f"- 已分析行数：{sheet['analyzedRows']} / {sheet['totalRows']}",
            f"- 重复行：{sheet['duplicateRows']}",
            f"- 是否截断：{'是' if sheet['truncated'] else '否'}",
            "",
            "### 字段概况",
        ])
        for name, column in sheet["columns"].items():
            lines.append(
                f"- {name}：{column['inferredType']}，缺失 {column['missingRate']:.1%}，"
                f"唯一值 {column['unique']}"
            )
        lines.append("")
        lines.append("### 质量问题")
        lines.extend(f"- {issue}" for issue in sheet["issues"] or ["未发现明显结构性问题"])
        lines.append("")
    return "\n".join(lines)


def make_chart(sheets: list[dict[str, Any]]) -> str:
    width, height = 760, 300
    items: list[tuple[str, float]] = []
    for sheet in sheets:
        for name, column in sheet["columns"].items():
            numeric = column.get("numeric")
            if numeric and numeric.get("count", 0) >= 3:
                items.append((f"{sheet['name']} · {name}", float(numeric["mean"])))
            if len(items) >= 6:
                break
        if len(items) >= 6:
            break
    if not items:
        items = [(sheet["name"], float(sheet["analyzedRows"])) for sheet in sheets[:6]]
    maximum = max([abs(value) for _, value in items], default=1) or 1
    bar_width = max(36, min(88, 560 // max(1, len(items))))
    chart = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
        '<text x="24" y="30" font-family="sans-serif" font-size="16" font-weight="600" fill="#172033">数值列均值 / 数据行数快速预览</text>',
        '<line x1="52" y1="240" x2="730" y2="240" stroke="#d0d5dd"/>',
    ]
    for index, (label, value) in enumerate(items):
        x = 70 + index * (bar_width + 24)
        bar_height = max(2, abs(value) / maximum * 160)
        y = 240 - bar_height
        chart.append(f'<rect x="{x}" y="{y:.1f}" width="{bar_width}" height="{bar_height:.1f}" rx="5" fill="#3977e8"/>')
        chart.append(f'<text x="{x + bar_width / 2:.1f}" y="{y - 7:.1f}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#344054">{value:.3g}</text>')
        chart.append(f'<text x="{x + bar_width / 2:.1f}" y="260" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#667085">{html.escape(label[:12])}</text>')
    chart.append("</svg>")
    return "".join(chart)


def write_clean_csv(sheet: dict[str, Any]) -> None:
    with (OUTPUT / "cleaned-data.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(sheet["headers"])
        for row in sheet["rows"]:
            if any(clean(value) for value in row):
                writer.writerow([clean(value) for value in row])


def main() -> None:
    payload = json.loads((INPUT / "dataset.json").read_text(encoding="utf-8"))
    question = clean(payload.get("question"))
    sheets = [
        profile_sheet(source.get("name", "数据文件"), sheet)
        for source in payload.get("sources", [])
        for sheet in source.get("sheets", [])
    ]
    if not sheets:
        raise ValueError("没有可分析的工作表")
    report = markdown_report(question, sheets)
    chart = make_chart(sheets)
    serializable = [{key: value for key, value in sheet.items() if key != "rows"} for sheet in sheets]
    profile = {"question": question, "sheetCount": len(sheets), "sheets": serializable}
    (OUTPUT / "profile.json").write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUTPUT / "quality-report.md").write_text(report, encoding="utf-8")
    (OUTPUT / "chart.svg").write_text(chart, encoding="utf-8")
    write_clean_csv(sheets[0])
    template = (INPUT / "report-template.html").read_text(encoding="utf-8")
    quality = "\n".join(issue for sheet in sheets for issue in sheet["issues"]) or "未发现明显结构性问题"
    summary = "\n".join(
        f"{sheet['source']} / {sheet['name']}：分析 {sheet['analyzedRows']} / {sheet['totalRows']} 行，{len(sheet['columns'])} 列"
        for sheet in sheets
    )
    rendered = (template.replace("{{TITLE}}", html.escape(question or "数据分析"))
                .replace("{{SUMMARY}}", html.escape(summary))
                .replace("{{QUALITY}}", html.escape(quality))
                .replace("{{CHART}}", chart))
    (OUTPUT / "analysis-preview.html").write_text(rendered, encoding="utf-8")
    print(json.dumps({"sheets": len(sheets), "outputs": 5}, ensure_ascii=False))


if __name__ == "__main__":
    main()
