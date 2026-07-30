// 消息朗读(TTS)播放状态:全局单实例 audio,同时只允许一条消息在播

import { create } from "zustand";
import { synthesizeSpeech } from "@/api/voice";
import { toast } from "@/components/ui/toast";

/** 朗读文本截断长度 */
const MAX_TTS_CHARS = 2000;

let audio: HTMLAudioElement | null = null;
let objectUrl: string | null = null;
/** 加载竞态守卫:stop / 新的 play 会使进行中的加载失效 */
let playToken = 0;

function releaseAudio(): void {
  audio?.pause();
  audio = null;
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

interface TtsState {
  /** 正在播放的消息 id */
  playingId: string | null;
  /** 正在请求音频的消息 id */
  loadingId: string | null;
  /** 播放指定消息;再次调用同一消息 = 停止 */
  play: (messageId: string, text: string) => Promise<void>;
  stop: () => void;
}

export const useTtsStore = create<TtsState>()((set, get) => ({
  playingId: null,
  loadingId: null,

  play: async (messageId, text) => {
    // 同一消息再点 = 停止
    if (get().playingId === messageId || get().loadingId === messageId) {
      get().stop();
      return;
    }
    get().stop();
    const token = ++playToken;
    const trimmed = text.trim().slice(0, MAX_TTS_CHARS);
    if (!trimmed) {
      toast.error("该消息没有可朗读的文本");
      return;
    }
    set({ loadingId: messageId });
    try {
      const blob = await synthesizeSpeech(trimmed);
      if (token !== playToken) return; // 期间被停止/替换
      objectUrl = URL.createObjectURL(blob);
      const el = new Audio(objectUrl);
      audio = el;
      el.onended = () => get().stop();
      el.onerror = () => {
        toast.error("音频播放失败");
        get().stop();
      };
      await el.play();
      if (token !== playToken) return;
      set({ playingId: messageId, loadingId: null });
    } catch (err) {
      if (token !== playToken) return;
      toast.error(err instanceof Error ? err.message : "朗读失败,请稍后重试");
      releaseAudio();
      set({ playingId: null, loadingId: null });
    }
  },

  stop: () => {
    playToken++;
    releaseAudio();
    set({ playingId: null, loadingId: null });
  },
}));
