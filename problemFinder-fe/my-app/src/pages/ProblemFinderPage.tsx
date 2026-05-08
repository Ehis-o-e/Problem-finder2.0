import { Menu } from "lucide-react";
import { useChatExperience } from "../hooks/useChatExperience.ts";
import ChatComposer from "../ui/ChatComposer.tsx";
import ChatMessages from "../ui/ChatMessages.tsx";
import DesktopSidebar from "../ui/DesktopSidebar.tsx";
import LandingPanel from "../ui/LandingPanel.tsx";
import MobileSidebar from "../ui/MobileSidebar.tsx";

export default function ProblemFinderPage() {
  const {
    activeChatId,
    canSend,
    chats,
    composerHint,
    headerTitle,
    input,
    isDesktop,
    isLoading,
    isTransitioningToChat,
    landingHeadline,
    loadingLabel,
    mobileSidebarOpen,
    messagesContainerRef,
    selectChat,
    handleNewChat,
    sendCurrentInput,
    setInput,
    setMobileSidebarOpen,
    setSidebarExpanded,
    showLanding,
    sidebarExpanded,
    threadEndRef,
    transitionDurationMs,
    visibleMessages,
  } = useChatExperience();
  const showChatShell = !showLanding || isTransitioningToChat;

  return (
    <div className="fixed inset-0 flex min-h-0 overflow-hidden overscroll-none bg-[#0f1117] text-[#f5f5f5]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-10%] top-[-18%] h-[26rem] w-[26rem] rounded-full bg-[#ff4500]/8 blur-3xl" />
        <div className="absolute bottom-[-18%] right-[-8%] h-[24rem] w-[24rem] rounded-full bg-[#25314a]/34 blur-3xl" />
      </div>

      <MobileSidebar
        activeChatId={activeChatId}
        chats={chats}
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
        onNewChat={handleNewChat}
        onSelectChat={selectChat}
      />

      <DesktopSidebar
        activeChatId={activeChatId}
        chats={chats}
        onNewChat={handleNewChat}
        onSelectChat={selectChat}
        onToggle={() => setSidebarExpanded((value) => !value)}
        sidebarExpanded={sidebarExpanded}
      />

      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#11141d]">
        {!isDesktop && showLanding ? (
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open sidebar"
            className="absolute left-4 top-4 z-30 flex h-11 w-11 items-center justify-center rounded-xl bg-[#ff4500] text-white shadow-[0_10px_24px_rgba(255,69,0,0.28)] transition-colors hover:bg-[#ff6534]"
          >
            <Menu size={19} strokeWidth={2} />
          </button>
        ) : null}

        {showChatShell ? (
          <>
            <header className="flex h-14 min-h-[56px] shrink-0 items-center gap-3 border-b border-[#23283a] bg-[#11141d] px-4 sm:px-5">
              {!isDesktop ? (
                <button
                  type="button"
                  onClick={() => setMobileSidebarOpen(true)}
                  aria-label="Open sidebar"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff4500] text-white shadow-[0_10px_24px_rgba(255,69,0,0.28)] transition-colors hover:bg-[#ff6534]"
                >
                  <Menu size={18} strokeWidth={2} />
                </button>
              ) : null}

              <h2 className="min-w-0 truncate text-base font-semibold text-[#f5f5f5] sm:text-lg">
                {headerTitle}
              </h2>
            </header>

            <ChatMessages
              containerRef={messagesContainerRef}
              isLoading={isLoading}
              loadingLabel={loadingLabel}
              messages={visibleMessages}
              threadEndRef={threadEndRef}
            />

            <div className="shrink-0 border-t border-[#23283a] bg-[#11141d] px-3 py-3 sm:px-5 sm:py-4">
              <div className="mx-auto w-full max-w-4xl">
                <ChatComposer
                  value={input}
                  onChange={setInput}
                  onSend={sendCurrentInput}
                  canSend={canSend}
                  hint={composerHint}
                  loadingLabel={loadingLabel}
                  variant="chat"
                />
              </div>
            </div>
          </>
        ) : null}

        <LandingPanel
          canSend={canSend}
          composerHint={composerHint}
          headline={landingHeadline}
          input={input}
          isTransitioning={isTransitioningToChat}
          loadingLabel={loadingLabel}
          onChangeInput={setInput}
          onSend={sendCurrentInput}
          show={showLanding}
          transitionDurationMs={transitionDurationMs}
        />
      </main>
    </div>
  );
}
