import ChatComposer from "./ChatComposer.tsx";

type LandingPanelProps = {
  canSend: boolean;
  composerHint: string | null;
  headline: string;
  input: string;
  isTransitioning: boolean;
  loadingLabel: string | null;
  onChangeInput: (value: string) => void;
  onSend: () => void;
  show: boolean;
  transitionDurationMs: number;
};

export default function LandingPanel({
  canSend,
  composerHint,
  headline,
  input,
  isTransitioning,
  loadingLabel,
  onChangeInput,
  onSend,
  show,
  transitionDurationMs,
}: LandingPanelProps) {
  if (!show) {
    return null;
  }

  return (
    <div
      className={`absolute inset-0 z-20 overflow-y-auto overscroll-contain px-4 pt-6 pb-3 transition-all ease-[cubic-bezier(0.22,1,0.36,1)] sm:pt-10 sm:pb-4 ${
        isTransitioning
          ? "-translate-y-20 opacity-0 pointer-events-none"
          : "translate-y-0 opacity-100"
      }`}
      style={{
        transitionDuration: `${transitionDurationMs}ms`,
        scrollbarWidth: "none",
      }}
    >
      <div className="relative mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center text-center">
        <div className="absolute inset-x-[20%] top-1/2 h-32 -translate-y-[180px] rounded-full bg-[#ff4500]/12 blur-3xl" />
        <h1 className="relative max-w-[14ch] text-[clamp(2rem,5vw,3.6rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-[#f5f5f5]">
          {headline}
        </h1>
        <p className="relative mt-4 text-sm text-[#8b8fa8] sm:text-base">
          Powered by real Reddit conversations
        </p>
        <div className="relative mt-7 w-full">
          <ChatComposer
            value={input}
            onChange={onChangeInput}
            onSend={onSend}
            canSend={canSend}
            hint={composerHint}
            loadingLabel={loadingLabel}
            variant="landing"
          />
        </div>
      </div>
    </div>
  );
}
