// 语音输入按钮:MediaRecorder 录音 → /api/voice/transcribe → 文本追加到输入框
// 录音中按钮变红闪烁,显示时长,可停止(转写)或取消(丢弃)

import { useEffect, useRef, useState } from "react";
import { transcribeAudio } from "@/api/voice";
import { Spinner } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

/** 优先 webm/opus,不支持则用浏览器默认 mimeType */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const preferred = "audio/webm;codecs=opus";
  try {
    return MediaRecorder.isTypeSupported(preferred) ? preferred : undefined;
  } catch {
    return undefined;
  }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VoiceRecorderButton({
  disabled,
  onTranscribed,
}: {
  disabled?: boolean;
  /** 转写成功,把文本交给父组件追加到输入框 */
  onTranscribed: (text: string) => void;
}) {
  const [supported] = useState(
    () =>
      typeof MediaRecorder !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia,
  );
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  /** 取消标记:true 时 onstop 直接丢弃 */
  const discardRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const cleanup = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  };

  // 卸载时保底释放麦克风
  useEffect(() => cleanup, []);

  if (!supported) return null;

  const start = async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("无法访问麦克风,请检查浏览器授权");
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];
    discardRef.current = false;

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    );
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const chunks = chunksRef.current;
      const type = recorder.mimeType || mimeType || "audio/webm";
      const discard = discardRef.current;
      cleanup();
      setRecording(false);
      if (discard) return;
      if (chunks.length === 0) {
        toast.error("没有录到声音,请重试");
        return;
      }
      setTranscribing(true);
      transcribeAudio(new Blob(chunks, { type }), type)
        .then((res) => {
          const text = res.text?.trim();
          if (text) {
            onTranscribed(text);
          } else {
            toast.error("没有识别到语音内容");
          }
        })
        .catch((err: unknown) => {
          toast.error(
            err instanceof Error ? err.message : "语音转写失败,请稍后重试",
          );
        })
        .finally(() => setTranscribing(false));
    };

    recorder.start();
    setSeconds(0);
    timerRef.current = window.setInterval(() => setSeconds((v) => v + 1), 1000);
    setRecording(true);
  };

  const stop = (discard: boolean) => {
    discardRef.current = discard;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      cleanup();
      setRecording(false);
    }
  };

  if (recording) {
    return (
      <span className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs">
        <span className="inline-block size-2 animate-pulse rounded-full bg-danger" />
        <span className="tabular-nums text-danger">{formatDuration(seconds)}</span>
        <button
          type="button"
          onClick={() => stop(false)}
          className="rounded-md bg-danger px-2 py-0.5 text-white hover:opacity-85"
        >
          停止
        </button>
        <button
          type="button"
          onClick={() => stop(true)}
          aria-label="取消录音"
          className="rounded-md px-1.5 py-0.5 text-text-3 hover:bg-surface-2 hover:text-text"
        >
          ✕
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void start()}
      disabled={disabled || transcribing}
      title="语音输入"
      aria-label="语音输入"
      className={cn(
        "flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-2 transition-colors hover:bg-surface-2 disabled:opacity-40",
      )}
    >
      {transcribing ? (
        <>
          <Spinner className="size-3" /> 转写中…
        </>
      ) : (
        <span aria-hidden>🎤</span>
      )}
    </button>
  );
}
