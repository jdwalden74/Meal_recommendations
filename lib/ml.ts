import { MealRatingData } from "./datalayer";
import { UserPreferences } from "./interfaces";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface RecommendedFood {
  name:      string;
  category:  string;
  calories:  number;
  protein_g: number;
  carbs_g:   number;
  fat_g:     number;
  fiber_g:   number;
}

// ─── Cache ─────────────────────────────────────────────────────────────────────

const TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  results:   RecommendedFood[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

// ─── Main ──────────────────────────────────────────────────────────────────────

export async function getRecommendations(
  userId: string,
  preferences: UserPreferences
): Promise<RecommendedFood[]> {
  // Return cached results if still fresh
  const cached = cache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.results;
  }

  try {
    const mlUrl = process.env.ML_SERVICE_URL;
    if (!mlUrl) {
      console.warn("[ml] ML_SERVICE_URL is not set — skipping recommendations.");
      return [];
    }

    // Fetch recent ratings to blend into the query
    const ratingsData = new MealRatingData();
    const recentRatings = await ratingsData.getRecentRatings(userId);

    const rated_meals = recentRatings.map((r) => ({
      name:      r.mealName,
      rating:    r.rating,
      nutrition: {
        calories: r.nutrition.calories,
        protein:  r.nutrition.protein,
        carbs:    r.nutrition.carbs,
        fat:      r.nutrition.fat,
      },
    }));

    const payload = {
      caloric_target:        preferences.caloricTarget,
      dietary_restrictions:  preferences.dietaryRestrictions,
      allergies:             preferences.allergies,
      top_n:                 15,
      rated_meals,
    };

    const response = await fetch(`${mlUrl}/recommend`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(
        `[ml] /recommend returned ${response.status}: ${await response.text()}`
      );
      return [];
    }

    const results: RecommendedFood[] = await response.json();

    cache.set(userId, { results, expiresAt: Date.now() + TTL_MS });
    return results;
  } catch (err) {
    console.error("[ml] ML service unreachable:", err);
    return [];
  }
}
