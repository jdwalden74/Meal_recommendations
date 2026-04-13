"use client";

import { useEffect, useState, KeyboardEvent } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { UserPreferences } from "@/lib/interfaces";

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
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
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
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder ?? "Type and press Enter"}
          className="flex-1"
        />
        <Button type="button" variant="outline" onClick={add}>
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

// ─── Defaults ──────────────────────────────────────────────────────────────────

const EMPTY: Omit<UserPreferences, "_id" | "userId" | "updatedAt"> = {
  dietaryRestrictions: [],
  allergies: [],
  dislikedIngredients: [],
  cuisinePreferences: [],
  caloricTarget: 2000,
  budgetPerWeek: undefined,
  maxCookTimeMinutes: undefined,
};

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { data: session } = useSession();
  const [prefs, setPrefs] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  // Derive first / last name from the Google-provided full name
  const fullName = session?.user?.name ?? "";
  const spaceIdx = fullName.indexOf(" ");
  const firstName = spaceIdx === -1 ? fullName : fullName.slice(0, spaceIdx);
  const lastName = spaceIdx === -1 ? "" : fullName.slice(spaceIdx + 1);
  const email = session?.user?.email ?? "";
  const avatarUrl = session?.user?.image ?? "";

  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setPrefs({
            dietaryRestrictions: data.dietaryRestrictions ?? [],
            allergies: data.allergies ?? [],
            dislikedIngredients: data.dislikedIngredients ?? [],
            cuisinePreferences: data.cuisinePreferences ?? [],
            caloricTarget: data.caloricTarget ?? 2000,
            budgetPerWeek: data.budgetPerWeek,
            maxCookTimeMinutes: data.maxCookTimeMinutes,
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus("idle");

    const payload = {
      ...prefs,
      budgetPerWeek: prefs.budgetPerWeek || undefined,
      maxCookTimeMinutes: prefs.maxCookTimeMinutes || undefined,
    };

    try {
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setStatus(res.ok ? "success" : "error");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  function setField<K extends keyof typeof prefs>(key: K, value: (typeof prefs)[K]) {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="container mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Profile</h1>
      </div>

      {/* ── Identity card (read-only, sourced from Google) ── */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="flex items-center gap-5">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={fullName}
                width={72}
                height={72}
                className="rounded-full ring-2 ring-emerald-200 dark:ring-emerald-800 shrink-0"
              />
            ) : (
              <div className="w-[72px] h-[72px] rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-700 dark:text-emerald-300 text-2xl font-bold shrink-0">
                {firstName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">First name</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{firstName || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">Last name</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{lastName || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">Email</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{email || "—"}</p>
                </div>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Managed by your Google account</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Food Preferences</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
          Saved to your account and used when generating meal recommendations.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Dietary restrictions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dietary Restrictions</CardTitle>
            <CardDescription>e.g. vegetarian, vegan, keto, halal, gluten-free</CardDescription>
          </CardHeader>
          <CardContent>
            <TagInput
              label="Restrictions"
              tags={prefs.dietaryRestrictions}
              onChange={(v) => setField("dietaryRestrictions", v)}
              placeholder="e.g. vegetarian"
            />
          </CardContent>
        </Card>

        {/* Allergies */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Allergies</CardTitle>
            <CardDescription>Ingredients that must be excluded entirely</CardDescription>
          </CardHeader>
          <CardContent>
            <TagInput
              label="Allergies"
              tags={prefs.allergies}
              onChange={(v) => setField("allergies", v)}
              placeholder="e.g. peanuts"
            />
          </CardContent>
        </Card>

        {/* Disliked ingredients */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Disliked Ingredients</CardTitle>
            <CardDescription>Ingredients to avoid where possible</CardDescription>
          </CardHeader>
          <CardContent>
            <TagInput
              label="Disliked ingredients"
              tags={prefs.dislikedIngredients}
              onChange={(v) => setField("dislikedIngredients", v)}
              placeholder="e.g. cilantro"
            />
          </CardContent>
        </Card>

        {/* Cuisine preferences */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cuisine Preferences</CardTitle>
            <CardDescription>Cuisines you enjoy most</CardDescription>
          </CardHeader>
          <CardContent>
            <TagInput
              label="Cuisines"
              tags={prefs.cuisinePreferences}
              onChange={(v) => setField("cuisinePreferences", v)}
              placeholder="e.g. Italian"
            />
          </CardContent>
        </Card>

        {/* Numeric targets */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Goals & Limits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="caloricTarget">Daily Calorie Target</Label>
              <Input
                id="caloricTarget"
                type="number"
                min={1}
                value={prefs.caloricTarget}
                onChange={(e) => setField("caloricTarget", Number(e.target.value))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="budgetPerWeek">Weekly Grocery Budget (USD) — optional</Label>
              <Input
                id="budgetPerWeek"
                type="number"
                min={0}
                value={prefs.budgetPerWeek ?? ""}
                onChange={(e) =>
                  setField("budgetPerWeek", e.target.value ? Number(e.target.value) : undefined)
                }
                placeholder="e.g. 100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxCookTimeMinutes">Max Cook Time per Meal (minutes) — optional</Label>
              <Input
                id="maxCookTimeMinutes"
                type="number"
                min={1}
                value={prefs.maxCookTimeMinutes ?? ""}
                onChange={(e) =>
                  setField(
                    "maxCookTimeMinutes",
                    e.target.value ? Number(e.target.value) : undefined
                  )
                }
                placeholder="e.g. 30"
              />
            </div>
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex items-center gap-4">
          <Button
            type="submit"
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6"
          >
            {saving ? "Saving..." : "Save Preferences"}
          </Button>

          {status === "success" && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">Preferences saved.</p>
          )}
          {status === "error" && (
            <p className="text-sm text-red-600 dark:text-red-400">Something went wrong. Please try again.</p>
          )}
        </div>
      </form>
    </main>
  );
}
