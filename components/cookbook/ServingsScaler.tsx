"use client";
import { Minus, Plus } from "lucide-react";

interface ServingsScalerProps {
  baseServings: number;
  currentServings: number;
  onChange: (n: number) => void;
}

export function ServingsScaler({ baseServings, currentServings, onChange }: ServingsScalerProps) {
  const scale = currentServings / baseServings;

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-500 dark:text-slate-400">Servings</span>
      <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-full px-1 py-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, currentServings - 1))}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white dark:hover:bg-slate-700 transition-colors"
          aria-label="Decrease servings"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="w-6 text-center text-sm font-semibold tabular-nums">{currentServings}</span>
        <button
          type="button"
          onClick={() => onChange(currentServings + 1)}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white dark:hover:bg-slate-700 transition-colors"
          aria-label="Increase servings"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      {scale !== 1 && (
        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          {scale.toFixed(2)}× recipe
        </span>
      )}
    </div>
  );
}
