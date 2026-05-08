import {
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "lucide-react";
import type { ChatThread } from "../types/chat.ts";

const SIDEBAR_OPEN_WIDTH = 264;
const SIDEBAR_COLLAPSED_WIDTH = 72;

type DesktopSidebarProps = {
  activeChatId: string | null;
  chats: ChatThread[];
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onToggle: () => void;
  sidebarExpanded: boolean;
};

export default function DesktopSidebar({
  activeChatId,
  chats,
  onNewChat,
  onSelectChat,
  onToggle,
  sidebarExpanded,
}: DesktopSidebarProps) {
  return (
    <aside
      className="hidden h-full shrink-0 flex-col overflow-hidden border-r border-[#23283a] bg-[#121520] md:flex"
      style={{
        width: sidebarExpanded ? `${SIDEBAR_OPEN_WIDTH}px` : `${SIDEBAR_COLLAPSED_WIDTH}px`,
        minWidth: sidebarExpanded
          ? `${SIDEBAR_OPEN_WIDTH}px`
          : `${SIDEBAR_COLLAPSED_WIDTH}px`,
        transition: "width 220ms ease, min-width 220ms ease",
      }}
    >
      <div
        className={`flex items-center px-3 pb-3 pt-4 ${
          sidebarExpanded ? "justify-between" : "justify-center"
        }`}
      >
        {sidebarExpanded ? (
          <span className="truncate text-base font-semibold tracking-[-0.01em] text-[#f5f5f5]">
            Problem Finder
          </span>
        ) : null}

        <button
          type="button"
          onClick={onToggle}
          aria-label={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff4500] text-white shadow-[0_10px_24px_rgba(255,69,0,0.28)] transition-all duration-200 hover:bg-[#ff6534]"
        >
          {sidebarExpanded ? (
            <PanelLeftClose size={18} strokeWidth={2} />
          ) : (
            <PanelLeftOpen size={18} strokeWidth={2} />
          )}
        </button>
      </div>

      <div className="px-2 pb-3">
        <button
          type="button"
          onClick={onNewChat}
          className={`flex h-11 w-full items-center rounded-xl border border-[#2e3250] bg-[#171b26] px-3 text-sm font-medium text-[#f5f5f5] transition-colors duration-200 hover:bg-[#1e2330] ${
            sidebarExpanded ? "justify-start gap-3" : "justify-center"
          }`}
        >
          <Plus size={18} strokeWidth={2} className="shrink-0" />
          {sidebarExpanded ? <span>New chat</span> : null}
        </button>
      </div>

      {sidebarExpanded ? (
        <div className="px-5 pb-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8b8fa8]">
            Recent
          </span>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {chats.map((chat) => {
          const isActive = chat.id === activeChatId;

          return (
            <button
              key={chat.id}
              type="button"
              onClick={() => onSelectChat(chat.id)}
              className={`mb-1 flex h-10 w-full items-center rounded-lg px-3 text-left text-sm transition-colors ${
                sidebarExpanded ? "gap-3" : "justify-center"
              } ${
                isActive
                  ? "bg-[#1f2431] text-[#f5f5f5]"
                  : "text-[#8b8fa8] hover:bg-[#1a1f2c] hover:text-[#f5f5f5]"
              }`}
              title={chat.title}
            >
              <MessageSquare
                size={15}
                strokeWidth={1.8}
                className="shrink-0 opacity-70"
              />
              {sidebarExpanded ? (
                <span className="min-w-0 truncate">{chat.title}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
