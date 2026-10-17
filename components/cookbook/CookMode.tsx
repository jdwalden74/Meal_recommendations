"use client";
import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CookModeProps {
  title: string;
  steps: string[];
  onClose: () => void;
}

export function CookMode({ title, steps, onClose }: CookModeProps) {
  const [stepIndex, setStepIndex] = useState(0);

  // Request wake lock so the screen stays on during cooking
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    if ("wakeLock" in navigator) {
      navigator.wakeLock.request("screen").then((lock) => {
        wakeLock = lock;
      }).catch(() => {
        // Wake lock not available — silently ignore
      });
    }
    return () => { wakeLock?.release(); };
  }, []);

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white truncate pr-4">{title}</h2>
        <button
          onClick={onClose}
          className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Exit cook mode"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Step counter */}
      <div className="px-6 pt-6 text-sm font-medium text-emerald-600 dark:text-emerald-400">
        Step {stepIndex + 1} of {steps.length}
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 flex items-center">
        <p className="text-2xl leading-relaxed font-medium text-slate-900 dark:text-white">
          {steps[stepIndex]}
        </p>
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-1.5 py-3">
        {steps.map((_, i) => (
          <button
            key={i}
            onClick={() => setStepIndex(i)}
            className={cn(
              "w-2 h-2 rounded-full transition-colors",
              i === stepIndex ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"
            )}
            aria-label={`Go to step ${i + 1}`}
          />
        ))}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 px-4 pb-8 pt-2">
        <button
          onClick={() => setStepIndex((s) => s - 1)}
          disabled={isFirst}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-colors",
            isFirst
              ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed"
              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          )}
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>
        {isLast ? (
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl font-medium text-sm bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
          >
            Done!
          </button>
        ) : (
          <button
            onClick={() => setStepIndex((s) => s + 1)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
