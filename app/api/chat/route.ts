import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ChatHistoryData } from "@/lib/datalayer";
import { ChatRole } from "@/lib/interfaces";

// ─── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.email ?? null;
}

// ─── GET /api/chat?limit=50 ────────────────────────────────────────────────────
// Returns the conversation history for the authenticated user.
// The `limit` param controls how many messages to return (default 50, max 200).

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rawLimit = searchParams.get("limit");
    const limit = rawLimit ? parseInt(rawLimit, 10) : 50;

    if (isNaN(limit) || limit <= 0 || limit > 200) {
      return Response.json(
        { error: "limit must be a number between 1 and 200." },
        { status: 400 }
      );
    }

    const chatData = new ChatHistoryData();
    const history = await chatData.getHistory(userId, limit);

    return Response.json(history);
  } catch (err) {
    console.error("[GET /api/chat]", err);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}

// ─── POST /api/chat ────────────────────────────────────────────────────────────
// Appends a message to the authenticated user's conversation history.
// Body: { role: "user" | "assistant"; content: string; structuredOutput?: object }
// The `structuredOutput` field carries the LLM's parsed JSON when the assistant
// message contains a meal plan mutation.

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const { role, content, structuredOutput } = body ?? {};

    // ── Validation ──────────────────────────────────────────────────────────
    const validRoles: ChatRole[] = ["user", "assistant"];
    if (!validRoles.includes(role)) {
      return Response.json(
        { error: "role must be 'user' or 'assistant'." },
        { status: 400 }
      );
    }

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return Response.json(
        { error: "content must be a non-empty string." },
        { status: 400 }
      );
    }

    if (
      structuredOutput !== undefined &&
      (typeof structuredOutput !== "object" || Array.isArray(structuredOutput))
    ) {
      return Response.json(
        { error: "structuredOutput must be a plain object if provided." },
        { status: 400 }
      );
    }

    // ── Insert ──────────────────────────────────────────────────────────────
    const chatData = new ChatHistoryData();
    const result = await chatData.addMessage({
      userId,
      role,
      content: content.trim(),
      ...(structuredOutput ? { structuredOutput } : {}),
    });

    return Response.json({ insertedId: result.insertedId }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/chat]", err);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}

// ─── DELETE /api/chat ──────────────────────────────────────────────────────────
// Wipes all conversation history for the authenticated user.
// Useful for "start a new conversation" / reset functionality.

export async function DELETE() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const chatData = new ChatHistoryData();
    const result = await chatData.clearHistory(userId);

    return Response.json({ deletedCount: result.deletedCount });
  } catch (err) {
    console.error("[DELETE /api/chat]", err);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}
