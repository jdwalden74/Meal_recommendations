import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ChatHistoryData, MealPlanData, UserPreferencesData } from "@/lib/datalayer";
import { chatStream } from "@/lib/llm";
import type { LlmMessage } from "@/lib/llm";
import { LlmAction, MealPlan, MealType, UserPreferences } from "@/lib/interfaces";
import { getRecommendations, RecommendedFood } from "@/lib/ml";

export const dynamic = "force-dynamic";

// ─── System-prompt builder ─────────────────────────────────────────────────────

const ACTION_SCHEMA = `
Whenever the user asks you to plan, suggest, create, add, change, or remove meals — including
requests like "make a plan for X", "suggest meals for Y", "what should I eat on Z", or "plan my
week" — you MUST append one <meal_action> block per meal slot AFTER all human-readable text.

Only skip <meal_action> blocks when the user is asking a general question (e.g. "what's a good
protein source?") and has NOT asked for specific meals on specific dates.

For a single meal output 1 block. For a full day (breakfast + lunch + dinner) output 3 blocks.
For a full week of 3 meals per day output up to 21 blocks. Each block must target exactly one meal
slot on one date.

Set-meal format (add or replace a meal slot):
<meal_action>
{
  "action": "set_meal",
  "date": "YYYY-MM-DD",
  "meal": {
    "id": "PLACEHOLDER_ID",
    "name": "<meal name>",
    "type": "breakfast" | "lunch" | "dinner" | "snack",
    "time": "<e.g. 8:00 AM>",
    "image": "",
    "description": "<short description>",
    "nutrition": {
      "calories": <number>,
      "protein": <grams>,
      "carbs": <grams>,
      "fat": <grams>
    },
    "ingredients": ["<ingredient1>", "<ingredient2>"]
  }
}
</meal_action>

Clear-meal format (remove a meal slot):
<meal_action>
{
  "action": "clear_meal",
  "date": "YYYY-MM-DD",
  "mealType": "breakfast" | "lunch" | "dinner" | "snack"
}
</meal_action>

Rules:
- Output one <meal_action> block PER meal being added, modified, or removed.
- Always respect the user's dietary restrictions, allergies, and preferences.
- Use ISO date format YYYY-MM-DD for the date field. Never use relative date strings.
- If the user asks what meals you'd suggest or what they'd like, generate specific meal recommendations with full <meal_action> blocks. Do not respond with empty category headers like "Breakfast:", "Lunch:", "Dinner:" followed by nothing — every meal you mention must have a name, description, and complete nutrition data.
`.trim();

function summarizePlans(plans: MealPlan[], today: string): string {
  const todayMs = new Date(today + "T00:00:00Z").getTime();
  const cap14Date = new Date(todayMs + 14 * 86400000).toISOString().split("T")[0];
  const next7Date = new Date(todayMs + 7 * 86400000).toISOString().split("T")[0];

  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const lines: string[] = [];
  let dayCount = 0;

  const sortedPlans = [...plans].sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate));

  for (const plan of sortedPlans) {
    if (dayCount >= 14) break;
    const sortedDays = [...plan.days].sort((a, b) => a.date.localeCompare(b.date));
    const weekLines: string[] = [];

    for (const day of sortedDays) {
      if (dayCount >= 14) break;
      if (day.date < today || day.date > cap14Date) continue;

      const hasMeals = day.meals.length > 0;
      const withinNext7 = day.date <= next7Date;
      if (!hasMeals && !withinNext7) continue;

      const d = new Date(day.date + "T00:00:00Z");
      const label = `${DAY_NAMES[d.getUTCDay()]} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;

      if (!hasMeals) {
        weekLines.push(`- ${label}: no meals planned`);
      } else {
        const fmt = (type: string) => {
          const m = day.meals.find((x) => x.type === type);
          return m ? `${m.name} (${m.nutrition.calories} kcal)` : "none";
        };
        weekLines.push(
          `- ${label}: Breakfast: ${fmt("breakfast")} | Lunch: ${fmt("lunch")} | Dinner: ${fmt("dinner")}`
        );
      }
      dayCount++;
    }

    if (weekLines.length > 0) {
      lines.push(`Week of ${plan.weekStartDate}:`);
      lines.push(...weekLines);
    }
  }

  return lines.join("\n");
}

function buildSystemPrompt(
  preferences: UserPreferences | null,
  recentPlans: MealPlan[],
  today: string,
  recommendations: RecommendedFood[]
): string {
  const tomorrowDate = new Date(today + "T00:00:00Z");
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrow = tomorrowDate.toISOString().split("T")[0];

  const lines: string[] = [
    `TODAY IS ${today}. TOMORROW IS ${tomorrow}. Use these dates for ALL relative date references.`,
    "",
    "You are a helpful meal planning assistant.",
    "You help users plan healthy, personalized meals for their weekly calendar.",
    "Keep responses concise and practical.",
    `NEVER start your response with a date prefix like [${today}]. Do not output any date stamps.`,
    "",
  ];

  // ── Hard constraints (FIRST — overrides everything else) ──────────────────
  lines.push("## HARD CONSTRAINTS — READ FIRST");
  lines.push(
    "The following are absolute restrictions. They override every other instruction, " +
    "suggestion, or user request in this conversation. There are no exceptions."
  );
  lines.push(
    "- NEVER ask a clarifying question AND output <meal_action> blocks in the same response. " +
    "If you are going to add meals, just add them with your best judgment based on the user's preferences. " +
    "If you genuinely need clarification first, ask ONLY the question — no action blocks. " +
    "Pick one or the other, never both."
  );
  if (preferences?.allergies.length) {
    for (const allergy of preferences.allergies) {
      lines.push(`- NEVER include ${allergy} under any circumstances.`);
    }
  }
  lines.push("");

  // ── Action schema ──────────────────────────────────────────────────────────
  lines.push("## How to Modify Meal Plans (READ THIS FIRST)");
  lines.push(ACTION_SCHEMA);
  lines.push("");

  // ── User preferences section ───────────────────────────────────────────────
  if (preferences) {
    lines.push("## User Preferences (apply to ALL suggestions)");
    if (preferences.dietaryRestrictions.length > 0) {
      lines.push(`- Dietary restrictions: ${preferences.dietaryRestrictions.join(", ")}`);
    }
    if (preferences.allergies.length > 0) {
      lines.push(`- Allergies (never suggest these): ${preferences.allergies.join(", ")}`);
    }
    if (preferences.dislikedIngredients.length > 0) {
      lines.push(`- Disliked ingredients (avoid): ${preferences.dislikedIngredients.join(", ")}`);
    }
    if (preferences.cuisinePreferences.length > 0) {
      lines.push(`- Cuisine preferences: ${preferences.cuisinePreferences.join(", ")}`);
    }
    lines.push(`- Daily caloric target: ${preferences.caloricTarget} kcal`);
    if (preferences.budgetPerWeek) {
      lines.push(`- Weekly grocery budget: $${preferences.budgetPerWeek}`);
    }
    if (preferences.maxCookTimeMinutes) {
      lines.push(`- Max cook time per meal: ${preferences.maxCookTimeMinutes} minutes`);
    }
    lines.push("");
  } else {
    lines.push("## User Preferences");
    lines.push("No preferences saved yet. Ask the user about dietary restrictions if relevant.");
    lines.push("");
  }

  // ── Current meal plans section ─────────────────────────────────────────────
  if (recentPlans.length > 0) {
    lines.push("## Current Meal Plan");
    lines.push(summarizePlans(recentPlans, today));
    lines.push("");
  } else {
    lines.push("## Current Meal Plan");
    lines.push("No meal plans have been created yet.");
    lines.push("");
  }

  // ── Personalized ingredient suggestions ───────────────────────────────────
  lines.push("## Personalized Ingredient Suggestions");
  if (recommendations.length > 0) {
    lines.push(
      "The following foods have been selected by a recommendation model based on this " +
      "user's caloric target, dietary restrictions, and past meal ratings. " +
      "Prefer these ingredients when building meals, but you are not limited to them — " +
      "use your judgement to compose balanced, varied meals."
    );
    lines.push(
      "CRITICAL: Never suggest any food that conflicts with the user's allergies or dietary " +
      "restrictions, regardless of whether it appears in this list."
    );
    lines.push("");
    for (const food of recommendations.slice(0, 8)) {
      lines.push(`- ${food.name} (${food.calories} kcal)`);
    }
  } else {
    lines.push("No personalized suggestions available for this session.");
  }
  lines.push("");

  // ── Date handling rules ────────────────────────────────────────────────────
  lines.push("## Date Handling Rules");
  lines.push(`- "the Nth" → find the next upcoming date with that day number from today`);
  lines.push(`- "tomorrow" → ${tomorrow}`);
  lines.push(`- "next [weekday]" → calculate from today, resolve silently, never ask`);
  lines.push("");

  // ── History handling rules ─────────────────────────────────────────────────
  lines.push("## Conversation History Rules");
  lines.push(
    "Chat history is provided as read-only context. Each historical message is prefixed " +
    "with a [YYYY-MM-DD] timestamp. Treat these as completed past exchanges — do NOT " +
    "continue threads from prior conversations or follow up on questions you asked in history."
  );
  lines.push(
    "CRITICAL: Respond ONLY to the user's LATEST message. If the user's latest message is " +
    "ambiguous, ask for clarification based on THAT message alone — never carry forward " +
    "unanswered questions from history into your response."
  );
  lines.push(
    "CRITICAL: Do NOT prefix your responses with a date stamp like [2026-04-15]. " +
    "Date prefixes are only used in history for context — never output them yourself."
  );
  lines.push("");

  return lines.join("\n");
}

// ─── Meal-action validator ─────────────────────────────────────────────────────

const MEAL_TYPES = new Set<MealType>(["breakfast", "lunch", "dinner", "snack"]);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidLlmAction(value: unknown): value is LlmAction {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;

  if (!ISO_DATE_RE.test(obj.date as string)) return false;

  if (obj.action === "clear_meal") {
    return MEAL_TYPES.has(obj.mealType as MealType);
  }

  if (obj.action === "set_meal") {
    const meal = obj.meal as Record<string, unknown> | undefined;
    if (!meal || typeof meal !== "object") return false;
    return (
      typeof meal.id === "string" &&
      typeof meal.name === "string" && meal.name.trim() !== "" &&
      MEAL_TYPES.has(meal.type as MealType) &&
      typeof meal.time === "string" &&
      typeof meal.image === "string" &&
      meal.nutrition !== null &&
      typeof meal.nutrition === "object" &&
      typeof (meal.nutrition as Record<string, unknown>).calories === "number" &&
      typeof (meal.nutrition as Record<string, unknown>).protein === "number" &&
      typeof (meal.nutrition as Record<string, unknown>).carbs === "number" &&
      typeof (meal.nutrition as Record<string, unknown>).fat === "number"
    );
  }

  return false;
}

/**
 * Extracts all <meal_action> blocks from the LLM reply, validates each against
 * LlmAction, logs malformed ones, and returns the count of valid actions.
 */
function parseAndValidateMealActions(reply: string): number {
  let validCount = 0;

  for (const match of reply.matchAll(/<meal_action>([\s\S]*?)<\/meal_action>/g)) {
    const raw = match[1].trim();
    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn("[POST /api/llm] malformed <meal_action> — JSON parse failed", {
        error: (err as Error).message,
        raw,
      });
      continue;
    }

    if (isValidLlmAction(parsed)) {
      validCount++;
    } else {
      console.warn("[POST /api/llm] malformed <meal_action> — failed LlmAction validation", {
        raw,
      });
    }
  }

  return validCount;
}

// ─── Timeout error ────────────────────────────────────────────────────────────

class TimeoutError extends Error {}

// ─── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.email ?? null;
}

// ─── POST /api/llm ─────────────────────────────────────────────────────────────
// Sends a user message to Gemini, saves both messages to history, streams reply.
// Body: { message: string }

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON." }, { status: 400 });
    }
    const { message } = (body as Record<string, unknown>) ?? {};

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return Response.json(
        { error: "message must be a non-empty string." },
        { status: 400 }
      );
    }

    const trimmedMessage = message.trim();
    const today = new Date().toISOString().split("T")[0];

    // ── Load context (preferences + recent plans + history) in parallel ────────
    const chatData = new ChatHistoryData();
    const prefsData = new UserPreferencesData();
    const mealPlanData = new MealPlanData();

    const [history, preferences, allPlans] = await Promise.all([
      chatData.getHistory(userId, 10),
      prefsData.getPreferences(userId),
      mealPlanData.getUserMealPlans(userId),
    ]);

    const recommendations = preferences
      ? await getRecommendations(userId, preferences)
      : [];

    // Keep plans from the past 7 days onward (no stale history)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);
    const cutoffStr = cutoffDate.toISOString().split("T")[0];
    const recentPlans = allPlans.filter((p) => p.weekStartDate >= cutoffStr);

    // ── Build system prompt with context ──────────────────────────────────────
    const systemPrompt = buildSystemPrompt(preferences, recentPlans, today, recommendations);

    // ── Strip meal-plan confirmation messages from history ────────────────────
    // Assistant messages that are long or contain structured meal markers are
    // already reflected in the system-prompt meal plan JSON. Including them in
    // history double-counts old context and causes the model to reference stale
    // meals (e.g. "leftover Osso Buco"). User messages are always kept intact.
    const MEAL_CONTENT_RE = /Breakfast:|Lunch:|Dinner:|kcal|protein|carbs/i;
    const filteredHistory = history.filter(
      (m) => m.role !== "assistant" || (m.content.length <= 500 && !MEAL_CONTENT_RE.test(m.content))
    );

    // ── Build Gemini message list ─────────────────────────────────────────────
    const llmMessages: LlmMessage[] = [
      { role: "user", content: systemPrompt },
      { role: "model", content: "Understood! I'm ready to help with meal planning, taking your preferences and current meal plans into account." },
      ...filteredHistory.map((m) => ({
        role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
        // Prefix each historical message with its date so the model can
        // distinguish old context from the current request and never reuses
        // dates from past plan confirmations in new <meal_action> blocks.
        content: `[${new Date(m.timestamp).toISOString().split("T")[0]}] ${m.content}`,
      })),
      // Clear separator so the LLM never treats the latest message as a
      // continuation of any pending question from history.
      ...(filteredHistory.length > 0
        ? [
            {
              role: "user" as const,
              content:
                "--- END OF CONVERSATION HISTORY ---\n" +
                "The messages above are READ-ONLY past context. Do NOT reference specific meals, " +
                "leftovers, or plans from that history unless the user explicitly asks you to. " +
                "The current meal plan state is shown in the system prompt above and is the " +
                "authoritative source. Respond ONLY to my next message as a completely fresh request.",
            },
            {
              role: "model" as const,
              content:
                "Understood. I will not reference past conversation meals or carry forward any " +
                "prior context. I will respond to your next message based solely on your current " +
                "meal plan and preferences as shown in the system prompt.",
            },
          ]
        : []),
      { role: "user", content: trimmedMessage },
    ];

    // ── Save user message ─────────────────────────────────────────────────────
    const cleanedMessage = trimmedMessage.replace(/^\[Active date context: \d{4}-\d{2}-\d{2}\]\s*/, "");
    await chatData.addMessage({ userId, role: "user", content: cleanedMessage });

    // ── Collect full reply ────────────────────────────────────────────────────
    // We buffer the entire LLM output before responding so that:
    //   (a) meal actions can be parsed and validated server-side, and
    //   (b) X-Meal-Actions-Count can be set as a true response header
    //       (HTTP headers must be sent before the body).
    let fullReply = "";
    try {
      await Promise.race([
        (async () => {
          for await (const chunk of chatStream(llmMessages)) {
            fullReply += chunk;
          }
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new TimeoutError("LLM timeout")), 25000)
        ),
      ]);
    } catch (err) {
      if (err instanceof TimeoutError) {
        console.warn("[POST /api/llm] stream timed out after 25s");
        fullReply = "I'm taking too long to respond — please try again.";
      } else {
        console.error("[POST /api/llm] stream error", err);
        fullReply = "Sorry, I couldn't generate a response. Please try again.";
      }
    }

    // ── Parse & validate meal actions ─────────────────────────────────────────
    const mealActionsCount = parseAndValidateMealActions(fullReply);

    // ── Persist assistant reply (without action blocks) ───────────────────────
    const cleanReply = fullReply
      .replace(/<meal_action>[\s\S]*?<\/meal_action>/g, "")
      .trim();
    await chatData.addMessage({ userId, role: "assistant", content: cleanReply });

    // ── Return buffered reply as a streaming-compatible response ──────────────
    // The client reads via getReader() and handles both single-chunk and
    // multi-chunk bodies identically, so this is transparent to ChatBox.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(fullReply));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "X-Meal-Actions-Count": String(mealActionsCount),
      },
    });
  } catch (err) {
    console.error("[POST /api/llm]", err);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}

// ─── GET /api/llm ──────────────────────────────────────────────────────────────
// Returns the user's chat history (convenience alias for /api/chat GET).

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rawLimit = searchParams.get("limit");
    const limit = rawLimit ? parseInt(rawLimit, 10) : 50;

    const chatData = new ChatHistoryData();
    const history = await chatData.getHistory(userId, limit);
    return Response.json(history);
  } catch (err) {
    console.error("[GET /api/llm]", err);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}
