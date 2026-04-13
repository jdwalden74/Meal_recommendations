"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { startOfWeek, addDays, format, parseISO } from "date-fns";
import { getWeekData } from "@/components/calendar/mockData";
import { DayMeals, Meal } from "@/components/calendar/types";
import { MealEditModal } from "@/components/calendar/MealEditModal";
import {
  Flame,
  ShoppingCart,
  CalendarCheck,
  Beef,
  CheckSquare,
  Square,
  Pencil,
} from "lucide-react";

// ─── Helpers ───────────────────────────────────────────────────────────────────

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MEAL_TYPES = ["breakfast", "lunch", "dinner"] as const;
const COST_PER_MEAL = 8; // rough estimate dollars

function buildGroceryList(week: DayMeals[]): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const day of week) {
    for (const meal of day.meals) {
      for (const ing of meal.ingredients ?? []) {
        const key = ing.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          items.push(ing);
        }
      }
    }
  }
  return items.sort((a, b) => a.localeCompare(b));
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 flex items-start gap-4 shadow-sm">
      <div className={`p-2.5 rounded-lg ${color} shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function MacroBar({
  label,
  value,
  max,
  color,
  unit = "g",
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  unit?: string;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5">
        <span className="text-slate-600 dark:text-slate-300 font-medium">{label}</span>
        <span className="text-slate-500 dark:text-slate-400">
          {Math.round(value)}{unit}
          <span className="text-slate-400 dark:text-slate-500"> / {max}{unit}</span>
        </span>
      </div>
      <div className="h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: session } = useSession();
  const firstName = (session?.user?.name ?? "").split(" ")[0] || "there";

  const today = new Date();
  const weekStart = startOfWeek(today);
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');

  const [week, setWeek] = useState<DayMeals[]>(() => getWeekData(weekStart));
  const [editMeal, setEditMeal] = useState<Meal | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  // Load this week's plan from DB on mount; fall back to mock if nothing saved yet
  useEffect(() => {
    fetch(`/api/meal-plan?week=${weekStartStr}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.days) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setWeek(data.days.map((d: any) => ({
            date: parseISO(d.date),
            status: d.status,
            meals: d.meals,
          })));
        }
      })
      .catch(() => {/* keep mock data */});
  }, [weekStartStr]);

  async function persistWeek(days: DayMeals[]) {
    const payload = {
      weekStartDate: weekStartStr,
      days: days.map((d) => ({
        date: format(d.date, 'yyyy-MM-dd'),
        status: d.status,
        meals: d.meals,
      })),
    };
    const res = await fetch('/api/meal-plan', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status === 404) {
      await fetch('/api/meal-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
  }

  function openEdit(meal: Meal) {
    setEditMeal(meal);
    setIsEditOpen(true);
  }

  function handleMealSave(updated: Meal) {
    const newWeek = week.map((day) => ({
      ...day,
      meals: day.meals.map((m) => (m.id === updated.id ? updated : m)),
    }));
    setWeek(newWeek);
    setIsEditOpen(false);
    setEditMeal(null);
    persistWeek(newWeek);
  }

  // ── Derived stats ────────────────────────────────────────────────────────────
  const totalMeals = week.reduce((sum, d) => sum + d.meals.length, 0);
  const plannedDays = week.filter((d) => d.status !== "none").length;

  const allMeals = week.flatMap((d) => d.meals);
  const avgCalories =
    allMeals.length > 0
      ? Math.round(allMeals.reduce((s, m) => s + m.nutrition.calories, 0) / 7)
      : 0;
  const avgProtein =
    allMeals.length > 0
      ? Math.round(allMeals.reduce((s, m) => s + m.nutrition.protein, 0) / 7)
      : 0;
  const avgCarbs =
    allMeals.length > 0
      ? Math.round(allMeals.reduce((s, m) => s + m.nutrition.carbs, 0) / 7)
      : 0;
  const avgFat =
    allMeals.length > 0
      ? Math.round(allMeals.reduce((s, m) => s + m.nutrition.fat, 0) / 7)
      : 0;

  const estWeeklyCost = totalMeals * COST_PER_MEAL;

  // ── Grocery list ─────────────────────────────────────────────────────────────
  const groceryItems = useMemo(() => buildGroceryList(week), [week]);

  const [checked, setChecked] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("grocery-checked") ?? "[]");
      setChecked(new Set(stored));
    } catch {}
  }, []);

  function toggleItem(item: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(item) ? next.delete(item) : next.add(item);
      localStorage.setItem("grocery-checked", JSON.stringify([...next]));
      return next;
    });
  }

  const weekLabel = `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "MMM d, yyyy")}`;

  return (
    <div className="bg-slate-50 dark:bg-slate-900 min-h-screen p-6 md:p-8 transition-colors duration-300">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* ── Header ── */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
            Good {getGreeting()}, {firstName}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Week of {weekLabel}</p>
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<Flame className="w-5 h-5 text-orange-600" />}
            label="Avg daily calories"
            value={avgCalories.toLocaleString()}
            sub="kcal / day"
            color="bg-orange-50 dark:bg-orange-900/20"
          />
          <StatCard
            icon={<CalendarCheck className="w-5 h-5 text-emerald-600" />}
            label="Meals planned"
            value={`${totalMeals}`}
            sub={`${plannedDays} of 7 days covered`}
            color="bg-emerald-50 dark:bg-emerald-900/20"
          />
          <StatCard
            icon={<Beef className="w-5 h-5 text-blue-600" />}
            label="Avg daily protein"
            value={`${avgProtein}g`}
            sub="per day"
            color="bg-blue-50 dark:bg-blue-900/20"
          />
          <StatCard
            icon={<ShoppingCart className="w-5 h-5 text-violet-600" />}
            label="Est. weekly cost"
            value={`$${estWeeklyCost}`}
            sub={`~$${COST_PER_MEAL} per meal`}
            color="bg-violet-50 dark:bg-violet-900/20"
          />
        </div>

        {/* ── Main grid ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* ── This week at a glance ── */}
          <div className="xl:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <h2 className="font-semibold text-slate-900 dark:text-white">This week</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-400 uppercase w-20">Day</th>
                    {MEAL_TYPES.map((t) => (
                      <th key={t} className="text-left px-4 py-2.5 text-xs font-medium text-slate-400 uppercase capitalize">
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {week.map((day, i) => {
                    const isToday = format(day.date, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");
                    return (
                      <tr
                        key={i}
                        className={`border-b last:border-0 border-slate-50 dark:border-slate-700/50 transition-colors ${
                          isToday ? "bg-emerald-50/60 dark:bg-emerald-900/10" : "hover:bg-slate-50 dark:hover:bg-slate-700/30"
                        }`}
                      >
                        <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          <span className={isToday ? "text-emerald-600 dark:text-emerald-400 font-bold" : ""}>
                            {DAY_LABELS[i]}
                          </span>
                          <span className="block text-xs text-slate-400 font-normal">
                            {format(day.date, "MMM d")}
                          </span>
                        </td>
                        {MEAL_TYPES.map((type) => {
                          const meal = day.meals.find((m) => m.type === type);
                          return (
                            <td key={type} className="px-4 py-3">
                              {meal ? (
                                <div className="flex items-start justify-between gap-2 group/cell">
                                  <span className="text-slate-700 dark:text-slate-300 leading-tight block">
                                    {meal.name}
                                    <span className="block text-xs text-slate-400 dark:text-slate-500">
                                      {meal.nutrition.calories} kcal
                                    </span>
                                  </span>
                                  <button
                                    onClick={() => openEdit(meal)}
                                    className="p-1 rounded opacity-0 group-hover/cell:opacity-100 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all shrink-0"
                                    aria-label="Edit meal"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-300 dark:text-slate-600 italic text-xs">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Right column: macros + grocery list ── */}
          <div className="space-y-6">

            {/* Macro breakdown */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
              <h2 className="font-semibold text-slate-900 dark:text-white mb-4">Daily avg macros</h2>
              <div className="space-y-4">
                <MacroBar label="Protein" value={avgProtein} max={150} color="bg-blue-500" />
                <MacroBar label="Carbs" value={avgCarbs} max={300} color="bg-amber-400" />
                <MacroBar label="Fat" value={avgFat} max={80} color="bg-rose-400" />
              </div>
            </div>

            {/* Grocery list */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900 dark:text-white">Grocery list</h2>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {checked.size}/{groceryItems.length} checked
                </span>
              </div>
              <ul className="divide-y divide-slate-50 dark:divide-slate-700/50 max-h-80 overflow-y-auto">
                {groceryItems.length === 0 && (
                  <li className="px-5 py-4 text-sm text-slate-400 italic">No ingredients this week.</li>
                )}
                {groceryItems.map((item) => {
                  const done = checked.has(item);
                  return (
                    <li key={item}>
                      <button
                        onClick={() => toggleItem(item)}
                        className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors text-left"
                      >
                        {done ? (
                          <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
                        )}
                        <span
                          className={`text-sm ${
                            done
                              ? "line-through text-slate-400 dark:text-slate-500"
                              : "text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          {item}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

          </div>
        </div>
      </div>

      <MealEditModal
        meal={editMeal}
        isOpen={isEditOpen}
        onClose={() => { setIsEditOpen(false); setEditMeal(null); }}
        onSave={handleMealSave}
      />
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
