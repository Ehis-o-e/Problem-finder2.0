import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import "./App.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
const MAX_TEXTAREA_HEIGHT = 160;

type ChatRole = "assistant" | "user";
type ChatStatus = "Ready" | "Processing" | "Error";

type ConversationSessionResponse = {
  success: boolean;
  message?: string;
  data?: {
    sessionId: string;
  };
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

const timeFormatter = new Intl.DateTimeFormat([], {
  hour: "2-digit",
  minute: "2-digit",
});

function nowLabel(): string {
  return timeFormatter.format(new Date());
}

function App() {
  const inputId = useId();
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("Ready");
  const [composerHint, setComposerHint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [input]);

  const canSend = input.trim().length >= 2 && !isLoading;

  async function ensureSession(): Promise<string> {
    if (sessionIdRef.current) {
      return sessionIdRef.current;
    }

    const response = await fetch(`${API_BASE_URL}/conversation/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const payload = (await response.json()) as ConversationSessionResponse;

    if (!response.ok || !payload.success || !payload.data?.sessionId) {
      throw new Error(
        payload.message || "The app could not create a new conversation session."
      );
    }

    sessionIdRef.current = payload.data.sessionId;
    return payload.data.sessionId;
  }

  async function sendQuery(query: string) {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      setStatus("Error");
      setComposerHint("Type at least 2 characters before sending.");
      return;
    }

    const userMessage: ConversationMessage = {
      id: `user-${crypto.randomUUID()}`,
      role: "user",
      content: trimmedQuery,
      timestamp: nowLabel(),
    };

    setComposerHint(null);
    setInput("");
    setIsLoading(true);
    setStatus("Processing");
    setMessages((currentMessages) => [...currentMessages, userMessage]);

    try {
      const sessionId = await ensureSession();

      const response = await fetch(`${API_BASE_URL}/conversation/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          message: trimmedQuery,
        }),
      });

      const payload = (await response.json()) as ConversationChatResponse;

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(
          payload.message || "The assistant could not finish the conversation."
        );
      }

      setStatus("Ready");
      const conversationData = payload.data;
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `assistant-${crypto.randomUUID()}`,
          role: "assistant",
          content: conversationData.response,
          timestamp: nowLabel(),
        },
      ]);
    } catch (caughtError) {
      const errorMessage =
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong while processing that query.";

      setStatus("Error");
      setComposerHint(errorMessage);
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `assistant-error-${crypto.randomUUID()}`,
          role: "assistant",
          content: `I hit a problem while trying to respond: ${errorMessage}`,
          timestamp: nowLabel(),
          tone: "error",
        },
      ]);
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

  function handleReset() {
    sessionIdRef.current = null;
    setMessages([]);
    setInput("");
    setComposerHint(null);
    setIsLoading(false);
    setStatus("Ready");
  }

  return (
    <main className="chat-page">
      <section className="chat-shell">
        <header className="chat-header">
          <div className="chat-header-copy">
            <h1>Problem Finder</h1>
            <p>
              Discover real problems, ask follow-up questions, and keep the whole
              conversation flowing like a normal chat.
            </p>
          </div>

          <div className="chat-header-meta">
            <div className={`status-indicator status-${status.toLowerCase()}`}>
              <span className="status-dot" aria-hidden="true" />
              <span>{status}</span>
            </div>

            <button className="header-button" type="button" onClick={handleReset}>
              New Chat
            </button>
          </div>
        </header>

        <section className="message-panel">
          {messages.length === 0 && !isLoading ? (
            <div className="empty-state">
              <div className="empty-state-icon" aria-hidden="true">
                PF
              </div>
              <h2>No conversation yet</h2>
              <p>
                Ask for problems in an area like finance, education, or technology,
                then keep chatting naturally with follow-ups like "tell me more about
                the first one" or "give me 5 more".
              </p>
            </div>
          ) : (
            <div className="message-thread">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`message-row message-row-${message.role}`}
                >
                  {message.role === "assistant" ? (
                    <div className="assistant-avatar" aria-hidden="true">
                      PF
                    </div>
                  ) : null}

                  <div className={`message-stack message-stack-${message.role}`}>
                    <div
                      className={`message-bubble message-bubble-${message.role} ${
                        message.tone === "error" ? "message-bubble-error" : ""
                      }`}
                    >
                      <p className="message-text">{message.content}</p>
                    </div>

                    <span className="message-timestamp">{message.timestamp}</span>
                  </div>
                </article>
              ))}

              {isLoading ? (
                <article className="message-row message-row-assistant">
                  <div className="assistant-avatar" aria-hidden="true">
                    PF
                  </div>
                  <div className="message-stack message-stack-assistant">
                    <div className="message-bubble message-bubble-assistant typing-bubble">
                      <div className="typing-indicator" aria-label="Assistant is typing">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                    <span className="message-timestamp">Processing...</span>
                  </div>
                </article>
              ) : null}

              <div ref={threadEndRef} />
            </div>
          )}
        </section>

        <footer className="input-panel">
          <form className="composer" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor={inputId}>
              Enter your query
            </label>
            <div className="composer-field">
              <textarea
                id={inputId}
                ref={textareaRef}
                className="composer-textarea"
                rows={1}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask for problems, ask for more, or discuss one in detail..."
              />

              <button className="send-button" type="submit" disabled={!canSend}>
                <span aria-hidden="true">&gt;</span>
              </button>
            </div>
          </form>

          {composerHint ? <p className="composer-hint">{composerHint}</p> : null}
        </footer>
      </section>
    </main>
  );
}

export default App;
