import type { RefObject } from "react";
import type { ConversationMessage } from "../types/chat.ts";
import FormattedMessage from "./FormattedMessage.tsx";

type ChatMessagesProps = {
  containerRef: RefObject<HTMLElement | null>;
  isLoading: boolean;
  loadingLabel: string | null;
  messages: ConversationMessage[];
  threadEndRef: RefObject<HTMLDivElement | null>;
};

export default function ChatMessages({
  containerRef,
  isLoading,
  loadingLabel,
  messages,
  threadEndRef,
}: ChatMessagesProps) {
  return (
    <section
      ref={containerRef}
      className="min-h-0 flex-1 overflow-y-auto px-3 pt-4 pb-2 sm:px-5 sm:pt-6 sm:pb-3"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 sm:gap-5">
        {messages.map((message) => {
          const isAssistant = message.role === "assistant";

          return (
            <div
              key={message.id}
              className={`animate-message-in flex w-full items-start gap-2.5 sm:gap-3 ${
                isAssistant ? "flex-row" : "flex-row-reverse"
              }`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold sm:h-[34px] sm:w-[34px] sm:text-[12px] ${
                  isAssistant
                    ? "bg-[#221911] text-[#ff6534]"
                    : "bg-[#ff4500] text-white"
                }`}
              >
                {isAssistant ? "AI" : "You"}
              </div>

              <div
                className={`max-w-[85%] rounded-2xl border px-3 py-2.5 text-[15px] leading-6 sm:max-w-[78%] sm:px-4 ${
                  isAssistant
                    ? "rounded-tl-[4px] border-[#23283a] bg-[#171b26]"
                    : "rounded-tr-[4px] border-[#3b2416] bg-[#241912]"
                } ${message.tone === "error" ? "opacity-75" : ""}`}
              >
                <p className="whitespace-pre-wrap break-words">
                  <FormattedMessage content={message.content} />
                </p>
              </div>
            </div>
          );
        })}

        {isLoading ? (
          <div className="animate-message-in flex items-start gap-2.5 sm:gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#221911] text-[11px] font-semibold text-[#ff6534] sm:h-[34px] sm:w-[34px] sm:text-[12px]">
              AI
            </div>
            <div className="rounded-2xl rounded-tl-[4px] border border-[#23283a] bg-[#171b26] px-3 py-2.5 text-[15px] text-[#8b8fa8] sm:px-4">
              {loadingLabel ?? "Working on it..."}
            </div>
          </div>
        ) : null}

        <div ref={threadEndRef} />
      </div>
    </section>
  );
}
