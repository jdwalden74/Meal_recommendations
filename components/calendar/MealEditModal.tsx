"use client";

import { useState, useEffect, KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Meal } from "./types";

// ─── Inline tag input ──────────────────────────────────────────────────────────

function TagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (t: string[]) => void;
}) {
  const [input, setInput] = useState("");

  function add() {
    const t = input.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setInput("");
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Add ingredient and press Enter"
          className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="button"
          onClick={add}
          className="px-3 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
        >
          Add
        </button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-sm px-3 py-1 rounded-full"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(tags.filter((t) => t !== tag))}
                aria-label={`Remove ${tag}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Field helpers ─────────────────────────────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500";

// ─── Modal ─────────────────────────────────────────────────────────────────────

interface MealEditModalProps {
  meal: Meal | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: Meal) => void;
}

export function MealEditModal({ meal, isOpen, onClose, onSave }: MealEditModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<Meal["type"]>("breakfast");
  const [time, setTime] = useState("");
  const [image, setImage] = useState("");
  // All numeric fields stored as strings so inputs start blank and clear cleanly
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [fiber, setFiber] = useState("");
  const [sodium, setSodium] = useState("");
  const [ingredients, setIngredients] = useState<string[]>([]);

  // Sync form when meal changes
  useEffect(() => {
    if (meal) {
      setName(meal.name);
      setType(meal.type);
      setTime(meal.time);
      setImage(meal.image);
      setCalories(meal.nutrition.calories > 0 ? String(meal.nutrition.calories) : "");
      setProtein(meal.nutrition.protein > 0 ? String(meal.nutrition.protein) : "");
      setCarbs(meal.nutrition.carbs > 0 ? String(meal.nutrition.carbs) : "");
      setFat(meal.nutrition.fat > 0 ? String(meal.nutrition.fat) : "");
      setFiber(meal.nutrition.fiber != null ? String(meal.nutrition.fiber) : "");
      setSodium(meal.nutrition.sodium != null ? String(meal.nutrition.sodium) : "");
      setIngredients(meal.ingredients ?? []);
    }
  }, [meal?.id]);

  if (!isOpen || !meal) return null;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!meal) return;
    onSave({
      ...meal,
      name,
      type,
      time,
      image,
      nutrition: {
        calories: Number(calories) || 0,
        protein: Number(protein) || 0,
        carbs: Number(carbs) || 0,
        fat: Number(fat) || 0,
        ...(fiber !== "" && { fiber: Number(fiber) }),
        ...(sodium !== "" && { sodium: Number(sodium) }),
      },
      ingredients,
    });
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {meal.name === "" ? "Add Meal" : "Edit Meal"}
              </h2>
              {meal.name !== "" && (
                <p className="text-sm text-slate-500 dark:text-slate-400">{meal.name}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
              {/* Name */}
              <Field label="Meal name">
                <input
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Field>

              {/* Type / Time */}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Type">
                  <select
                    className={inputCls}
                    value={type}
                    onChange={(e) => setType(e.target.value as Meal["type"])}
                  >
                    <option value="breakfast">Breakfast</option>
                    <option value="lunch">Lunch</option>
                    <option value="dinner">Dinner</option>
                    <option value="snack">Snack</option>
                  </select>
                </Field>
                <Field label="Time">
                  <input
                    className={inputCls}
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    placeholder="e.g. 7:30 AM"
                  />
                </Field>
              </div>

              {/* Image URL */}
              <Field label="Image URL">
                <input
                  className={inputCls}
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  placeholder="https://..."
                />
              </Field>

              {/* Nutrition */}
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                  Nutrition
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Calories (kcal)">
                    <input
                      inputMode="decimal"
                      className={inputCls}
                      value={calories}
                      onChange={(e) => setCalories(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="0"
                      required
                    />
                  </Field>
                  <Field label="Protein (g)">
                    <input
                      inputMode="decimal"
                      className={inputCls}
                      value={protein}
                      onChange={(e) => setProtein(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="0"
                      required
                    />
                  </Field>
                  <Field label="Carbs (g)">
                    <input
                      inputMode="decimal"
                      className={inputCls}
                      value={carbs}
                      onChange={(e) => setCarbs(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="0"
                      required
                    />
                  </Field>
                  <Field label="Fat (g)">
                    <input
                      inputMode="decimal"
                      className={inputCls}
                      value={fat}
                      onChange={(e) => setFat(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="0"
                      required
                    />
                  </Field>
                  <Field label="Fiber (g) — optional">
                    <input
                      inputMode="decimal"
                      className={inputCls}
                      value={fiber}
                      onChange={(e) => setFiber(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="—"
                    />
                  </Field>
                  <Field label="Sodium (mg) — optional">
                    <input
                      inputMode="decimal"
                      className={inputCls}
                      value={sodium}
                      onChange={(e) => setSodium(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="—"
                    />
                  </Field>
                </div>
              </div>

              {/* Ingredients */}
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                  Ingredients
                </p>
                <TagInput tags={ingredients} onChange={setIngredients} />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
              >
                Save changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
