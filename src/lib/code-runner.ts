"use client";

/** 客户端代码运行器：Python 走 Pyodide（WebWorker），JS 走沙箱 iframe */

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full";

let pyodideWorker: Worker | null = null;

function getPyodideWorker(): Worker {
  if (pyodideWorker) return pyodideWorker;
  const workerCode = `
    importScripts("${PYODIDE_CDN}/pyodide.js");
    let pyodideReady = loadPyodide({ indexURL: "${PYODIDE_CDN}/" });
    const PACKAGE_IMPORTS = [
      { name: "matplotlib", re: /(^|\\n)\\s*(?:import\\s+(?:matplotlib|pylab)\\b|from\\s+matplotlib\\b)/ },
      { name: "numpy", re: /(^|\\n)\\s*(?:import\\s+numpy\\b|from\\s+numpy\\b)/ },
      { name: "pandas", re: /(^|\\n)\\s*(?:import\\s+pandas\\b|from\\s+pandas\\b)/ },
      { name: "scipy", re: /(^|\\n)\\s*(?:import\\s+scipy\\b|from\\s+scipy\\b)/ },
    ];
    function packagesFor(code) {
      return PACKAGE_IMPORTS.filter((p) => p.re.test(code)).map((p) => p.name);
    }
    self.onmessage = async (e) => {
      const { id, code } = e.data;
      try {
        const pyodide = await pyodideReady;
        const packages = packagesFor(code);
        if (packages.length) await pyodide.loadPackage(packages);
        const usesMatplotlib = packages.includes("matplotlib");
        if (usesMatplotlib) {
          pyodide.runPython('import matplotlib\\nmatplotlib.use("Agg")');
        }
        let stdout = "";
        pyodide.setStdout({ batched: (s) => { stdout += s + "\\n"; } });
        pyodide.setStderr({ batched: (s) => { stdout += s + "\\n"; } });
        const result = await pyodide.runPythonAsync(code);
        if (result !== undefined && result !== null) stdout += String(result) + "\\n";
        if (usesMatplotlib && !stdout.trim()) {
          const figureCount = pyodide.runPython('import matplotlib.pyplot as plt\\nlen(plt.get_fignums())');
          if (figureCount > 0) {
            stdout = "已生成 Matplotlib 图表（当前运行器暂不展示图片预览）。\\n";
          }
        }
        self.postMessage({ id, output: stdout || "（无输出）" });
      } catch (err) {
        self.postMessage({ id, error: String(err) });
      }
    };
  `;
  const blob = new Blob([workerCode], { type: "application/javascript" });
  pyodideWorker = new Worker(URL.createObjectURL(blob));
  return pyodideWorker;
}

export function runPython(code: string, timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = getPyodideWorker();
    const id = Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      worker.removeEventListener("message", onMessage);
      // 超时后终止 worker，避免死循环占用
      pyodideWorker?.terminate();
      pyodideWorker = null;
      reject(new Error(`运行超时（${Math.round(timeoutMs / 1000)} 秒）`));
    }, timeoutMs);
    const onMessage = (e: MessageEvent) => {
      if (e.data.id !== id) return;
      clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.output as string);
    };
    worker.addEventListener("message", onMessage);
    worker.postMessage({ id, code });
  });
}

export function runJavaScript(code: string, timeoutMs = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.setAttribute("sandbox", "allow-scripts");
    const channel = Math.random().toString(36).slice(2);
    const html = `<script>
      const logs = [];
      const send = () => parent.postMessage({ channel: "${channel}", output: logs.join("\\n") || "（无输出）" }, "*");
      ["log","info","warn","error"].forEach((m) => {
        console[m] = (...args) => logs.push(args.map((a) => {
          try { return typeof a === "object" ? JSON.stringify(a) : String(a); } catch { return String(a); }
        }).join(" "));
      });
      window.onerror = (msg) => { logs.push("Error: " + msg); send(); };
      try {
        const result = (function() { ${code.replace(/<\//g, "<\\/")} })();
        Promise.resolve(result).then((r) => {
          if (r !== undefined) logs.push(String(r));
          send();
        }).catch((e) => { logs.push("Error: " + e); send(); });
      } catch (e) { logs.push("Error: " + e); send(); }
    <\/script>`;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      iframe.remove();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("运行超时"));
    }, timeoutMs);
    const onMessage = (e: MessageEvent) => {
      // I16: 校验来源窗口必须是我们的 iframe（opaque origin 下 targetOrigin 只能是 "*"），
      // 配合随机 channel 防止其他 iframe/tab 伪造运行结果。
      if (e.source !== iframe.contentWindow) return;
      if (e.data?.channel !== channel) return;
      clearTimeout(timer);
      cleanup();
      resolve(e.data.output as string);
    };
    window.addEventListener("message", onMessage);
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  });
}
