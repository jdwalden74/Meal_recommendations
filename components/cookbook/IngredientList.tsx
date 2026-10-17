"use client";
import { useState } from "react";
import { RecipeIngredient } from "@/lib/interfaces";
import { cn } from "@/lib/utils";

interface IngredientListProps {
  ingredients: RecipeIngredient[];
  scale?: number; // multiplier applied to amounts (from ServingsScaler)
}

function formatAmount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, "");
}

export function IngredientList({ ingredients, scale = 1 }: IngredientListProps) {
  const [checked, setChecked] = useState<Set<number>>(new Set());

  function toggle(i: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) { next.delete(i); } else { next.add(i); }
      return next;
    });
  }

  return (
    <ul className="flex flex-col gap-2">
      {ingredients.map((ing, i) => (
        <li key={i}>
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={checked.has(i)}
              onChange={() => toggle(i)}
              className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-emerald-500 focus:ring-emerald-400"
            />
            <span
              className={cn(
                "text-sm text-slate-700 dark:text-slate-300 transition-colors",
                checked.has(i) && "line-through text-slate-400 dark:text-slate-500"
              )}
            >
              <span className="font-medium tabular-nums">{formatAmount(ing.amount * scale)}</span>
              {" "}{ing.unit}{" "}
              {ing.name}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
