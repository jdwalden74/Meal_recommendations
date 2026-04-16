import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ChatHistoryData, MealPlanData, UserPreferencesData } from "@/lib/datalayer";
import { chatStream } from "@/lib/llm";
import type { LlmMessage } from "@/lib/llm";
import { MealPlan, UserPreferences } from "@/lib/interfaces";

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
`.trim();

function buildSystemPrompt(
  preferences: UserPreferences | null,
  recentPlans: MealPlan[],
  today: string
): string {
  const lines: string[] = [
    `You are a helpful meal planning assistant. Today's date is ${today}.`,
    "You help users plan healthy, personalized meals for their weekly calendar.",
    "Keep responses concise and practical.",
    `NEVER start your response with a date prefix like [${today}]. Do not output any date stamps.`,
    "",
  ];

  // ── Action schema (FIRST — highest priority instruction) ───────────────────
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
    lines.push("## Current Meal Plans (JSON)");
    lines.push("The following shows the user's existing meal plans. Use this as context when answering questions or making changes.");
    lines.push("```json");
    lines.push(JSON.stringify(recentPlans, null, 2));
    lines.push("```");
    lines.push("");
  } else {
    lines.push("## Current Meal Plans");
    lines.push("No meal plans have been created yet.");
    lines.push("");
  }

  // ── Date handling rules ────────────────────────────────────────────────────
  lines.push("## Date Handling Rules");
  lines.push(`Today is ${today} (YYYY-MM-DD).`);
  lines.push(
    "When the user says 'tomorrow', 'next Monday', 'this week', 'next week', etc., " +
    "calculate the absolute ISO 8601 date and use ONLY that form inside <meal_action> blocks. " +
    "Never write a relative date string inside a <meal_action> block."
  );
  lines.push(
    "CRITICAL: Dates inside <meal_action> blocks must be derived ONLY from the user's " +
    "CURRENT message and today's date. NEVER copy or reuse dates that appear in prior " +
    "conversation history when writing new <meal_action> blocks — history is reference only."
  );
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

  // Compute dynamic examples anchored to the real today so the LLM sees
  // accurate arithmetic rather than hardcoded illustrative dates.
  const todayDate = new Date(today + "T00:00:00Z");
  const dow = todayDate.getUTCDay(); // 0=Sun…6=Sat
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const addDays = (d: Date, n: number) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; };
  const iso = (d: Date) => d.toISOString().split("T")[0];
  const daysToNextMonday = dow === 0 ? 1 : dow === 1 ? 7 : 8 - dow;
  const daysToNextFriday = dow < 5 ? 5 - dow : 5 - dow + 7;
  const nextMondayStr = iso(addDays(todayDate, daysToNextMonday));
  const nextFridayStr = iso(addDays(todayDate, daysToNextFriday));
  const nwEndStr = iso(addDays(todayDate, daysToNextMonday + 6));

  lines.push(`Examples (today is ${today}, a ${dayNames[dow]}):`);
  lines.push(`- "tomorrow"    → "${iso(addDays(todayDate, 1))}"`);
  lines.push(`- "next Monday" → "${nextMondayStr}"`);
  lines.push(`- "this Friday" → "${nextFridayStr}"`);
  lines.push(`- "next week"   → ${nextMondayStr} through ${nwEndStr}`);
  lines.push("");

  return lines.join("\n");
}

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

    const body = await request.json();
    const { message } = body ?? {};

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
      chatData.getHistory(userId, 20),
      prefsData.getPreferences(userId),
      mealPlanData.getUserMealPlans(userId),
    ]);

    // Keep plans from the past 7 days onward (no stale history)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);
    const cutoffStr = cutoffDate.toISOString().split("T")[0];
    const recentPlans = allPlans.filter((p) => p.weekStartDate >= cutoffStr);

    // ── Build system prompt with context ──────────────────────────────────────
    const systemPrompt = buildSystemPrompt(preferences, recentPlans, today);

    // ── Build Gemini message list ─────────────────────────────────────────────
    const llmMessages: LlmMessage[] = [
      { role: "user", content: systemPrompt },
      { role: "model", content: "Understood! I'm ready to help with meal planning, taking your preferences and current meal plans into account." },
      ...history.map((m) => ({
        role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
        // Prefix each historical message with its date so the model can
        // distinguish old context from the current request and never reuses
        // dates from past plan confirmations in new <meal_action> blocks.
        content: `[${new Date(m.timestamp).toISOString().split("T")[0]}] ${m.content}`,
      })),
      // Clear separator so the LLM never treats the latest message as a
      // continuation of any pending question from history.
      ...(history.length > 0
        ? [
            {
              role: "user" as const,
              content:
                "--- END OF HISTORY --- The above messages are past context only. " +
                "Please respond ONLY to my next message as a fresh request.",
            },
            {
              role: "model" as const,
              content:
                "Understood. I'll treat the above as past context and respond fully to your " +
                "next message, including outputting <meal_action> blocks as needed.",
            },
          ]
        : []),
      { role: "user", content: trimmedMessage },
    ];

    // ── Save user message ─────────────────────────────────────────────────────
    await chatData.addMessage({ userId, role: "user", content: trimmedMessage });

    // ── Stream response ───────────────────────────────────────────────────────
    const encoder = new TextEncoder();
    let fullReply = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of chatStream(llmMessages)) {
            fullReply += chunk;
            controller.enqueue(encoder.encode(chunk));
          }
          // Strip <meal_action> blocks before saving to history so they don't
          // pollute future LLM context.
          const cleanReply = fullReply
            .replace(/<meal_action>[\s\S]*?<\/meal_action>/g, "")
            .trim();
          await chatData.addMessage({ userId, role: "assistant", content: cleanReply });
        } catch (err) {
          console.error("[POST /api/llm] stream error", err);
          controller.enqueue(
            encoder.encode("Sorry, I couldn't generate a response. Please try again.")
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Content-Type-Options": "nosniff",
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
