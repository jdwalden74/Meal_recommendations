"use client";

import { useState, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { X, ArrowRight, ArrowLeft, Leaf, ChefHat, Target } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// ─── Tag input ─────────────────────────────────────────────────────────────────

function TagInput({
  label,
  tags,
  onChange,
  placeholder,
}: {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  function add() {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) onChange([...tags, trimmed]);
    setInput("");
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); add(); }
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</Label>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder ?? "Type and press Enter"}
          className="flex-1"
        />
        <Button type="button" variant="outline" onClick={add} className="shrink-0">
          Add
        </Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-sm px-3 py-1 rounded-full"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(tags.filter((t) => t !== tag))}
                className="hover:text-emerald-600 dark:hover:text-emerald-200 transition-colors"
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

// ─── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  {
    id: "dietary",
    icon: <Leaf className="w-6 h-6 text-emerald-600" />,
    title: "Your dietary needs",
    description: "Tell us about any restrictions or allergies so we never suggest something you can't eat.",
  },
  {
    id: "cuisine",
    icon: <ChefHat className="w-6 h-6 text-emerald-600" />,
    title: "Your food preferences",
    description: "Let us know what cuisines you love and any ingredients you'd rather avoid.",
  },
  {
    id: "goals",
    icon: <Target className="w-6 h-6 text-emerald-600" />,
    title: "Your goals",
    description: "Set your daily calorie target and optionally a weekly grocery budget.",
  },
];

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [cuisinePreferences, setCuisinePreferences] = useState<string[]>([]);
  const [dislikedIngredients, setDislikedIngredients] = useState<string[]>([]);
  const [caloricTarget, setCaloricTarget] = useState(2000);
  const [budgetPerWeek, setBudgetPerWeek] = useState<string>("");

  const isLast = step === STEPS.length - 1;

  async function handleFinish() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        dietaryRestrictions,
        allergies,
        dislikedIngredients,
        cuisinePreferences,
        caloricTarget,
        ...(budgetPerWeek ? { budgetPerWeek: Number(budgetPerWeek) } : {}),
      };
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save preferences.");
      router.replace("/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  async function handleSkip() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        dietaryRestrictions: [],
        allergies: [],
        dislikedIngredients: [],
        cuisinePreferences: [],
        caloricTarget: 2000,
      };
      await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } finally {
      router.replace("/dashboard");
    }
  }

  const currentStep = STEPS[step];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Step {step + 1} of {STEPS.length}
            </span>
            <button
              onClick={handleSkip}
              disabled={saving}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors disabled:opacity-50"
            >
              Skip setup
            </button>
          </div>
          <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-emerald-500 rounded-full"
              initial={false}
              animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">

          {/* Step header */}
          <div className="px-8 pt-8 pb-6 border-b border-slate-100 dark:border-slate-700">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
              {currentStep.icon}
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {currentStep.title}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              {currentStep.description}
            </p>
          </div>

          {/* Step body */}
          <div className="px-8 py-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                {step === 0 && (
                  <>
                    <TagInput
                      label="Dietary restrictions"
                      tags={dietaryRestrictions}
                      onChange={setDietaryRestrictions}
                      placeholder="e.g. vegetarian, vegan, keto, halal"
                    />
                    <TagInput
                      label="Allergies"
                      tags={allergies}
                      onChange={setAllergies}
                      placeholder="e.g. peanuts, shellfish, dairy"
                    />
                  </>
                )}

                {step === 1 && (
                  <>
                    <TagInput
                      label="Cuisine preferences"
                      tags={cuisinePreferences}
                      onChange={setCuisinePreferences}
                      placeholder="e.g. Italian, Mexican, Japanese"
                    />
                    <TagInput
                      label="Ingredients to avoid"
                      tags={dislikedIngredients}
                      onChange={setDislikedIngredients}
                      placeholder="e.g. cilantro, mushrooms"
                    />
                  </>
                )}

                {step === 2 && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="caloricTarget" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Daily calorie target
                      </Label>
                      <div className="flex items-center gap-3">
                        <Input
                          id="caloricTarget"
                          type="number"
                          min={1}
                          value={caloricTarget}
                          onChange={(e) => setCaloricTarget(Number(e.target.value))}
                          className="flex-1"
                        />
                        <span className="text-sm text-slate-500 dark:text-slate-400 shrink-0">kcal / day</span>
                      </div>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        A common starting point is 2,000 kcal for adults. Adjust to match your goal.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="budgetPerWeek" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Weekly grocery budget — <span className="font-normal text-slate-400">optional</span>
                      </Label>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-slate-500 dark:text-slate-400 shrink-0">$</span>
                        <Input
                          id="budgetPerWeek"
                          type="number"
                          min={0}
                          value={budgetPerWeek}
                          onChange={(e) => setBudgetPerWeek(e.target.value)}
                          placeholder="e.g. 100"
                          className="flex-1"
                        />
                        <span className="text-sm text-slate-500 dark:text-slate-400 shrink-0">/ week</span>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>

            {error && (
              <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>

          {/* Navigation */}
          <div className="px-8 pb-8 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 0 || saving}
              className="flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>

            {isLast ? (
              <Button
                type="button"
                onClick={handleFinish}
                disabled={saving || caloricTarget <= 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
              >
                {saving ? "Saving…" : "Go to dashboard"}
                {!saving && <ArrowRight className="w-4 h-4" />}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-4">
          You can update any of these settings later from your profile.
        </p>
      </div>
    </div>
  );
}
