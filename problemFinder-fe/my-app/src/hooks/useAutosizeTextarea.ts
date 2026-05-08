import { useEffect } from "react";
import type { RefObject } from "react";

export function useAutosizeTextarea(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxHeight: number
) {
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, [maxHeight, textareaRef, value]);
}
