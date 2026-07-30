// Artifact 渲染器:按 kind 分发(html/svg 走 sandbox iframe,markdown/code/mermaid 复用聊天渲染组件)
// react:iframe 内联 Babel standalone + React UMD,把 JSX 源码即时编译挂载;失败把错误写进 DOM

import type { Artifact } from "@/api/artifacts";
import { CodeBlock } from "./markdown/CodeBlock";
import { MarkdownRenderer } from "./markdown/MarkdownRenderer";
import { MermaidBlock } from "./markdown/MermaidBlock";

/** 包一层居中白底容器渲染 svg 源码 */
function svgDoc(source: string): string {
  return `<!doctype html><html><head><meta charset="utf-8" /><style>
html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#fff}
svg{max-width:100%;max-height:100%}
</style></head><body>${source}</body></html>`;
}

/**
 * React artifact 的 iframe 文档:
 * - React/ReactDOM 18 UMD + Babel standalone 均走 CDN
 * - 源码用 JSON 内联(转义 </ 防止提前闭合 script),Babel.transform 编译后
 *   以 new Function 执行并取回名为 App 的组件,createRoot 挂载到 #root
 * - 编译/运行任何错误都在 iframe 内以红字展示,不污染外层页面
 */
function reactDoc(source: string): string {
  const codeJson = JSON.stringify(source).replace(/<\//g, "<\\/");
  return `<!doctype html><html><head><meta charset="utf-8" />
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<style>
html,body{margin:0;background:#fff;color:#111;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.err{color:#b91c1c;white-space:pre-wrap;font:13px/1.6 ui-monospace,monospace;padding:16px;margin:0}
</style></head><body><div id="root"></div>
<script>
(function () {
  var showError = function (err) {
    var pre = document.createElement("pre");
    pre.className = "err";
    pre.textContent = "渲染失败:" + (err && err.stack ? err.stack : String(err));
    document.body.innerHTML = "";
    document.body.appendChild(pre);
  };
  window.addEventListener("error", function (e) { showError(e.error || e.message); });
  var boot = function () {
    try {
      if (!window.Babel) throw new Error("Babel 加载失败(需要访问 unpkg.com)");
      if (!window.React || !window.ReactDOM) throw new Error("React 加载失败(需要访问 unpkg.com)");
      var source = ${codeJson};
      var compiled = window.Babel.transform(source, { presets: ["react"] }).code;
      var factory = new Function("React", "ReactDOM", compiled + "\\n;return typeof App !== 'undefined' ? App : null;");
      var App = factory(window.React, window.ReactDOM);
      if (!App) throw new Error("未找到名为 App 的组件,请在源码中定义 App");
      window.ReactDOM.createRoot(document.getElementById("root")).render(window.React.createElement(App));
    } catch (err) { showError(err); }
  };
  if (document.readyState === "complete") boot();
  else window.addEventListener("load", boot);
})();
</script></body></html>`;
}

const KIND_LABEL: Record<Artifact["kind"], string> = {
  html: "HTML",
  react: "React",
  svg: "SVG",
  markdown: "Markdown",
  code: "代码",
  mermaid: "Mermaid",
};

export function artifactKindLabel(kind: Artifact["kind"]): string {
  return KIND_LABEL[kind] ?? kind;
}

/** 「代码」Tab 用的高亮语言:优先 artifact.language,否则按 kind 推断 */
export function artifactCodeLanguage(artifact: Artifact): string {
  if (artifact.language) return artifact.language;
  if (artifact.kind === "react") return "jsx";
  return artifact.kind;
}

/** 预览渲染(只读):html/react/svg 为 iframe,其余复用 Markdown 体系组件 */
export function ArtifactPreview({
  artifact,
  content,
}: {
  artifact: Artifact;
  /** 当前选中版本的内容 */
  content: string;
}) {
  switch (artifact.kind) {
    case "html":
      return (
        <iframe
          title={artifact.title}
          sandbox="allow-scripts"
          srcDoc={content}
          className="h-full w-full border-0 bg-white"
        />
      );
    case "svg":
      return (
        <iframe
          title={artifact.title}
          sandbox="allow-scripts"
          srcDoc={svgDoc(content)}
          className="h-full w-full border-0 bg-white"
        />
      );
    case "react":
      return (
        <iframe
          title={artifact.title}
          sandbox="allow-scripts"
          srcDoc={reactDoc(content)}
          className="h-full w-full border-0 bg-white"
        />
      );
    case "markdown":
      return (
        <div className="h-full overflow-y-auto p-4">
          <MarkdownRenderer content={content} />
        </div>
      );
    case "mermaid":
      return (
        <div className="h-full overflow-y-auto p-4">
          <MermaidBlock code={content} />
        </div>
      );
    case "code":
    default:
      return (
        <div className="h-full overflow-y-auto p-4">
          <CodeBlock language={artifact.language ?? ""} code={content} />
        </div>
      );
  }
}
