import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { RecipeData } from "@/lib/datalayer";
import { NextRequest, NextResponse } from "next/server";

async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.email ?? null;
}

// GET /api/cookbook?search=&tag=&favorites=true
export async function GET(req: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? undefined;
  const tag = searchParams.get("tag") ?? undefined;
  const favoritesOnly = searchParams.get("favorites") === "true";

  const data = new RecipeData();
  const recipes = await data.getRecipes(userId, { search, tag, favoritesOnly });
  return NextResponse.json(recipes);
}

// POST /api/cookbook
export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, ingredients, steps, servings, macros, tags, notes, photoUrl, isFavorite } = body;

  if (!title || typeof title !== "string" || title.trim() === "") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!Array.isArray(ingredients)) {
    return NextResponse.json({ error: "ingredients must be an array" }, { status: 400 });
  }
  if (!Array.isArray(steps)) {
    return NextResponse.json({ error: "steps must be an array" }, { status: 400 });
  }
  if (typeof servings !== "number" || servings < 1) {
    return NextResponse.json({ error: "servings must be a positive number" }, { status: 400 });
  }
  if (!macros || typeof macros.calories !== "number" || typeof macros.protein !== "number" ||
      typeof macros.carbs !== "number" || typeof macros.fat !== "number") {
    return NextResponse.json({ error: "macros must include calories, protein, carbs, and fat" }, { status: 400 });
  }

  const data = new RecipeData();
  const result = await data.createRecipe({
    userId,
    title: title.trim(),
    ingredients,
    steps,
    servings,
    macros,
    tags: Array.isArray(tags) ? tags : [],
    notes: typeof notes === "string" ? notes : undefined,
    photoUrl: typeof photoUrl === "string" ? photoUrl : undefined,
    isFavorite: isFavorite === true,
  });

  return NextResponse.json({ insertedId: result.insertedId }, { status: 201 });
}
