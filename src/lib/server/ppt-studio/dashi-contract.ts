export type DashiContractIssue = {
  path: string;
  message: string;
};

type JsonRecord = Record<string, unknown>;

/**
 * inspect-layout 在单版式时返回对象，多版式时返回 { layouts }。
 * 这里统一为与请求 layouts 同序的契约，缺失契约直接报错，避免无契约生成。
 */
export function selectDashiInspections(values: unknown[], layouts: string[]) {
  const byLayout = new Map<string, JsonRecord>();
  for (const value of values) {
    for (const inspection of flattenInspections(value)) {
      const layout = stringProperty(inspection, "layout");
      if (layout) byLayout.set(layout, inspection);
    }
  }
  return layouts.map((layout) => {
    const inspection = byLayout.get(layout);
    if (!inspection) throw new Error(`Dashi 版式 ${layout} 没有返回字段契约`);
    return inspection;
  });
}

/**
 * 根据 Dashi inspect-layout 输出的机器契约验证模型 props。
 * 枚举、类型、硬数值范围、长度和文案预算均来自 Dashi 契约本身，不维护版式特例。
 */
export function validateDashiProps(
  props: Record<string, unknown>,
  inspection: unknown
): DashiContractIssue[] {
  if (!isRecord(inspection)) {
    return [{ path: "props", message: "版式字段契约无效" }];
  }
  const issues: DashiContractIssue[] = [];
  const propShapes = recordProperty(inspection, "propShapes");
  if (propShapes) validateShape(props, propShapes, "props", issues);

  const fillPlan = recordProperty(inspection, "fillPlan");
  if (!fillPlan) return issues;
  for (const field of arrayProperty(fillPlan, "text")) {
    if (!isRecord(field)) continue;
    const key = stringProperty(field, "key");
    if (!key) continue;
    const value = valueAtPath(props, key);
    if (value === undefined) continue;
    validateFieldValue(value, field, `props.${key}`, issues);
  }
  for (const arrayContract of arrayProperty(fillPlan, "arrays")) {
    if (!isRecord(arrayContract)) continue;
    validateArrayContract(props, arrayContract, issues);
  }
  return dedupeIssues(issues);
}

export function formatDashiContractIssues(issues: DashiContractIssue[]) {
  return issues
    .slice(0, 12)
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join("；");
}

function flattenInspections(value: unknown): JsonRecord[] {
  if (!isRecord(value)) return [];
  if (typeof value.layout === "string") return [value];
  return arrayProperty(value, "layouts").filter(isRecord);
}

function validateShape(
  value: unknown,
  shape: unknown,
  path: string,
  issues: DashiContractIssue[]
) {
  if (typeof shape === "string") {
    if (!matchesType(value, shape)) {
      issues.push({ path, message: `必须是 ${typeLabel(shape)}` });
    }
    return;
  }
  if (Array.isArray(shape)) {
    if (!Array.isArray(value)) {
      issues.push({ path, message: "必须是数组" });
      return;
    }
    if (shape.length === 0) return;
    value.forEach((item, index) => validateShape(item, shape[0], `${path}[${index}]`, issues));
    return;
  }
  if (!isRecord(shape)) return;
  if (!isRecord(value)) {
    issues.push({ path, message: "必须是对象" });
    return;
  }
  for (const [key, childShape] of Object.entries(shape)) {
    if (!(key in value)) continue;
    validateShape(value[key], childShape, `${path}.${key}`, issues);
  }
}

function validateArrayContract(
  props: Record<string, unknown>,
  contract: JsonRecord,
  issues: DashiContractIssue[]
) {
  const key = stringProperty(contract, "key");
  if (!key) return;
  const arrays = arraysAtPattern(props, key);
  if (arrays.length === 0) return;
  arrays.forEach((value, occurrence) => {
    const path = `props.${key}${arrays.length > 1 ? `#${occurrence + 1}` : ""}`;
    if (!Array.isArray(value)) {
      issues.push({ path, message: "必须是数组" });
      return;
    }
    validateArrayLength(value, contract, path, issues);
    const itemFields = recordProperty(contract, "itemFields");
    if (itemFields) {
      value.forEach((item, index) => {
        if (!isRecord(item)) return;
        for (const [fieldPath, fieldContract] of Object.entries(itemFields)) {
          if (!isRecord(fieldContract)) continue;
          const fieldValue = valueAtPath(item, fieldPath);
          if (fieldValue === undefined) continue;
          validateFieldValue(fieldValue, fieldContract, `${path}[${index}].${fieldPath}`, issues);
        }
      });
    }
  });
}

function validateArrayLength(
  value: unknown[],
  contract: JsonRecord,
  path: string,
  issues: DashiContractIssue[]
) {
  const maxCount = numberProperty(contract, "maxCount");
  if (maxCount !== null && value.length > maxCount) {
    issues.push({ path, message: `最多允许 ${maxCount} 项` });
  }
  const fixedLength = numberProperty(contract, "fixedLength");
  if (fixedLength !== null && value.length !== fixedLength) {
    issues.push({ path, message: `必须包含 ${fixedLength} 项` });
  }
  const fixedLengths = arrayProperty(contract, "fixedLengths").filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item)
  );
  if (fixedLengths.length > 0 && !fixedLengths.includes(value.length)) {
    issues.push({ path, message: `项数必须是 ${fixedLengths.join("、")}` });
  }
}

function validateFieldValue(
  value: unknown,
  contract: JsonRecord,
  path: string,
  issues: DashiContractIssue[]
) {
  const type = stringProperty(contract, "type");
  if (type && !matchesType(value, type)) {
    issues.push({ path, message: `必须是 ${typeLabel(type)}` });
    return;
  }
  const enumValues = arrayProperty(contract, "enum").filter(
    (item): item is string => typeof item === "string"
  );
  if (enumValues.length > 0 && (typeof value !== "string" || !enumValues.includes(value))) {
    issues.push({
      path,
      message: `必须严格使用枚举值 ${enumValues.join("、")}`,
    });
  }
  const maxChars = numberProperty(contract, "maxChars");
  if (maxChars !== null && typeof value === "string" && Array.from(value).length > maxChars) {
    issues.push({ path, message: `不能超过 ${maxChars} 个字符` });
  }
  const bounds = recordProperty(contract, "numericBounds");
  if (bounds?.enforced === true && typeof value === "number") {
    const min = numberProperty(bounds, "min");
    const max = numberProperty(bounds, "max");
    if (min !== null && value < min) issues.push({ path, message: `不能小于 ${min}` });
    if (max !== null && value > max) issues.push({ path, message: `不能大于 ${max}` });
  }
}

function arraysAtPattern(root: unknown, pattern: string): unknown[] {
  const parts = pattern.split(".").filter(Boolean);
  const walk = (value: unknown, index: number): unknown[] => {
    if (index >= parts.length) return [value];
    if (!isRecord(value)) return [];
    const token = parts[index];
    const expandsItems = token.endsWith("[]");
    const key = expandsItems ? token.slice(0, -2) : token;
    const next = value[key];
    if (expandsItems) {
      if (!Array.isArray(next)) return [];
      if (index === parts.length - 1) return [next];
      return next.flatMap((item) => walk(item, index + 1));
    }
    if (index === parts.length - 1) return [next];
    return walk(next, index + 1);
  };
  return walk(root, 0).filter((value) => value !== undefined);
}

function valueAtPath(root: unknown, path: string): unknown {
  let current = root;
  for (const key of path.split(".").filter(Boolean)) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function matchesType(value: unknown, type: string) {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isRecord(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function typeLabel(type: string) {
  return ({ string: "字符串", number: "数字", boolean: "布尔值", array: "数组", object: "对象" } as Record<string, string>)[type] ?? type;
}

function dedupeIssues(issues: DashiContractIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.path}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordProperty(value: JsonRecord, key: string): JsonRecord | null {
  return isRecord(value[key]) ? value[key] : null;
}

function arrayProperty(value: JsonRecord, key: string): unknown[] {
  return Array.isArray(value[key]) ? value[key] : [];
}

function stringProperty(value: JsonRecord, key: string) {
  return typeof value[key] === "string" ? value[key] : "";
}

function numberProperty(value: JsonRecord, key: string): number | null {
  const number = value[key];
  return typeof number === "number" && Number.isFinite(number) ? number : null;
}
