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

/**
 * Apply all meal actions in a batched, efficient way:
 * - Groups actions by week (one GET per week, not per meal)
 * - Applies all mutations in-memory
 * - PATCHes each touched day once
 * Returns the total number of meals successfully applied.
 */
async function applyAllMealActions(
  actions: MealAction[],
  onDayApplied: (daysApplied: number) => void
): Promise<number> {
  // Group by week start date
  const weekGroups = new Map<string, MealAction[]>();
  for (const action of actions) {
    const weekStart = format(startOfWeek(parseISO(action.date)), "yyyy-MM-dd");
    const existing = weekGroups.get(weekStart) ?? [];
    weekGroups.set(weekStart, [...existing, action]);
  }

  let totalApplied = 0;
  let daysApplied = 0;

  for (const [weekStart, weekActions] of weekGroups) {
    // ONE GET per week (not per action)
    const planRes = await fetch(`/api/meal-plan?week=${weekStart}`);
    const existingPlan = planRes.ok ? await planRes.json().catch(() => null) : null;

    type DayEntry = { date: string; status: string; meals: Record<string, unknown>[] };
    const dayMap = new Map<string, DayEntry>();
    for (const d of existingPlan?.days ?? []) {
      dayMap.set(d.date, { date: d.date, status: d.status, meals: [...d.meals] });
    }

    const touchedDates = new Set(weekActions.map((a) => a.date));

    // Apply every action in-memory
    for (const action of weekActions) {
      const day = dayMap.get(action.date) ?? { date: action.date, status: "none", meals: [] };

      if (action.action === "set_meal") {
        const meal = { ...action.meal, id: crypto.randomUUID() };
        const meals = day.meals as { type: string; id: string }[];
        day.meals = meals.some((m) => m.type === meal.type)
          ? meals.map((m) => (m.type === meal.type ? meal : m))
          : [...meals, meal];
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
        totalApplied += weekActions.filter((a) => a.date === date).length;
        daysApplied++;
        onDayApplied(daysApplied);
      }
    }
  }

  return totalApplied;
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

interface ChatBoxProps {
  onMealPlanChanged?: () => void;
}

export function ChatBox({ onMealPlanChanged }: ChatBoxProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load chat history on mount, clearing it first if this is a new browser session
  useEffect(() => {
    const load = async () => {
      if (!sessionStorage.getItem("chat-session-active")) {
        await fetch("/api/chat", { method: "DELETE" }).catch(() => {});
        sessionStorage.setItem("chat-session-active", "1");
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
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setIsStreaming(true);

    // Add a placeholder for the streaming assistant reply
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", pending: true },
    ]);

    try {
      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

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

        const appliedCount = await applyAllMealActions(mealActions, (done) => {
          updateProgress(done);
        });

        if (appliedCount > 0) onMealPlanChanged?.();

        const summary = buildActionSummary(mealActions, appliedCount);
        const finalText = humanText
          ? humanText + (summary ? "\n\n" + summary : "")
          : summary || "I've updated your meal plan.";

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
