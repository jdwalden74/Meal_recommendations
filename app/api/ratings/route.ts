import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { MealRatingData } from "@/lib/datalayer";
import { NutritionalInfo } from "@/lib/interfaces";

// ─── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.email ?? null;
}

// ─── GET /api/ratings ──────────────────────────────────────────────────────────
// Returns the authenticated user's 30 most recent ratings (newest first).
// Used by the ML service to build the rated_meals payload for /recommend.

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const ratingsData = new MealRatingData();
    const ratings = await ratingsData.getRecentRatings(userId);

    return Response.json(ratings);
  } catch (err) {
    console.error("[GET /api/ratings]", err);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}

// ─── POST /api/ratings ─────────────────────────────────────────────────────────
// Body: { mealId: string, mealName: string, rating: number, nutrition: NutritionalInfo }
// Upserts by (userId, mealId) so re-rating replaces rather than duplicates.

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();

    // ── Validation ──────────────────────────────────────────────────────────
    const errors: string[] = [];

    if (typeof body.mealId !== "string" || body.mealId.trim() === "") {
      errors.push("mealId must be a non-empty string.");
    }
    if (typeof body.mealName !== "string" || body.mealName.trim() === "") {
      errors.push("mealName must be a non-empty string.");
    }
    if (
      typeof body.rating !== "number" ||
      !Number.isInteger(body.rating) ||
      body.rating < 1 ||
      body.rating > 5
    ) {
      errors.push("rating must be an integer between 1 and 5.");
    }

    const n = body.nutrition;
    if (!n || typeof n !== "object") {
      errors.push("nutrition must be an object.");
    } else {
      if (typeof n.calories !== "number" || n.calories < 0) {
        errors.push("nutrition.calories must be a non-negative number.");
      }
      if (typeof n.protein !== "number" || n.protein < 0) {
        errors.push("nutrition.protein must be a non-negative number.");
      }
      if (typeof n.carbs !== "number" || n.carbs < 0) {
        errors.push("nutrition.carbs must be a non-negative number.");
      }
      if (typeof n.fat !== "number" || n.fat < 0) {
        errors.push("nutrition.fat must be a non-negative number.");
      }
    }

    if (errors.length > 0) {
      return Response.json({ errors }, { status: 400 });
    }

    // ── Build payload (only known fields) ───────────────────────────────────
    const nutrition: NutritionalInfo = {
      calories: n.calories,
      protein:  n.protein,
      carbs:    n.carbs,
      fat:      n.fat,
      ...(typeof n.fiber  === "number" && { fiber:  n.fiber  }),
      ...(typeof n.sodium === "number" && { sodium: n.sodium }),
    };

    const ratingsData = new MealRatingData();
    const result = await ratingsData.addRating({
      userId,
      mealId:   body.mealId.trim(),
      mealName: body.mealName.trim(),
      rating:   body.rating,
      nutrition,
      ratedAt:  new Date(),
    });

    return Response.json(result, { status: 200 });
  } catch (err) {
    console.error("[POST /api/ratings]", err);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}
