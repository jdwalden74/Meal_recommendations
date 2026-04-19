"use client";

import { useState, useEffect, useRef } from "react";
import { Send, Trash2, Bot, User, Loader2 } from "lucide-react";
import { format, startOfWeek, parseISO } from "date-fns";

interface Message {
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

// Matches the LlmAction types in lib/interfaces.ts
interface SetMealAction {
  action: "set_meal";
  date: string;
  meal: {
    id: string;
    name: string;
    type: "breakfast" | "lunch" | "dinner" | "snack";
    time: string;
    image: string;
    description?: string;
    nutrition: { calories: number; protein: number; carbs: number; fat: number };
    ingredients?: string[];
  };
}

interface ClearMealAction {
  action: "clear_meal";
  date: string;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
}

type MealAction = SetMealAction | ClearMealAction;

/** Parse every <meal_action>...</meal_action> block from the LLM response. */
function parseAllMealActions(text: string): MealAction[] {
  const results: MealAction[] = [];
  for (const match of text.matchAll(/<meal_action>([\s\S]*?)<\/meal_action>/g)) {
    try {
      results.push(JSON.parse(match[1].trim()) as MealAction);
    } catch {
      console.warn("[ChatBox] Failed to parse meal_action JSON", match[1]);
    }
  }
  return results;
}

/** Strip all <meal_action>...</meal_action> blocks from display text. */
function stripMealActions(text: string): string {
  return text
    .replace(/<meal_action>[\s\S]*?<\/meal_action>/g, "")
    .replace(/^\[\d{4}-\d{2}-\d{2}\]\s*/g, "")
    .trim();
}

type PendingOverwrite = { action: SetMealAction; existingMealName: string };

/**
 * Apply all meal actions in a batched, efficient way:
 * - Groups actions by week (one GET per week, not per meal)
 * - Auto-applies set_meal actions that fill empty slots and all clear_meal actions
 * - Collects set_meal actions that would overwrite an existing meal into pendingOverwrites
 * - PATCHes each touched day once
 * Returns totalApplied (auto-applied count) and pendingOverwrites (awaiting confirmation).
 */
async function applyAllMealActions(
  actions: MealAction[],
  onDayApplied: (daysApplied: number) => void
): Promise<{ totalApplied: number; pendingOverwrites: PendingOverwrite[] }> {
  // Group by week start date
  const weekGroups = new Map<string, MealAction[]>();
  for (const action of actions) {
    const weekStart = format(startOfWeek(parseISO(action.date)), "yyyy-MM-dd");
    const existing = weekGroups.get(weekStart) ?? [];
    weekGroups.set(weekStart, [...existing, action]);
  }

  let totalApplied = 0;
  let daysApplied = 0;
  const pendingOverwrites: PendingOverwrite[] = [];

  for (const [weekStart, weekActions] of weekGroups) {
    // ONE GET per week (not per action)
    const planRes = await fetch(`/api/meal-plan?week=${weekStart}`);
    const existingPlan = planRes.ok ? await planRes.json().catch(() => null) : null;

    type DayEntry = { date: string; status: string; meals: Record<string, unknown>[] };
    const dayMap = new Map<string, DayEntry>();
    for (const d of existingPlan?.days ?? []) {
      dayMap.set(d.date, { date: d.date, status: d.status, meals: [...d.meals] });
    }

    // touchedDates is built dynamically — only dates with auto-applied changes
    const touchedDates = new Set<string>();
    // Track how many auto-applied actions landed on each date for totalApplied accounting
    const appliedCountByDate = new Map<string, number>();

    // Apply non-overwrite actions in-memory
    for (const action of weekActions) {
      if (action.action === "set_meal") {
        if (
          !action.meal?.name ||
          typeof action.meal.name !== "string" ||
          action.meal.name.trim() === "" ||
          !action.meal?.nutrition?.calories ||
          action.meal.nutrition.calories <= 0
        ) {
          console.warn("[ChatBox] Skipping malformed meal action — missing name or calories", action);
          continue;
        }

        // Check for overwrite: existing day already has a meal of this type
        const existingDay = dayMap.get(action.date);
        const existingMeal = (existingDay?.meals as { type: string; name: string }[] | undefined)
          ?.find((m) => m.type === action.meal.type);
        if (existingMeal) {
          pendingOverwrites.push({
            action,
            existingMealName: existingMeal.name ?? "existing meal",
          });
          continue;
        }
      }

      const day = dayMap.get(action.date) ?? { date: action.date, status: "none", meals: [] };

      if (action.action === "set_meal") {
        const meal = { ...action.meal, id: crypto.randomUUID() };
        day.meals = [...(day.meals as { type: string; id: string }[]), meal];
      } else if (action.action === "clear_meal") {
        day.meals = (day.meals as { type: string }[]).filter(
          (m) => m.type !== action.mealType
        );
      }

      const types = new Set(day.meals.map((m) => (m as { type: string }).type));
      day.status =
        types.has("breakfast") && types.has("lunch") && types.has("dinner")
          ? "planned"
          : day.meals.length > 0
          ? "in-progress"
          : "none";

      dayMap.set(action.date, day);
      touchedDates.add(action.date);
      appliedCountByDate.set(action.date, (appliedCountByDate.get(action.date) ?? 0) + 1);
    }

    // ONE PATCH per touched day
    for (const date of touchedDates) {
      const day = dayMap.get(date);
      if (!day) continue;
      const res = await fetch("/api/meal-plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStartDate: weekStart, day }),
      });
      if (res.ok) {
        totalApplied += appliedCountByDate.get(date) ?? 0;
        daysApplied++;
        onDayApplied(daysApplied);
      }
    }
  }

  return { totalApplied, pendingOverwrites };
}

/** Build a human-readable summary of what was applied, e.g. "✓ Added 21 meals across 7 days (Apr 20 – Apr 26)". */
function buildActionSummary(actions: MealAction[], appliedCount: number): string {
  if (appliedCount === 0) return "";
  const setActions = actions.filter((a): a is SetMealAction => a.action === "set_meal");
  const clearActions = actions.filter((a): a is ClearMealAction => a.action === "clear_meal");

  const uniqueDays = [...new Set(actions.map((a) => a.date).sort())];
  const parts: string[] = [];

  if (setActions.length > 0)
    parts.push(`Added ${setActions.length} meal${setActions.length !== 1 ? "s" : ""}`);
  if (clearActions.length > 0)
    parts.push(`Removed ${clearActions.length} meal${clearActions.length !== 1 ? "s" : ""}`);

  if (uniqueDays.length === 1) {
    parts.push(`on ${format(parseISO(uniqueDays[0]), "EEEE, MMM d")}`);
  } else {
    const first = parseISO(uniqueDays[0]);
    const last = parseISO(uniqueDays[uniqueDays.length - 1]);
    if (uniqueDays.length > 2) {
      parts.push(
        `across ${uniqueDays.length} days (${format(first, "MMM d")} \u2013 ${format(last, "MMM d")})`
      );
    } else {
      parts.push(`on ${format(first, "MMM d")} and ${format(last, "MMM d")}`);
    }
  }

  return "\u2713 " + parts.join(" ");
}

// ── Active-date extraction ────────────────────────────────────────────────────
const MONTHS_LONG = [
  "january","february","march","april","may","june",
  "july","august","september","october","november","december",
];
const MONTHS_SHORT = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

function resolveNearestDayOfMonth(day: number): string {
  const now = new Date();
  const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
  if (candidate.getTime() < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) {
    candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  }
  return candidate.toISOString().split("T")[0];
}

/**
 * Extracts the most relevant ISO date from an LLM response.
 * Priority: <meal_action> date field → bare ISO date → "Month D" → "the Nth".
 */
function extractActiveDateFromResponse(text: string): string | null {
  // 1. Most reliable: date field inside a <meal_action> block
  for (const match of text.matchAll(/<meal_action>([\s\S]*?)<\/meal_action>/g)) {
    try {
      const obj = JSON.parse(match[1].trim()) as Record<string, unknown>;
      if (typeof obj.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(obj.date)) {
        return obj.date;
      }
    } catch { /* ignore */ }
  }

  // 2. ISO date anywhere in the text
  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  // 3. "April 13", "Apr 13", "April 13th", etc.
  const allMonths = [...MONTHS_LONG, ...MONTHS_SHORT].join("|");
  const monthDateRe = new RegExp(`\\b(${allMonths})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i");
  const monthDateMatch = text.match(monthDateRe);
  if (monthDateMatch) {
    const abbr = monthDateMatch[1].toLowerCase().slice(0, 3);
    const monthIdx = MONTHS_SHORT.indexOf(abbr);
    if (monthIdx !== -1) {
      const day = parseInt(monthDateMatch[2], 10);
      const now = new Date();
      const year =
        now.getUTCMonth() > monthIdx ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
      return new Date(Date.UTC(year, monthIdx, day)).toISOString().split("T")[0];
    }
  }

  // 4. "the 13th", "the 2nd", etc.
  const ordinalMatch = text.match(/\bthe\s+(\d{1,2})(?:st|nd|rd|th)\b/i);
  if (ordinalMatch) return resolveNearestDayOfMonth(parseInt(ordinalMatch[1], 10));

  return null;
}

interface ChatBoxProps {
  onMealPlanChanged?: () => void;
  initialInput?: string;
}

// Cleared once per JS module lifetime (i.e. once per full page reload).
let sessionCleared = false;

export function ChatBox({ onMealPlanChanged, initialInput }: ChatBoxProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialInput ?? "");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [pendingOverwrites, setPendingOverwrites] = useState<PendingOverwrite[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const conversationContext = useRef<{ activeDate: string | null }>({ activeDate: null });

  // Load chat history on mount, clearing it first if this is a new page load
  useEffect(() => {
    const load = async () => {
      if (!sessionCleared) {
        await fetch("/api/chat", { method: "DELETE" }).catch(() => {});
        sessionCleared = true;
      }
      fetch("/api/llm")
        .then((r) => (r.ok ? r.json() : []))
        .then((history: { role: "user" | "assistant"; content: string }[]) => {
          setMessages(history.map((m) => ({ role: m.role, content: m.content })));
        })
        .catch(() => {})
        .finally(() => setIsLoadingHistory(false));
    };
    load();
  }, []);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    setInput("");
    // Show the raw user text in the UI — no context prefix visible
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setIsStreaming(true);

    // Prepend active-date context to the API payload only (not shown in UI)
    const contextPrefix = conversationContext.current.activeDate
      ? `[Active date context: ${conversationContext.current.activeDate}] `
      : "";
    const messageToSend = contextPrefix + trimmed;

    // Add a placeholder for the streaming assistant reply
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", pending: true },
    ]);

    try {
      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageToSend }),
      });

      // Read before consuming the body — headers are available immediately.
      const expectedActionCount = parseInt(
        res.headers.get("X-Meal-Actions-Count") ?? "0",
        10
      );

      if (!res.ok || !res.body) {
        setMessages((prev) =>
          prev.map((m, i) =>
            i === prev.length - 1
              ? { role: "assistant", content: "Something went wrong. Please try again." }
              : m
          )
        );
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });

        // Display text up to (but not including) the first <meal_action tag.
        // This freezes the display when action blocks start arriving, preventing
        // the fill-then-shrink artifact caused by mid-stream regex stripping.
        const actionStart = accumulated.indexOf("<meal_action");
        const rawDisplay = actionStart === -1 ? accumulated : accumulated.slice(0, actionStart);
        const displayText = rawDisplay.replace(/^\[\d{4}-\d{2}-\d{2}\]\s*/g, "");

        setMessages((prev) =>
          prev.map((m, i) =>
            i === prev.length - 1
              ? { role: "assistant", content: displayText, pending: displayText === "" }
              : m
          )
        );
      }

      // After stream ends: update active-date context for follow-up messages
      const detectedDate = extractActiveDateFromResponse(accumulated);
      if (detectedDate) conversationContext.current.activeDate = detectedDate;

      // After stream ends: parse actions and determine what to show
      const mealActions = parseAllMealActions(accumulated);
      const cleanText = stripMealActions(accumulated);
      const looksLikeRawJson =
        cleanText.includes("</meal_action>") || /^\s*[{[]/.test(cleanText.trim());
      const humanText = cleanText.trim() !== "" && !looksLikeRawJson ? cleanText : "";

      if (mealActions.length > 0) {
        const totalDays = new Set(mealActions.map((a) => a.date)).size;

        const updateProgress = (done: number) => {
          setMessages((prev) =>
            prev.map((m, i) =>
              i === prev.length - 1
                ? {
                    role: "assistant",
                    content: `Saving your meal plan... (${done} / ${totalDays} day${totalDays !== 1 ? "s" : ""})`,
                    pending: false,
                  }
                : m
            )
          );
        };

        // Show progress immediately before the first PATCH fires
        updateProgress(0);

        const { totalApplied: appliedCount, pendingOverwrites: newOverwrites } =
          await applyAllMealActions(mealActions, (done) => {
            updateProgress(done);
          });

        if (newOverwrites.length > 0) setPendingOverwrites(newOverwrites);
        if (appliedCount > 0) onMealPlanChanged?.();

        const summary = buildActionSummary(mealActions, appliedCount);

        // Warn if the client parsed fewer actions than the server validated.
        const clientCount = mealActions.length;
        const mismatchWarning =
          expectedActionCount > 0 && clientCount < expectedActionCount
            ? `\n\n⚠️ ${clientCount} of ${expectedActionCount} planned actions were received — some meals may be missing. Try asking again.`
            : "";

        const finalText = humanText
          ? humanText + (summary ? "\n\n" + summary : "") + mismatchWarning
          : (summary || "I've updated your meal plan.") + mismatchWarning;

        setMessages((prev) =>
          prev.map((m, i) =>
            i === prev.length - 1
              ? { role: "assistant", content: finalText, pending: false }
              : m
          )
        );
      } else {
        // No actions — show human text or a fallback
        setMessages((prev) =>
          prev.map((m, i) =>
            i === prev.length - 1
              ? {
                  role: "assistant",
                  content: humanText || (accumulated.trim() === "" ? "Something went wrong. Please try again." : accumulated),
                  pending: false,
                }
              : m
          )
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1
            ? { role: "assistant", content: "Failed to reach the server." }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }

  async function handleClear() {
    await fetch("/api/chat", { method: "DELETE" });
    setMessages([]);
    conversationContext.current.activeDate = null;
  }

  async function handleApplyOverwrites() {
    const overwrites = pendingOverwrites;
    setPendingOverwrites([]);

    // Group by week, fetch current plan, apply overwrites, PATCH
    const weekGroups = new Map<string, PendingOverwrite[]>();
    for (const ow of overwrites) {
      const weekStart = format(startOfWeek(parseISO(ow.action.date)), "yyyy-MM-dd");
      const existing = weekGroups.get(weekStart) ?? [];
      weekGroups.set(weekStart, [...existing, ow]);
    }

    for (const [weekStart, owList] of weekGroups) {
      const planRes = await fetch(`/api/meal-plan?week=${weekStart}`);
      const existingPlan = planRes.ok ? await planRes.json().catch(() => null) : null;

      type DayEntry = { date: string; status: string; meals: Record<string, unknown>[] };
      const dayMap = new Map<string, DayEntry>();
      for (const d of existingPlan?.days ?? []) {
        dayMap.set(d.date, { date: d.date, status: d.status, meals: [...d.meals] });
      }

      const touchedDates = new Set<string>();
      for (const { action } of owList) {
        const day = dayMap.get(action.date) ?? { date: action.date, status: "none", meals: [] };
        const meal = { ...action.meal, id: crypto.randomUUID() };
        const meals = day.meals as { type: string; id: string }[];
        day.meals = meals.some((m) => m.type === meal.type)
          ? meals.map((m) => (m.type === meal.type ? meal : m))
          : [...meals, meal];
        const types = new Set(day.meals.map((m) => (m as { type: string }).type));
        day.status =
          types.has("breakfast") && types.has("lunch") && types.has("dinner")
            ? "planned"
            : day.meals.length > 0
            ? "in-progress"
            : "none";
        dayMap.set(action.date, day);
        touchedDates.add(action.date);
      }

      for (const date of touchedDates) {
        const day = dayMap.get(date);
        if (!day) continue;
        await fetch("/api/meal-plan", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekStartDate: weekStart, day }),
        });
      }
    }

    onMealPlanChanged?.();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
            <Bot className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="font-semibold text-slate-900 dark:text-white text-sm">
            Meal Assistant
          </span>
        </div>
        <button
          onClick={handleClear}
          disabled={messages.length === 0 || isStreaming}
          title="Clear conversation"
          className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {isLoadingHistory && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
          </div>
        )}

        {!isLoadingHistory && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-8">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
              <Bot className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <p className="font-medium text-slate-700 dark:text-slate-300 text-sm">
                Ask me anything about meals
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                e.g. "Suggest a high-protein lunch for Monday"
              </p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
          >
            {/* Avatar */}
            <div
              className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 ${
                msg.role === "user"
                  ? "bg-emerald-600"
                  : "bg-slate-100 dark:bg-slate-700"
              }`}
            >
              {msg.role === "user" ? (
                <User className="w-3.5 h-3.5 text-white" />
              ) : (
                <Bot className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              )}
            </div>

            {/* Bubble */}
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-emerald-600 text-white rounded-tr-sm"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-tl-sm"
              }`}
            >
              {msg.pending && msg.content === "" ? (
                <span className="flex gap-1 items-center h-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
                </span>
              ) : (
                <span className="whitespace-pre-wrap">{msg.content}</span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Overwrite approval card */}
      {pendingOverwrites.length > 0 && (
        <div className="mx-4 mb-3 rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm">
          <p className="font-semibold text-amber-800 dark:text-amber-300 mb-2">
            ⚠ The assistant wants to replace existing meals:
          </p>
          <ul className="space-y-1.5 mb-3">
            {pendingOverwrites.map((ow, i) => (
              <li key={i} className="text-slate-700 dark:text-slate-300">
                <span className="font-medium">
                  [{format(parseISO(ow.action.date), "EEEE MMM d")} ·{" "}
                  {ow.action.meal.type.charAt(0).toUpperCase() + ow.action.meal.type.slice(1)}]
                </span>
                <br />
                <span className="text-slate-500 dark:text-slate-400">
                  &ldquo;{ow.existingMealName}&rdquo;
                </span>
                {" \u2192 "}
                <span>&ldquo;{ow.action.meal.name}&rdquo;</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              onClick={handleApplyOverwrites}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
            >
              Apply changes
            </button>
            <button
              onClick={() => setPendingOverwrites([])}
              className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors"
            >
              Keep my choices
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about meal ideas…"
            rows={1}
            disabled={isStreaming}
            className="flex-1 resize-none rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="flex-shrink-0 w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:pointer-events-none text-white flex items-center justify-center transition-colors"
          >
            {isStreaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 text-center">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
