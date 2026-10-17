"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { RecipeIngredient, NutritionalInfo } from "@/lib/interfaces";
import { PhotoUpload } from "./PhotoUpload";
import { cn } from "@/lib/utils";

type RecipeFormData = {
  title: string;
  photoUrl?: string;
  ingredients: RecipeIngredient[];
  steps: string[];
  servings: number;
  macros: NutritionalInfo;
  tags: string[];
  notes: string;
};

interface RecipeFormProps {
  initialData?: Partial<RecipeFormData>;
  recipeId?: string; // present when editing
}

const EMPTY: RecipeFormData = {
  title: "",
  photoUrl: undefined,
  ingredients: [{ name: "", amount: 1, unit: "" }],
  steps: [""],
  servings: 4,
  macros: { calories: 0, protein: 0, carbs: 0, fat: 0 },
  tags: [],
  notes: "",
};

export function RecipeForm({ initialData, recipeId }: RecipeFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<RecipeFormData>({ ...EMPTY, ...initialData });
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField<K extends keyof RecipeFormData>(key: K, value: RecipeFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Ingredients
  function updateIngredient(i: number, field: keyof RecipeIngredient, value: string | number) {
    const updated = form.ingredients.map((ing, idx) =>
      idx === i ? { ...ing, [field]: value } : ing
    );
    setField("ingredients", updated);
  }
  function addIngredient() {
    setField("ingredients", [...form.ingredients, { name: "", amount: 1, unit: "" }]);
  }
  function removeIngredient(i: number) {
    setField("ingredients", form.ingredients.filter((_, idx) => idx !== i));
  }

  // Steps
  function updateStep(i: number, value: string) {
    setField("steps", form.steps.map((s, idx) => (idx === i ? value : s)));
  }
  function addStep() { setField("steps", [...form.steps, ""]); }
  function removeStep(i: number) { setField("steps", form.steps.filter((_, idx) => idx !== i)); }

  // Tags
  function addTag() {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) setField("tags", [...form.tags, t]);
    setTagInput("");
  }
  function removeTag(tag: string) { setField("tags", form.tags.filter((t) => t !== tag)); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const url = recipeId ? `/api/cookbook/${recipeId}` : "/api/cookbook";
      const method = recipeId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, notes: form.notes || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Save failed");
      }
      const data = await res.json();
      const id = recipeId ?? String(data.insertedId);
      router.push(`/cookbook/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8 pb-20">
      {/* Photo */}
      <section>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Photo</label>
        <PhotoUpload value={form.photoUrl} onChange={(url) => setField("photoUrl", url)} />
      </section>

      {/* Title */}
      <section>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
          Recipe title <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setField("title", e.target.value)}
          placeholder="e.g. Grandma's Chicken Soup"
          className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
      </section>

      {/* Servings */}
      <section>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Servings</label>
        <input
          type="number"
          min={1}
          value={form.servings}
          onChange={(e) => setField("servings", Number(e.target.value))}
          className="w-24 px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
      </section>

      {/* Ingredients */}
      <section>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Ingredients</label>
        <div className="flex flex-col gap-2">
          {form.ingredients.map((ing, i) => (
            <div key={i} className="flex items-center gap-2">
              <GripVertical className="w-4 h-4 text-slate-300 dark:text-slate-600 flex-shrink-0" />
              <input
                type="number"
                min={0}
                step="any"
                value={ing.amount}
                onChange={(e) => updateIngredient(i, "amount", Number(e.target.value))}
                className="w-16 px-2 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="qty"
              />
              <input
                type="text"
                value={ing.unit}
                onChange={(e) => updateIngredient(i, "unit", e.target.value)}
                className="w-20 px-2 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="unit"
              />
              <input
                type="text"
                value={ing.name}
                onChange={(e) => updateIngredient(i, "name", e.target.value)}
                className="flex-1 px-2 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="ingredient"
              />
              {form.ingredients.length > 1 && (
                <button type="button" onClick={() => removeIngredient(i)} className="p-1 text-slate-400 hover:text-red-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addIngredient} className="flex items-center gap-1.5 text-sm text-emerald-500 hover:text-emerald-600 font-medium transition-colors mt-1">
            <Plus className="w-4 h-4" />
            Add ingredient
          </button>
        </div>
      </section>

      {/* Steps */}
      <section>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Steps</label>
        <div className="flex flex-col gap-2">
          {form.steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-2.5 text-sm font-bold text-emerald-500 w-5 text-right flex-shrink-0">{i + 1}.</span>
              <textarea
                value={step}
                onChange={(e) => updateStep(i, e.target.value)}
                rows={2}
                placeholder={`Step ${i + 1}…`}
                className="flex-1 px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
              />
              {form.steps.length > 1 && (
                <button type="button" onClick={() => removeStep(i)} className="mt-2 p-1 text-slate-400 hover:text-red-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addStep} className="flex items-center gap-1.5 text-sm text-emerald-500 hover:text-emerald-600 font-medium transition-colors mt-1">
            <Plus className="w-4 h-4" />
            Add step
          </button>
        </div>
      </section>

      {/* Macros (per serving) */}
      <section>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
          Macros <span className="text-xs font-normal text-slate-400">(per serving)</span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(["calories", "protein", "carbs", "fat"] as const).map((field) => (
            <div key={field}>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1 capitalize">{field}</label>
              <input
                type="number"
                min={0}
                step="any"
                value={form.macros[field]}
                onChange={(e) => setField("macros", { ...form.macros, [field]: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Tags */}
      <section>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Tags</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {form.tags.map((tag) => (
            <span key={tag} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
              {tag}
              <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-400 transition-colors">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
            placeholder="Add tag…"
            className="flex-1 px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <button type="button" onClick={addTag} className="px-4 py-2 text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            Add
          </button>
        </div>
      </section>

      {/* Notes */}
      <section>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => setField("notes", e.target.value)}
          rows={3}
          placeholder="Tips, substitutions, storage notes…"
          className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
        />
      </section>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Submit */}
      <div className="fixed bottom-0 inset-x-0 px-4 pb-6 pt-3 bg-white/90 dark:bg-slate-950/90 backdrop-blur-sm border-t border-slate-100 dark:border-slate-800">
        <button
          type="submit"
          disabled={saving}
          className={cn(
            "w-full py-3 rounded-xl font-semibold text-sm transition-colors",
            "bg-emerald-500 hover:bg-emerald-600 text-white",
            saving && "opacity-60 cursor-not-allowed"
          )}
        >
          {saving ? "Saving…" : recipeId ? "Save changes" : "Save recipe"}
        </button>
      </div>
    </form>
  );
}
