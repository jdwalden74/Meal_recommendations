import { GoogleGenerativeAI, Content } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.LLM_TOKEN!);

const DEFAULT_MODEL = process.env.LLM_MODEL ?? "gemini-2.5-flash-lite";

export type LlmMessage = {
  role: "user" | "model";
  content: string;
};

function toGeminiHistory(messages: LlmMessage[]): Content[] {
  return messages.map((m) => ({
    role: m.role,
    parts: [{ text: m.content }],
  }));
}

/**
 * Send a chat-style prompt to a Gemini model.
 * Returns the assistant's reply as a plain string.
 */
export async function chat(
  messages: LlmMessage[],
  model: string = DEFAULT_MODEL
): Promise<string> {
  const gemini = genAI.getGenerativeModel({ model });

  const history = toGeminiHistory(messages.slice(0, -1));
  const lastMessage = messages[messages.length - 1];

  const chatSession = gemini.startChat({ history });
  const result = await chatSession.sendMessage(lastMessage.content);

  return result.response.text();
}

/**
 * Stream a chat completion, yielding text chunks as they arrive.
 */
export async function* chatStream(
  messages: LlmMessage[],
  model: string = DEFAULT_MODEL
): AsyncGenerator<string> {
  const gemini = genAI.getGenerativeModel({ model });

  const history = toGeminiHistory(messages.slice(0, -1));
  const lastMessage = messages[messages.length - 1];

  const chatSession = gemini.startChat({ history });
  const result = await chatSession.sendMessageStream(lastMessage.content);

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}
