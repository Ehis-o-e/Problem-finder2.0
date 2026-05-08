import { useRef } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";
import { useAutosizeTextarea } from "../hooks/useAutosizeTextarea.ts";

const MAX_TEXTAREA_HEIGHT = 160;

type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  canSend: boolean;
  hint: string | null;
  loadingLabel: string | null;
  variant: "landing" | "chat";
};

export default function ChatComposer({
  value,
  onChange,
  onSend,
  canSend,
  hint,
  loadingLabel,
  variant,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isLanding = variant === "landing";
  const wrapperClassName = isLanding
    ? "rounded-[22px] border border-[#2e3250] bg-[#1e2130] px-4 py-2 shadow-[0_26px_80px_rgba(0,0,0,0.42)] transition-all duration-200 focus-within:border-[#ff6534] focus-within:shadow-[0_0_0_3px_rgba(255,69,0,0.14)] sm:px-5 sm:py-3.5"
    : "rounded-2xl border border-[#2e3250] bg-[#1e2130] px-2.5 py-2.5 transition-colors duration-200 focus-within:border-[#ff4500] sm:px-4 sm:py-3";
  const textareaClassName = isLanding
    ? "block min-h-[24px] flex-1 resize-none border-0 bg-transparent text-[#f5f5f5] text-[15px] leading-6 outline-none placeholder:text-[#8b8fa8] sm:min-h-[28px] sm:text-[17px]"
    : "block min-h-[24px] flex-1 resize-none border-0 bg-transparent text-[#f5f5f5] text-[14px] leading-5 outline-none placeholder:text-[#8b8fa8] sm:min-h-[26px] sm:text-[15px] sm:leading-6";
  const buttonClassName = isLanding
    ? `flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white transition-all duration-200 ${
        canSend
          ? "bg-[#ff4500] shadow-[0_10px_24px_rgba(255,69,0,0.28)] hover:bg-[#ff6534] hover:shadow-[0_14px_28px_rgba(255,101,52,0.32)]"
          : "cursor-not-allowed bg-[#262b3b] text-[#6f748d]"
      }`
    : `flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white transition-colors duration-200 sm:h-10 sm:w-10 sm:rounded-xl ${
        canSend
          ? "bg-[#ff4500] hover:bg-[#ff6534]"
          : "cursor-not-allowed bg-[#262b3b] text-[#6f748d]"
      }`;

  useAutosizeTextarea(textareaRef, value, MAX_TEXTAREA_HEIGHT);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSend();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  }

  return (
    <div className={isLanding ? "w-full max-w-[720px]" : "w-full max-w-4xl"}>
      <form onSubmit={handleSubmit} className="w-full">
        <div className={wrapperClassName}>
          <div className="flex items-end gap-3">
            <textarea
              ref={textareaRef}
              rows={1}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What problem are you looking for?"
              className={textareaClassName}
              style={{
                maxHeight: `${MAX_TEXTAREA_HEIGHT}px`,
                scrollbarWidth: "none",
              }}
            />

            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send message"
              className={buttonClassName}
            >
              <ArrowUp
                className={isLanding ? "h-[14px] w-[18px]" : "h-4 w-4 sm:h-[14px] sm:w-[17px]"}
                strokeWidth={2.5}
              />
            </button>
          </div>
        </div>

        {loadingLabel ? (
          <p className="mt-3 text-center text-[13px] text-[#ff6534]">
            {loadingLabel}
          </p>
        ) : hint ? (
          <p className="mt-3 text-center text-[13px] text-[#8b8fa8]">{hint}</p>
        ) : null}
      </form>
    </div>
  );
}
