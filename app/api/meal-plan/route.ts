import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { MealPlanData } from "@/lib/datalayer";
import { DayMeals, Meal, MealStatus, MealType, NutritionalInfo } from "@/lib/interfaces";

// ─── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.email ?? null;
}

// ─── Validation helpers ────────────────────────────────────────────────────────

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const VALID_MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const VALID_STATUSES: MealStatus[] = ["planned", "in-progress", "none"];

function isValidIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE_REGEX.test(value);
}

function validateNutrition(n: unknown): n is NutritionalInfo {
  if (typeof n !== "object" || n === null) return false;
  const obj = n as Record<string, unknown>;
  return (
    typeof obj.calories === "number" &&
    typeof obj.protein === "number" &&
    typeof obj.carbs === "number" &&
    typeof obj.fat === "number"
  );
}

function validateMeal(m: unknown): m is Meal {
  if (typeof m !== "object" || m === null) return false;
  const obj = m as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.name === "string" &&
    VALID_MEAL_TYPES.includes(obj.type as MealType) &&
    typeof obj.time === "string" &&
    typeof obj.image === "string" &&
    validateNutrition(obj.nutrition)
  );
}

function validateDayMeals(d: unknown): d is DayMeals {
  if (typeof d !== "object" || d === null) return false;
  const obj = d as Record<string, unknown>;
  return (
    isValidIsoDate(obj.date) &&
    VALID_STATUSES.includes(obj.status as MealStatus) &&
    Array.isArray(obj.meals) &&
    obj.meals.every(validateMeal)
  );
}

// ─── GET /api/meal-plan?week=YYYY-MM-DD ────────────────────────────────────────
// Returns the meal plan for the given week start date.
// Omit the `week` param to get all plans for the user.

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      console.warn("[GET /api/meal-plan] No session — returning 401");
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const week = searchParams.get("week");

    const mealPlanData = new MealPlanData();

    // No week param → return all plans (e.g. for a history view)
    if (!week) {
      const plans = await mealPlanData.getUserMealPlans(userId);
      return Response.json(plans);
    }

    if (!isValidIsoDate(week)) {
      return Response.json(
        { error: "Query param 'week' must be a valid ISO date (YYYY-MM-DD)." },
        { status: 400 }
      );
    }

    const plan = await mealPlanData.getMealPlan(userId, week);
    if (!plan) {
      return Response.json(
        { error: `No meal plan found for week starting ${week}.` },
        { status: 404 }
      );
    }

    return Response.json(plan);
  } catch (err) {
    console.error("[GET /api/meal-plan]", err);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}

// ─── POST /api/meal-plan ───────────────────────────────────────────────────────
// Creates a new meal plan for a week.
// Body: { weekStartDate: string; days: DayMeals[] }

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      console.warn("[POST /api/meal-plan] No session — returning 401");
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const { weekStartDate, days } = body ?? {};

    // ── Validation ──────────────────────────────────────────────────────────
    if (!isValidIsoDate(weekStartDate)) {
      return Response.json(
        { error: "weekStartDate must be a valid ISO date string (YYYY-MM-DD)." },
        { status: 400 }
      );
    }

    if (!Array.isArray(days) || days.length === 0) {
      return Response.json(
        { error: "days must be a non-empty array." },
        { status: 400 }
      );
    }

    const invalidDays = days
      .map((d, i) => (validateDayMeals(d) ? null : i))
      .filter((i) => i !== null);

    if (invalidDays.length > 0) {
      console.warn("[POST /api/meal-plan] Validation failed at day indices:", invalidDays, JSON.stringify(days[invalidDays[0] as number]));
      return Response.json(
        { error: `Invalid day entries at index: ${invalidDays.join(", ")}.` },
        { status: 400 }
      );
    }

    // ── Duplicate check ─────────────────────────────────────────────────────
    const mealPlanData = new MealPlanData();
    const existing = await mealPlanData.getMealPlan(userId, weekStartDate);
    if (existing) {
      return Response.json(
        {
          error: `A meal plan for week ${weekStartDate} already exists. Use PUT to update it.`,
        },
        { status: 409 }
      );
    }

    const result = await mealPlanData.createMealPlan({ userId, weekStartDate, days });
    return Response.json({ insertedId: result.insertedId }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/meal-plan]", err);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}

// ─── PUT /api/meal-plan ────────────────────────────────────────────────────────
// Replaces the days array of an existing meal plan.
// Primarily called when the LLM produces structured output modifying the plan.
// Body: { weekStartDate: string; days: DayMeals[] }

export async function PUT(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      console.warn("[PUT /api/meal-plan] No session — returning 401");
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const { weekStartDate, days } = body ?? {};

    // ── Validation ──────────────────────────────────────────────────────────
    if (!isValidIsoDate(weekStartDate)) {
      return Response.json(
        { error: "weekStartDate must be a valid ISO date string (YYYY-MM-DD)." },
        { status: 400 }
      );
    }

    if (!Array.isArray(days) || days.length === 0) {
      return Response.json(
        { error: "days must be a non-empty array." },
        { status: 400 }
      );
    }

    const invalidDays = days
      .map((d, i) => (validateDayMeals(d) ? null : i))
      .filter((i) => i !== null);

    if (invalidDays.length > 0) {
      console.warn("[PUT /api/meal-plan] Validation failed at day indices:", invalidDays, JSON.stringify(days[invalidDays[0] as number]));
      return Response.json(
        { error: `Invalid day entries at index: ${invalidDays.join(", ")}.` },
        { status: 400 }
      );
    }

    // ── Update ──────────────────────────────────────────────────────────────
    const mealPlanData = new MealPlanData();
    const updated = await mealPlanData.updateMealPlanDays(userId, weekStartDate, days);

    if (!updated) {
      return Response.json(
        { error: `No meal plan found for week ${weekStartDate}.` },
        { status: 404 }
      );
    }

    return Response.json(updated);
  } catch (err) {
    console.error("[PUT /api/meal-plan]", err);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}

// ─── PATCH /api/meal-plan ──────────────────────────────────────────────────────
// Insert or replace a single day within a week's plan.
// Primarily for LLM-driven updates where only one day changes at a time.
// Body: { weekStartDate: string; day: DayMeals }

export async function PATCH(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const { weekStartDate, day } = body ?? {};

    if (!isValidIsoDate(weekStartDate)) {
      return Response.json(
        { error: "weekStartDate must be a valid ISO date string (YYYY-MM-DD)." },
        { status: 400 }
      );
    }

    if (!validateDayMeals(day)) {
      return Response.json({ error: "Invalid day entry." }, { status: 400 });
    }

    const mealPlanData = new MealPlanData();
    const result = await mealPlanData.upsertDay(userId, weekStartDate, day);
    return Response.json(result, { status: 200 });
  } catch (err) {
    console.error("[PATCH /api/meal-plan]", err);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}
