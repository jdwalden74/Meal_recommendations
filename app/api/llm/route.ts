import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ChatHistoryData } from "@/lib/datalayer";
import { chatStream } from "@/lib/llm";
import type { LlmMessage } from "@/lib/llm";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You are a helpful meal planning assistant. You help users plan healthy,
personalized meals for their weekly calendar. You can suggest meals, provide nutritional
information, and help adjust meal plans based on dietary preferences. Keep responses concise
and practical.`;

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

    // ── Load recent history ─────────────────────────────────────────────────
    const chatData = new ChatHistoryData();
    const history = await chatData.getHistory(userId, 20);

    // ── Build Gemini message list ───────────────────────────────────────────
    // Map "assistant" → "model" for Gemini, prepend system prompt as first user turn
    const llmMessages: LlmMessage[] = [
      { role: "user", content: SYSTEM_PROMPT },
      { role: "model", content: "Understood! I'm ready to help with meal planning." },
      ...history.map((m) => ({
        role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
        content: m.content,
      })),
      { role: "user", content: trimmedMessage },
    ];

    // ── Save user message ───────────────────────────────────────────────────
    await chatData.addMessage({ userId, role: "user", content: trimmedMessage });

    // ── Stream response ─────────────────────────────────────────────────────
    const encoder = new TextEncoder();
    let fullReply = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of chatStream(llmMessages)) {
            fullReply += chunk;
            controller.enqueue(encoder.encode(chunk));
          }
          // Save assistant reply once streaming is complete
          await chatData.addMessage({ userId, role: "assistant", content: fullReply });
        } catch (err) {
          console.error("[POST /api/llm] stream error", err);
          controller.enqueue(encoder.encode("Sorry, I couldn't generate a response. Please try again."));
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
