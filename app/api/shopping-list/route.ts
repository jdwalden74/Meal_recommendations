import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ShoppingListData, RecipeData } from "@/lib/datalayer";
import { NextRequest, NextResponse } from "next/server";

async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.email ?? null;
}

// GET /api/shopping-list
export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = new ShoppingListData();
  const lists = await data.getLists(userId);
  return NextResponse.json(lists);
}

// POST /api/shopping-list
// Body: { name: string, recipeId?: string, items?: ShoppingListItem[] }
// If recipeId is provided, pre-populates items from the recipe's ingredients.
export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, recipeId, items } = body;

  if (!name || typeof name !== "string" || name.trim() === "") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  let listItems = Array.isArray(items) ? items : [];

  if (recipeId && typeof recipeId === "string") {
    const recipeData = new RecipeData();
    const recipe = await recipeData.getRecipe(userId, recipeId);
    if (recipe) {
      listItems = recipe.ingredients.map((ing) => ({
        name: ing.name,
        amount: ing.amount,
        unit: ing.unit,
        checked: false,
        recipeId,
      }));
    }
  }

  const data = new ShoppingListData();
  const result = await data.createList({ userId, name: name.trim(), items: listItems });
  return NextResponse.json({ insertedId: result.insertedId }, { status: 201 });
}
