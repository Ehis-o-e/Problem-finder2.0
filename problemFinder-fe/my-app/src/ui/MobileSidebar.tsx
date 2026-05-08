import { MessageSquare, Plus, X } from "lucide-react";
import type { ChatThread } from "../types/chat.ts";

type MobileSidebarProps = {
  activeChatId: string | null;
  chats: ChatThread[];
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
};

export default function MobileSidebar({
  activeChatId,
  chats,
  isOpen,
  onClose,
  onNewChat,
  onSelectChat,
}: MobileSidebarProps) {
  return (
    <>
      {isOpen ? (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={onClose}
          className="absolute inset-0 z-30 bg-black/45 md:hidden"
        />
      ) : null}

      <aside
        className={`absolute inset-y-0 left-0 z-40 flex w-[264px] shrink-0 flex-col overflow-hidden border-r border-[#23283a] bg-[#121520] shadow-[0_24px_60px_rgba(0,0,0,0.42)] transition-transform duration-200 ease-out md:hidden ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-3 py-4 sm:px-4">
          <span className="min-w-0 flex-1 truncate text-base font-semibold tracking-[-0.01em] text-[#f5f5f5]">
            Problem Finder
          </span>

          <button
          type="button"
          onClick={onClose}
          aria-label="Close sidebar"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff4500] text-white shadow-[0_10px_24px_rgba(255,69,0,0.28)] transition-colors hover:bg-[#ff6534]"
        >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="px-3 pb-3 sm:px-4">
          <button
            type="button"
            onClick={onNewChat}
            className="flex h-11 w-full items-center gap-3 rounded-xl border border-[#2e3250] bg-[#171b26] px-3 text-left text-sm font-medium text-[#f5f5f5] transition-colors hover:bg-[#1e2330]"
          >
            <Plus size={18} strokeWidth={2} className="shrink-0" />
            <span>New chat</span>
          </button>
        </div>

        <div className="px-5 pb-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8b8fa8]">
            Recent
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {chats.length === 0 ? (
            <div className="px-3 py-2 text-sm text-[#8b8fa8]">No chats yet</div>
          ) : null}

          {chats.map((chat) => {
            const isActive = chat.id === activeChatId;

            return (
              <button
                key={chat.id}
                type="button"
                onClick={() => onSelectChat(chat.id)}
                className={`mb-1 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors ${
                  isActive
                    ? "bg-[#1f2431] text-[#f5f5f5]"
                    : "text-[#8b8fa8] hover:bg-[#1a1f2c] hover:text-[#f5f5f5]"
                }`}
              >
                <MessageSquare
                  size={14}
                  strokeWidth={1.8}
                  className="shrink-0 opacity-70"
                />
                <span className="min-w-0 truncate">{chat.title}</span>
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}
