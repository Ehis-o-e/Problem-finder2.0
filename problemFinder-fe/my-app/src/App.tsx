import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  ArrowUp,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  X,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
const MAX_TEXTAREA_HEIGHT = 160;
const DESKTOP_BREAKPOINT = 1024;
const SIDEBAR_OPEN_WIDTH = 264;
const SIDEBAR_COLLAPSED_WIDTH = 56;

type ChatRole = "assistant" | "user";

type ConversationSessionResponse = {
  success: boolean;
  message?: string;
  data?: { sessionId: string };
};

type ConversationChatResponse = {
  success: boolean;
  message?: string;
  data?: {
    intent: "discovery" | "conversation";
    reason: string;
    response: string;
  };
};

type ConversationMessage = {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  tone?: "default" | "error";
};

type ChatThread = {
  id: string;
  title: string;
  sessionId: string | null;
  messages: ConversationMessage[];
  updatedAt: number;
};

const timeFormatter = new Intl.DateTimeFormat([], {
  hour: "2-digit",
  minute: "2-digit",
});

function nowLabel() {
  return timeFormatter.format(new Date());
}

function truncateTitle(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 32) return trimmed || "New chat";
  return `${trimmed.slice(0, 32).trimEnd()}...`;
}

function createThread(firstMessage: string): ChatThread {
  return {
    id: crypto.randomUUID(),
    title: truncateTitle(firstMessage),
    sessionId: null,
    messages: [],
    updatedAt: Date.now(),
  };
}

function renderFormattedMessage(content: string) {
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  const boldPattern = /(\*\*[^*]+\*\*)/g;

  function renderInline(text: string, lineKey: string) {
    return text.split(urlPattern).map((part, partIndex) => {
      if (!part) {
        return null;
      }

      if (/^https?:\/\//.test(part)) {
        return (
          <Fragment key={`${lineKey}-url-${partIndex}`}>
            <a
              href={part}
              target="_blank"
              rel="noreferrer"
              style={{
                color: "var(--color-text-accent)",
                textDecoration: "underline",
                textUnderlineOffset: "2px",
                wordBreak: "break-all",
              }}
            >
              {part}
            </a>
          </Fragment>
        );
      }

      return part.split(boldPattern).map((segment, segmentIndex) => {
        if (!segment) {
          return null;
        }

        if (segment.startsWith("**") && segment.endsWith("**")) {
          return (
            <strong key={`${lineKey}-bold-${partIndex}-${segmentIndex}`}>
              {segment.slice(2, -2)}
            </strong>
          );
        }

        return (
          <Fragment key={`${lineKey}-text-${partIndex}-${segmentIndex}`}>
            {segment}
          </Fragment>
        );
      });
    });
  }

  return content.split("\n").map((line, lineIndex, lines) => {
    const urlMatch = line.match(/https?:\/\/[^\s]+/);
    const upvoteMatch = line.match(/(\d[\d,]*)\s+upvotes/i);

    if (urlMatch && upvoteMatch) {
      const prefix = line
        .slice(0, upvoteMatch.index)
        .replace(
          /\b(?:this issue has gained significant attention with|this issue has|this issue|it has|with)\s*$/i,
          ""
        )
        .replace(/[\s([{]+$/g, "")
        .trim();

      return (
        <Fragment key={`line-${lineIndex}`}>
          {prefix ? (
            <>
              {renderInline(prefix, `line-${lineIndex}-prefix`)}
              <br />
            </>
          ) : null}
          <span>{`${upvoteMatch[1]} upvotes`}</span>
          <br />
          <a
            href={urlMatch[0]}
            target="_blank"
            rel="noreferrer"
            style={{
              color: "var(--color-text-accent)",
              textDecoration: "underline",
              textUnderlineOffset: "2px",
              fontWeight: 600,
              display: "inline-block",
            }}
          >
            Read discussion
          </a>
          {lineIndex < lines.length - 1 ? <br /> : null}
        </Fragment>
      );
    }

    return (
      <Fragment key={`line-${lineIndex}`}>
        {renderInline(line, `line-${lineIndex}`)}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </Fragment>
    );
  });
}

function getInitialDesktopState() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.innerWidth >= DESKTOP_BREAKPOINT;
}

export default function App() {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const chatsRef = useRef<ChatThread[]>([]);

  const [isDesktop, setIsDesktop] = useState(getInitialDesktopState);
  const [sidebarExpanded, setSidebarExpanded] = useState(getInitialDesktopState);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [input, setInput] = useState("");
  const [composerHint, setComposerHint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [chats, setChats] = useState<ChatThread[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    function syncLayout() {
      const nextDesktop = window.innerWidth >= DESKTOP_BREAKPOINT;
      setIsDesktop(nextDesktop);

      if (nextDesktop) {
        setMobileSidebarOpen(false);
      }
    }

    syncLayout();
    window.addEventListener("resize", syncLayout);
    return () => window.removeEventListener("resize", syncLayout);
  }, []);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? null,
    [activeChatId, chats]
  );

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChatId, activeChat?.messages.length, isLoading]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [input]);

  function updateChat(chatId: string, updater: (chat: ChatThread) => ChatThread) {
    setChats((currentChats) => {
      const nextChats = currentChats
        .map((chat) => (chat.id === chatId ? updater(chat) : chat))
        .sort((first, second) => second.updatedAt - first.updatedAt);

      chatsRef.current = nextChats;
      return nextChats;
    });
  }

  function appendMessage(chatId: string, message: ConversationMessage) {
    updateChat(chatId, (chat) => ({
      ...chat,
      messages: [...chat.messages, message],
      updatedAt: Date.now(),
    }));
  }

  function createChatFromMessage(firstMessage: string): string {
    const nextChat = createThread(firstMessage);

    setChats((currentChats) => {
      const nextChats = [nextChat, ...currentChats];
      chatsRef.current = nextChats;
      return nextChats;
    });
    setActiveChatId(nextChat.id);

    return nextChat.id;
  }

  async function ensureSession(chatId: string): Promise<string> {
    const existingChat = chatsRef.current.find((chat) => chat.id === chatId);

    if (existingChat?.sessionId) {
      return existingChat.sessionId;
    }

    const response = await fetch(`${API_BASE_URL}/conversation/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const payload = (await response.json()) as ConversationSessionResponse;
    if (!response.ok || !payload.success || !payload.data?.sessionId) {
      throw new Error(payload.message ?? "Could not create session.");
    }

    updateChat(chatId, (chat) => ({
      ...chat,
      sessionId: payload.data!.sessionId,
      updatedAt: Date.now(),
    }));

    return payload.data.sessionId;
  }

  async function sendQuery(query: string) {
    const text = query.trim();
    if (!text) {
      setComposerHint("Type a message first.");
      return;
    }

    const targetId = activeChatId ?? createChatFromMessage(text);

    setComposerHint(null);
    setInput("");
    setIsLoading(true);

    appendMessage(targetId, {
      id: `user-${crypto.randomUUID()}`,
      role: "user",
      content: text,
      timestamp: nowLabel(),
    });

    try {
      const sessionId = await ensureSession(targetId);
      const response = await fetch(`${API_BASE_URL}/conversation/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });

      const payload = (await response.json()) as ConversationChatResponse;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.message ?? "Assistant failed to respond.");
      }

      appendMessage(targetId, {
        id: `assistant-${crypto.randomUUID()}`,
        role: "assistant",
        content: payload.data.response,
        timestamp: nowLabel(),
      });

      if (!isDesktop) {
        setMobileSidebarOpen(false);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong.";

      appendMessage(targetId, {
        id: `assistant-error-${crypto.randomUUID()}`,
        role: "assistant",
        content: `Couldn't respond: ${message}`,
        timestamp: nowLabel(),
        tone: "error",
      });
      setComposerHint(message);
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendQuery(input);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendQuery(input);
    }
  }

  function handleNewChat() {
    setActiveChatId(null);
    setInput("");
    setComposerHint(null);
    setIsLoading(false);

    if (!isDesktop) {
      setMobileSidebarOpen(false);
    }
  }

  const canSend = input.trim().length > 0 && !isLoading;
  const visibleMessages =
    activeChat?.messages.length || isLoading
      ? (activeChat?.messages ?? [])
      : [
          {
            id: "welcome",
            role: "assistant" as const,
            content: "Hi! How can I help you today?",
            timestamp: nowLabel(),
          },
        ];

  const headerTitle = activeChat?.title ?? "New chat";
  const hoverBg = (element: HTMLElement) => {
    element.style.backgroundColor = "var(--color-overlay-soft)";
  };
  const unhoverBg = (element: HTMLElement) => {
    element.style.backgroundColor = "transparent";
  };
  const activeBg = "var(--color-overlay-strong)";

  if (isDesktop) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          backgroundColor: "var(--color-background-primary)",
          color: "var(--color-text-primary)",
        }}
      >
        <aside
          style={{
            width: sidebarExpanded
              ? `${SIDEBAR_OPEN_WIDTH}px`
              : `${SIDEBAR_COLLAPSED_WIDTH}px`,
            minWidth: sidebarExpanded
              ? `${SIDEBAR_OPEN_WIDTH}px`
              : `${SIDEBAR_COLLAPSED_WIDTH}px`,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            backgroundColor: "var(--color-background-secondary)",
            borderRight: "1px solid var(--color-border-primary)",
            transition: "width 0.22s ease, min-width 0.22s ease",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: sidebarExpanded ? "space-between" : "center",
              padding: sidebarExpanded ? "16px 10px 14px 16px" : "16px 0 14px",
              flexShrink: 0,
            }}
          >
            {sidebarExpanded && (
              <span
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  color: "var(--color-text-primary)",
                  letterSpacing: "-0.01em",
                }}
              >
                Problem Finder Chat
              </span>
            )}
            <button
              type="button"
              onClick={() => setSidebarExpanded((value) => !value)}
              aria-label={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
              onMouseEnter={(event) => hoverBg(event.currentTarget)}
              onMouseLeave={(event) => unhoverBg(event.currentTarget)}
              style={{
                width: "34px",
                height: "34px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "8px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "var(--color-text-muted)",
                flexShrink: 0,
                transition: "background 0.15s",
              }}
            >
              {sidebarExpanded ? (
                <PanelLeftClose size={18} strokeWidth={2} />
              ) : (
                <PanelLeftOpen size={18} strokeWidth={2} />
              )}
            </button>
          </div>

          <div style={{ padding: "4px 8px 8px", flexShrink: 0 }}>
            <button
              type="button"
              onClick={handleNewChat}
              onMouseEnter={(event) => hoverBg(event.currentTarget)}
              onMouseLeave={(event) => unhoverBg(event.currentTarget)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                width: "100%",
                padding: sidebarExpanded ? "10px 12px" : "10px 0",
                justifyContent: sidebarExpanded ? "flex-start" : "center",
                borderRadius: "10px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "var(--color-text-primary)",
                fontSize: "16px",
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                transition: "background 0.15s",
              }}
            >
              <Plus size={18} strokeWidth={2} style={{ flexShrink: 0 }} />
              {sidebarExpanded && <span>New chat</span>}
            </button>
          </div>

          {sidebarExpanded && (
            <div style={{ padding: "8px 20px 6px", flexShrink: 0 }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--color-text-muted)",
                }}
              >
                Recent
              </span>
            </div>
          )}

          <div style={{ flex: 1, overflowY: "auto", padding: "2px 8px 16px" }}>
            {chats.map((chat) => {
              const isActive = chat.id === activeChatId;

              return (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => {
                    setActiveChatId(chat.id);
                    setComposerHint(null);
                  }}
                  onMouseEnter={(event) => {
                    if (!isActive) hoverBg(event.currentTarget);
                  }}
                  onMouseLeave={(event) => {
                    if (!isActive) unhoverBg(event.currentTarget);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    width: "100%",
                    padding: sidebarExpanded ? "9px 12px" : "9px 0",
                    justifyContent: sidebarExpanded ? "flex-start" : "center",
                    borderRadius: "10px",
                    border: "none",
                    background: isActive ? activeBg : "transparent",
                    cursor: "pointer",
                    color: isActive
                      ? "var(--color-text-primary)"
                      : "var(--color-text-secondary)",
                    fontSize: "15px",
                    textAlign: "left",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    transition: "background 0.15s, color 0.15s",
                    marginBottom: "2px",
                  }}
                >
                  <MessageSquare
                    size={15}
                    strokeWidth={1.8}
                    style={{ flexShrink: 0, opacity: 0.65 }}
                  />
                  {sidebarExpanded && (
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {chat.title}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        <main
          style={{
            flex: 1,
            minWidth: 0,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            backgroundColor: "var(--color-surface-primary)",
          }}
        >
          <header
            style={{
              height: "58px",
              minHeight: "58px",
              display: "flex",
              alignItems: "center",
              padding: "0 24px",
              borderBottom: "1px solid var(--color-border-primary)",
              flexShrink: 0,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: "18px",
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "var(--color-text-primary)",
              }}
            >
              {headerTitle}
            </h2>
          </header>

          <section
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "24px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            {visibleMessages.map((message) => {
              const isAssistant = message.role === "assistant";

              return (
                <div
                  key={message.id}
                  className="message-in"
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    flexDirection: isAssistant ? "row" : "row-reverse",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      width: "34px",
                      height: "34px",
                      minWidth: "34px",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                      fontWeight: 700,
                      flexShrink: 0,
                      backgroundColor: isAssistant
                        ? "var(--color-avatar-assistant)"
                        : "var(--color-avatar-user)",
                      color: isAssistant
                        ? "var(--color-text-accent)"
                        : "var(--color-avatar-user-text)",
                    }}
                  >
                    {isAssistant ? "AI" : "You"}
                  </div>

                  <div
                    style={{
                      maxWidth: "78%",
                      padding: "12px 16px",
                      borderRadius: isAssistant
                        ? "4px 16px 16px 16px"
                        : "16px 4px 16px 16px",
                      fontSize: "16px",
                      lineHeight: "1.65",
                      backgroundColor: isAssistant
                        ? "var(--color-assistant-bubble)"
                        : "var(--color-user-bubble)",
                      color: "var(--color-text-primary)",
                      border: "1px solid var(--color-border-primary)",
                      opacity: message.tone === "error" ? 0.7 : 1,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {renderFormattedMessage(message.content)}
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div
                className="message-in"
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    width: "34px",
                    height: "34px",
                    minWidth: "34px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    fontWeight: 700,
                    flexShrink: 0,
                    backgroundColor: "var(--color-avatar-assistant)",
                    color: "var(--color-text-accent)",
                  }}
                >
                  AI
                </div>
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "4px 16px 16px 16px",
                    fontSize: "16px",
                    backgroundColor: "var(--color-assistant-bubble)",
                    border: "1px solid var(--color-border-primary)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  Thinking...
                </div>
              </div>
            )}

            <div ref={threadEndRef} />
          </section>

          <form
            onSubmit={handleSubmit}
            style={{
              flexShrink: 0,
              padding: "12px 20px 20px",
              borderTop: "1px solid var(--color-border-primary)",
              backgroundColor: "var(--color-surface-primary)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: "10px",
                padding: "10px 10px 10px 16px",
                borderRadius: "16px",
                border: "1.5px solid var(--color-border-strong)",
                backgroundColor: "var(--color-surface-primary)",
                transition: "border-color 0.15s",
              }}
              onFocusCapture={(event) => {
                (event.currentTarget as HTMLDivElement).style.borderColor =
                  "var(--color-text-accent)";
              }}
              onBlurCapture={(event) => {
                (event.currentTarget as HTMLDivElement).style.borderColor =
                  "var(--color-border-strong)";
              }}
            >
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What Problem Are You Looking For?"
                style={{
                  flex: 1,
                  border: "none",
                  background: "none",
                  outline: "none",
                  resize: "none",
                  fontSize: "16px",
                  lineHeight: "1.55",
                  color: "var(--color-text-primary)",
                  minHeight: "26px",
                  maxHeight: `${MAX_TEXTAREA_HEIGHT}px`,
                  padding: 0,
                  scrollbarWidth: "none",
                }}
              />
              <button
                type="submit"
                disabled={!canSend}
                aria-label="Send message"
                style={{
                  width: "36px",
                  height: "30px",
                  minWidth: "36px",
                  borderRadius: "10px",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: canSend ? "pointer" : "not-allowed",
                  backgroundColor: canSend
                    ? "var(--color-accent-primary)"
                    : "var(--color-surface-tertiary)",
                  color: canSend
                    ? "var(--color-accent-foreground)"
                    : "var(--color-text-muted)",
                  transition: "background-color 0.15s, opacity 0.15s",
                  flexShrink: 0,
                }}
              >
                <ArrowUp size={17} strokeWidth={2.5} />
              </button>
            </div>

            {composerHint && (
              <p
                style={{
                  marginTop: "4px",
                  textAlign: "center",
                  fontSize: "13px",
                  color: "var(--color-text-secondary)",
                }}
              >
                {composerHint}
              </p>
            )}
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-background-primary)] text-[var(--color-text-primary)]">
      {mobileSidebarOpen ? (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setMobileSidebarOpen(false)}
          className="absolute inset-0 z-30 bg-black/35"
        />
      ) : null}

      <aside
        className={`absolute left-0 top-0 z-40 flex h-screen w-[264px] shrink-0 flex-col overflow-hidden border-r border-[var(--color-border-primary)] bg-[var(--color-background-secondary)] shadow-xl transition-transform duration-200 ease-out ${
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-3 py-3 sm:px-4">
          <span className="min-w-0 flex-1 truncate text-base font-semibold tracking-[-0.01em]">
            Problem Finder Chat
          </span>

          <button
            type="button"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close sidebar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-overlay-soft)]"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="px-3 pb-3 sm:px-4">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex h-10 w-full items-center gap-3 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-primary)] px-3 text-left text-sm font-medium transition-colors hover:bg-[var(--color-surface-secondary)]"
          >
            <Plus size={18} strokeWidth={2} className="shrink-0" />
            <span>New chat</span>
          </button>
        </div>

        <div className="px-5 pb-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
            Recent
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {chats.length === 0 ? (
            <div className="px-3 py-2 text-sm text-[var(--color-text-muted)]">
              No chats yet
            </div>
          ) : null}

          {chats.map((chat) => {
            const isActive = chat.id === activeChatId;

            return (
              <button
                key={chat.id}
                type="button"
                onClick={() => {
                  setActiveChatId(chat.id);
                  setComposerHint(null);
                  setMobileSidebarOpen(false);
                }}
                className={`mb-1 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors ${
                  isActive
                    ? "bg-[var(--color-overlay-strong)] text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-overlay-soft)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                <MessageSquare size={10} strokeWidth={1.8} className="shrink-0 opacity-70" />
                <span className="min-w-0 truncate">{chat.title}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--color-surface-primary)]">
        <header className="flex h-14 min-h-[56px] shrink-0 items-center gap-3 border-b border-[var(--color-border-primary)] px-4 sm:px-5">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open sidebar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-overlay-soft)]"
          >
            <Menu size={18} strokeWidth={2} />
          </button>

          <h2 className="min-w-0 truncate text-base font-semibold sm:text-lg">
            {headerTitle}
          </h2>
        </header>

        <section className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 sm:gap-5">
            {visibleMessages.map((message) => {
              const isAssistant = message.role === "assistant";

              return (
                <div
                  key={message.id}
                  className={`message-in flex w-full items-start gap-2.5 sm:gap-3 ${
                    isAssistant ? "flex-row" : "flex-row-reverse"
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold sm:h-[34px] sm:w-[34px] sm:text-[12px] ${
                      isAssistant
                        ? "bg-[var(--color-avatar-assistant)] text-[var(--color-text-accent)]"
                        : "bg-[var(--color-avatar-user)] text-[var(--color-avatar-user-text)]"
                    }`}
                  >
                    {isAssistant ? "AI" : "You"}
                  </div>

                  <div
                    className={`max-w-[85%] rounded-2xl border px-3 py-2.5 text-[15px] leading-6 sm:max-w-[78%] sm:px-4 ${
                      isAssistant
                        ? "rounded-tl-[4px] border-[var(--color-border-primary)] bg-[var(--color-assistant-bubble)]"
                        : "rounded-tr-[4px] border-[var(--color-border-primary)] bg-[var(--color-user-bubble)]"
                    } ${
                      message.tone === "error" ? "opacity-75" : ""
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">
                      {renderFormattedMessage(message.content)}
                    </p>
                  </div>
                </div>
              );
            })}

            {isLoading ? (
              <div className="message-in flex items-start gap-2.5 sm:gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-avatar-assistant)] text-[11px] font-semibold text-[var(--color-text-accent)] sm:h-[34px] sm:w-[34px] sm:text-[12px]">
                  AI
                </div>
                <div className="rounded-2xl rounded-tl-[4px] border border-[var(--color-border-primary)] bg-[var(--color-assistant-bubble)] px-3 py-2.5 text-[15px] text-[var(--color-text-muted)] sm:px-4">
                  Thinking...
                </div>
              </div>
            ) : null}

            <div ref={threadEndRef} />
          </div>
        </section>

        <form
          onSubmit={handleSubmit}
          className="shrink-0 border-t border-[var(--color-border-primary)] bg-[var(--color-surface-primary)] px-3 py-3 sm:px-5 sm:py-4"
        >
          <div className="mx-auto w-full max-w-4xl">
            <div className="flex items-end gap-2 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-primary)] px-2.5 py-2.5 sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What Problem Are You Looking For?"
                className="block min-h-[24px] flex-1 appearance-none resize-none border-0 bg-transparent text-[14px] leading-5 outline-none placeholder:text-[var(--color-text-muted)] sm:min-h-[26px] sm:text-[15px] sm:leading-6"
                style={{
                  maxHeight: `${MAX_TEXTAREA_HEIGHT}px`,
                }}
              />

              <button
                type="submit"
                disabled={!canSend}
                aria-label="Send message"
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors sm:h-10 sm:w-10 sm:rounded-xl ${
                  canSend
                    ? "bg-[var(--color-accent-primary)] text-[var(--color-accent-foreground)]"
                    : "bg-[var(--color-surface-tertiary)] text-[var(--color-text-muted)]"
                }`}
              >
                <ArrowUp className="h-4 w-4 sm:h-[17px] sm:w-[17px]" strokeWidth={2.5} />
              </button>
            </div>

            {composerHint ? (
              <p className="mt-1 text-center text-[12px] text-[var(--color-text-secondary)] sm:text-[13px]">
                {composerHint}
              </p>
            ) : null}
          </div>
        </form>
      </main>
    </div>
  );
}
