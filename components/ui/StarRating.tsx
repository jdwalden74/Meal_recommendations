"use client";

import { useState, useCallback } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { NutritionalInfo } from "@/lib/interfaces";

interface StarRatingProps {
  value: number | null;
  onChange: (rating: number) => void;
  readonly?: boolean;
  mealId: string;
  mealName: string;
  nutrition: NutritionalInfo;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function StarRating({
  value,
  onChange,
  readonly = false,
  mealId,
  mealName,
  nutrition,
}: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const handleClick = useCallback(
    async (star: number) => {
      if (readonly) return;

      onChange(star);
      setSaveState("saving");

      try {
        const res = await fetch("/api/ratings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mealId,
            mealName,
            rating: star,
            nutrition,
          }),
        });

        if (!res.ok) {
          console.error("[StarRating] POST /api/ratings failed:", res.status);
          setSaveState("error");
        } else {
          setSaveState("saved");
        }
      } catch (err) {
        console.error("[StarRating] POST /api/ratings error:", err);
        setSaveState("error");
      }

      // Reset confirmation badge after 2 s
      setTimeout(() => setSaveState("idle"), 2000);
    },
    [readonly, onChange, mealId, mealName, nutrition]
  );

  const display = hovered ?? value ?? 0;

  return (
    <div className="flex items-center gap-1.5">
      {/* Stars */}
      <div
        className="flex items-center gap-0.5"
        onMouseLeave={() => !readonly && setHovered(null)}
        role={readonly ? undefined : "group"}
        aria-label={`Rating: ${value ?? 0} out of 5`}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = star <= display;
          return (
            <button
              key={star}
              type="button"
              disabled={readonly}
              onClick={() => handleClick(star)}
              onMouseEnter={() => !readonly && setHovered(star)}
              aria-label={`Rate ${star} out of 5`}
              className={cn(
                "transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded",
                !readonly && "hover:scale-110 active:scale-95 cursor-pointer",
                readonly && "cursor-default"
              )}
            >
              <Star
                className={cn(
                  "w-4 h-4 transition-colors duration-100",
                  filled
                    ? "fill-amber-400 text-amber-400"
                    : "fill-transparent text-slate-300 dark:text-slate-600",
                  !readonly && !filled && "hover:text-amber-300"
                )}
              />
            </button>
          );
        })}
      </div>

      {/* Confirmation badge */}
      <span
        className={cn(
          "text-[10px] font-medium leading-none transition-all duration-300",
          saveState === "idle"   && "opacity-0 translate-y-1",
          saveState === "saving" && "opacity-50 translate-y-0 text-slate-400 dark:text-slate-500",
          saveState === "saved"  && "opacity-100 translate-y-0 text-emerald-500 dark:text-emerald-400",
          saveState === "error"  && "opacity-100 translate-y-0 text-red-500 dark:text-red-400"
        )}
        aria-live="polite"
      >
        {saveState === "saving" && "Saving…"}
        {saveState === "saved"  && "Saved ✓"}
        {saveState === "error"  && "Failed"}
      </span>
    </div>
  );
}
