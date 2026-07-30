// PPT 简报需求表单:skill run waiting_input 时收集用户输入
// input 结构不确定,做通用映射:字符串→文本框、数字→number、字符串数组→下拉 select;
// 其余结构退化为 JSON 文本域;非对象 input(如纯文本提示)退化为单个备注输入

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";

type Field =
  | { key: string; kind: "string"; initial: string }
  | { key: string; kind: "number"; initial: number }
  | { key: string; kind: "select"; options: string[]; initial: string };

/** 从 input 解析表单字段;返回 null 表示无法用结构化表单表达 */
function parseFields(input: unknown): Field[] | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const fields: Field[] = [];
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === "string") {
      fields.push({ key, kind: "string", initial: value });
    } else if (typeof value === "number") {
      fields.push({ key, kind: "number", initial: value });
    } else if (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((v) => typeof v === "string")
    ) {
      fields.push({ key, kind: "select", options: value as string[], initial: value[0] as string });
    } else {
      return null; // 含复杂嵌套,退化 JSON 编辑
    }
  }
  return fields.length > 0 ? fields : null;
}

const labelClass = "mb-1 block text-xs font-medium text-text-3";
const inputClass =
  "w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm text-text outline-none focus:border-primary";

export function PptBriefCard({
  input,
  submitting,
  onSubmit,
}: {
  input: unknown;
  submitting: boolean;
  onSubmit: (payload: unknown) => void;
}) {
  const fields = useMemo(() => parseFields(input), [input]);
  const [values, setValues] = useState<Record<string, string | number>>(() => {
    const init: Record<string, string | number> = {};
    for (const f of fields ?? []) init[f.key] = f.initial;
    return init;
  });
  const [jsonText, setJsonText] = useState(() =>
    fields === null && input !== undefined && input !== null
      ? JSON.stringify(input, null, 2)
      : "",
  );
  const [note, setNote] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const submit = () => {
    if (fields) {
      onSubmit(values);
      return;
    }
    if (input === undefined || input === null || typeof input === "string") {
      // 无结构化需求:提交一个备注文本
      if (!note.trim()) return;
      onSubmit({ text: note.trim() });
      return;
    }
    // JSON 文本域
    try {
      onSubmit(JSON.parse(jsonText));
      setJsonError(null);
    } catch {
      setJsonError("JSON 格式不正确,请检查后再提交");
    }
  };

  return (
    <div className="mt-2 rounded-xl border border-primary/30 bg-primary-soft/40 p-3">
      <p className="mb-2.5 text-sm font-medium text-text">请补充简报需求</p>
      {fields ? (
        <div className="flex flex-col gap-2.5">
          {fields.map((f) => (
            <label key={f.key} className="block">
              <span className={labelClass}>{f.key}</span>
              {f.kind === "string" ? (
                <input
                  className={inputClass}
                  value={String(values[f.key] ?? "")}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [f.key]: e.target.value }))
                  }
                />
              ) : f.kind === "number" ? (
                <input
                  type="number"
                  className={inputClass}
                  value={Number(values[f.key] ?? 0)}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [f.key]: Number(e.target.value) }))
                  }
                />
              ) : (
                <select
                  className={inputClass}
                  value={String(values[f.key] ?? "")}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [f.key]: e.target.value }))
                  }
                >
                  {f.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              )}
            </label>
          ))}
        </div>
      ) : input === undefined || input === null || typeof input === "string" ? (
        <label className="block">
          <span className={labelClass}>补充说明(主题、页数、风格、受众等)</span>
          <textarea
            className={inputClass}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例如:主题「年度总结」,10 页,简约商务风,面向管理层"
          />
        </label>
      ) : (
        <label className="block">
          <span className={labelClass}>需求(JSON)</span>
          <textarea
            className={`${inputClass} font-mono text-xs`}
            rows={6}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
          />
          {jsonError && <span className="mt-1 block text-xs text-danger">{jsonError}</span>}
        </label>
      )}
      <div className="mt-3 flex justify-end">
        <Button size="sm" disabled={submitting} onClick={submit}>
          {submitting ? "提交中…" : "提交"}
        </Button>
      </div>
    </div>
  );
}
