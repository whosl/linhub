// 右侧消息刻度条:每条消息一个刻度,点击滚动到对应消息
// 可在设置中关闭(ui-store messageRailEnabled,默认开)

import type { RefObject } from "react";
import { useUiStore } from "@/stores/ui-store";

export function MessageRail({
  messageIds,
  containerRef,
}: {
  messageIds: string[];
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  const enabled = useUiStore((s) => s.messageRailEnabled);
  if (!enabled || messageIds.length < 3) return null;

  const scrollTo = (id: string) => {
    containerRef.current
      ?.querySelector(`[data-msg-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="absolute top-1/2 right-1 z-10 hidden -translate-y-1/2 flex-col items-center gap-1 md:flex">
      {messageIds.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => scrollTo(id)}
          aria-label="滚动到消息"
          className="h-4 w-1 rounded-full bg-border transition-colors hover:bg-primary"
        />
      ))}
    </div>
  );
}
