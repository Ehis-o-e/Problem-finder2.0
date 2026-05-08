import { useEffect, useState } from "react";
import type { LoadingStageKey } from "../types/chat.ts";

const FILTER_DELAY_MS = 1100;
const WRITING_DELAY_MS = 2400;

const LOADING_STAGE_LABELS: Record<LoadingStageKey, string> = {
  fetching: "Fetching Reddit conversations...",
  filtering: "Filtering the strongest problem signals...",
  writing: "Writing up the best matches...",
};

export function getLoadingStageLabel(stage: LoadingStageKey | null) {
  return stage ? LOADING_STAGE_LABELS[stage] : null;
}

export function useLoadingStage(isLoading: boolean) {
  const [stage, setStage] = useState<LoadingStageKey | null>(null);

  useEffect(() => {
    if (!isLoading) {
      setStage(null);
      return;
    }

    setStage("fetching");

    const filterTimer = window.setTimeout(() => {
      setStage("filtering");
    }, FILTER_DELAY_MS);

    const writingTimer = window.setTimeout(() => {
      setStage("writing");
    }, WRITING_DELAY_MS);

    return () => {
      window.clearTimeout(filterTimer);
      window.clearTimeout(writingTimer);
    };
  }, [isLoading]);

  return stage;
}
