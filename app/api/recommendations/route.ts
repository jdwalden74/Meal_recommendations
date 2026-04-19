import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { UserPreferencesData } from "@/lib/datalayer";
import { getRecommendations } from "@/lib/ml";

// ─── GET /api/recommendations ──────────────────────────────────────────────────
// Returns up to 15 personalized food recommendations for the authenticated user.
// Always returns an array — empty if the ML service is unavailable or the user
// has no saved preferences.

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.email ?? null;
    if (!userId) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const prefsData = new UserPreferencesData();
    const preferences = await prefsData.getPreferences(userId);

    if (!preferences) {
      return Response.json([]);
    }

    const recommendations = await getRecommendations(userId, preferences);
    return Response.json(recommendations);
  } catch (err) {
    console.error("[GET /api/recommendations]", err);
    return Response.json([]);
  }
}
