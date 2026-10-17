import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ShoppingListData } from "@/lib/datalayer";
import { NextRequest, NextResponse } from "next/server";

async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.email ?? null;
}

// PUT /api/shopping-list/[id]
// Body: { name?: string, items?: ShoppingListItem[] }
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const updates: { name?: string; items?: unknown } = {};

  if (typeof body.name === "string") updates.name = body.name.trim();
  if (Array.isArray(body.items)) updates.items = body.items;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const data = new ShoppingListData();
  const updated = await data.updateList(userId, id, updates);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

// DELETE /api/shopping-list/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const data = new ShoppingListData();
  const result = await data.deleteList(userId, id);
  if (result.deletedCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
