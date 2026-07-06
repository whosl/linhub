import { Suspense } from "react";
import { ChatView } from "@/components/chat/chat-view";

export default function NewChatPage() {
  // C3: ChatView 现使用 useSearchParams 读取 ?skill=/?project=，
  // 生产构建要求静态页面中的 useSearchParams 必须被 Suspense 包裹。
  return (
    <Suspense fallback={null}>
      <ChatView />
    </Suspense>
  );
}
