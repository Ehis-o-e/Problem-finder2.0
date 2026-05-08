import { useEffect, useRef, useState } from "react";
import type { ChatThread, ConversationMessage } from "../types/chat.ts";
import {
  createConversationSession,
  sendConversationMessage,
} from "../service/conversation.ts";
import { getLoadingStageLabel, useLoadingStage } from "./useLoadingStage.ts";

const DESKTOP_BREAKPOINT = 1024;
const VIEW_TRANSITION_MS = 460;
const LANDING_HEADLINES = [
  "Find problems worth solving",
  "What problem space should we explore?",
] as const;

function nowLabel() {
  return new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function truncateTitle(value: string) {
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

function getInitialDesktopState() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.innerWidth >= DESKTOP_BREAKPOINT;
}

export function useChatExperience() {
  const messagesContainerRef = useRef<HTMLElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const chatsRef = useRef<ChatThread[]>([]);
  const introTransitionRef = useRef<number | null>(null);

  const [isDesktop, setIsDesktop] = useState(getInitialDesktopState);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [input, setInput] = useState("");
  const [composerHint, setComposerHint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [chats, setChats] = useState<ChatThread[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [showLanding, setShowLanding] = useState(true);
  const [isTransitioningToChat, setIsTransitioningToChat] = useState(false);
  const [landingHeadline] = useState(
    () =>
      LANDING_HEADLINES[
        Math.floor(Math.random() * LANDING_HEADLINES.length)
      ]
  );

  const loadingStage = useLoadingStage(isLoading);
  const loadingLabel = getLoadingStageLabel(loadingStage);

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

  useEffect(() => {
    return () => {
      if (introTransitionRef.current !== null) {
        window.clearTimeout(introTransitionRef.current);
      }
    };
  }, []);

  const activeChat =
    chats.find((chat) => chat.id === activeChatId) ?? null;

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [activeChat?.messages.length, activeChatId, isLoading]);

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

  function createChatFromMessage(firstMessage: string) {
    const nextChat = createThread(firstMessage);

    setChats((currentChats) => {
      const nextChats = [nextChat, ...currentChats];
      chatsRef.current = nextChats;
      return nextChats;
    });
    setActiveChatId(nextChat.id);

    return nextChat.id;
  }

  async function ensureSession(chatId: string) {
    const existingChat = chatsRef.current.find((chat) => chat.id === chatId);

    if (existingChat?.sessionId) {
      return existingChat.sessionId;
    }

    const sessionId = await createConversationSession();

    updateChat(chatId, (chat) => ({
      ...chat,
      sessionId,
      updatedAt: Date.now(),
    }));

    return sessionId;
  }

  function beginChatTransition() {
    if (introTransitionRef.current !== null) {
      window.clearTimeout(introTransitionRef.current);
    }

    setIsTransitioningToChat(true);
    introTransitionRef.current = window.setTimeout(() => {
      setShowLanding(false);
      setIsTransitioningToChat(false);
      introTransitionRef.current = null;
    }, VIEW_TRANSITION_MS);
  }

  async function sendQuery(query: string) {
    const text = query.trim();
    if (!text) {
      setComposerHint("Type a message first.");
      return;
    }

    const isFirstSessionMessage = showLanding && !isTransitioningToChat;
    const targetId = activeChatId ?? createChatFromMessage(text);

    if (isFirstSessionMessage) {
      beginChatTransition();
    }

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
      const payload = await sendConversationMessage(sessionId, text);

      appendMessage(targetId, {
        id: `assistant-${crypto.randomUUID()}`,
        role: "assistant",
        content: payload.response,
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

  function handleNewChat() {
    setActiveChatId(null);
    setInput("");
    setComposerHint(null);
    setIsLoading(false);
    setShowLanding(true);
    setIsTransitioningToChat(false);

    if (introTransitionRef.current !== null) {
      window.clearTimeout(introTransitionRef.current);
      introTransitionRef.current = null;
    }

    if (!isDesktop) {
      setMobileSidebarOpen(false);
    }
  }

  function selectChat(chatId: string) {
    setActiveChatId(chatId);
    setComposerHint(null);
    setShowLanding(false);
    setIsTransitioningToChat(false);
    setMobileSidebarOpen(false);
  }

  return {
    activeChat,
    activeChatId,
    canSend: input.trim().length > 0 && !isLoading,
    chats,
    composerHint,
    headerTitle: activeChat?.title ?? "New chat",
    input,
    isDesktop,
    isLoading,
    isTransitioningToChat,
    landingHeadline,
    loadingLabel,
    mobileSidebarOpen,
    messagesContainerRef,
    setInput,
    setMobileSidebarOpen,
    setSidebarExpanded,
    sendCurrentInput: () => void sendQuery(input),
    selectChat,
    handleNewChat,
    setComposerHint,
    showLanding,
    sidebarExpanded,
    threadEndRef,
    transitionDurationMs: VIEW_TRANSITION_MS,
    visibleMessages: activeChat?.messages ?? [],
  };
}
