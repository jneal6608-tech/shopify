"use client";
import * as React from "react";

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      className="ml-1 text-[10px] text-faint hover:text-fg"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {done ? "copied" : "copy"}
    </button>
  );
}
