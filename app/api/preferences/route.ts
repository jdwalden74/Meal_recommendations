import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { UserPreferencesData } from "@/lib/datalayer";
import { UserPreferences } from "@/lib/interfaces";

// ─── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.email ?? null;
}

// ─── GET /api/preferences ──────────────────────────────────────────────────────
// Returns the stored preferences for the authenticated user.

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const prefsData = new UserPreferencesData();
    const preferences = await prefsData.getPreferences(userId);

    if (!preferences) {
      return Response.json({ error: "No preferences found." }, { status: 404 });
    }

    return Response.json(preferences);
  } catch (err) {
    console.error("[GET /api/preferences]", err);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}

// ─── PUT /api/preferences ──────────────────────────────────────────────────────
// Creates or fully replaces the authenticated user's preferences.
// Body: Omit<UserPreferences, "_id" | "userId" | "updatedAt">

export async function PUT(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();

    // ── Validation ──────────────────────────────────────────────────────────
    const errors: string[] = [];

    if (!Array.isArray(body.dietaryRestrictions)) {
      errors.push("dietaryRestrictions must be an array of strings.");
    }
    if (!Array.isArray(body.allergies)) {
      errors.push("allergies must be an array of strings.");
    }
    if (!Array.isArray(body.dislikedIngredients)) {
      errors.push("dislikedIngredients must be an array of strings.");
    }
    if (!Array.isArray(body.cuisinePreferences)) {
      errors.push("cuisinePreferences must be an array of strings.");
    }
    if (typeof body.caloricTarget !== "number" || body.caloricTarget <= 0) {
      errors.push("caloricTarget must be a positive number.");
    }
    if (
      body.budgetPerWeek !== undefined &&
      (typeof body.budgetPerWeek !== "number" || body.budgetPerWeek < 0)
    ) {
      errors.push("budgetPerWeek must be a non-negative number if provided.");
    }
    if (
      body.maxCookTimeMinutes !== undefined &&
      (typeof body.maxCookTimeMinutes !== "number" || body.maxCookTimeMinutes <= 0)
    ) {
      errors.push("maxCookTimeMinutes must be a positive number if provided.");
    }

    if (errors.length > 0) {
      return Response.json({ errors }, { status: 400 });
    }

    // ── Build payload (only known fields, no injection) ─────────────────────
    const payload: Omit<UserPreferences, "_id" | "userId" | "updatedAt"> = {
      dietaryRestrictions: body.dietaryRestrictions,
      allergies: body.allergies,
      dislikedIngredients: body.dislikedIngredients,
      cuisinePreferences: body.cuisinePreferences,
      caloricTarget: body.caloricTarget,
      ...(body.budgetPerWeek !== undefined && { budgetPerWeek: body.budgetPerWeek }),
      ...(body.maxCookTimeMinutes !== undefined && {
        maxCookTimeMinutes: body.maxCookTimeMinutes,
      }),
    };

    const prefsData = new UserPreferencesData();
    const updated = await prefsData.upsertPreferences(userId, payload);

    return Response.json(updated, { status: 200 });
  } catch (err) {
    console.error("[PUT /api/preferences]", err);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}
