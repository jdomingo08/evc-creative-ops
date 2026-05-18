import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, conversations, messages } from "@workspace/db";
import { createRealtimeSession } from "@workspace/integrations-openai-ai-server";
import { getRealtimeModel } from "../../lib/realtime-model";
import { logger } from "../../lib/logger";
import { getHandbook, findRelevantSections } from "../../lib/handbook";

const router: IRouter = Router();

const HANDBOOK_TOOL_DEFINITION = {
  type: "function" as const,
  name: "lookup_handbook",
  description:
    "Look up the most relevant section of the creative-ops team handbook for a query. Use this whenever the user asks for handbook facts, policies, or procedures.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "A short natural-language query describing what to look up.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

const SYSTEM_INSTRUCTIONS = `You are a voice assistant for a creative production team. Answer questions about the team handbook by calling the lookup_handbook function — never invent handbook content. Speak conversationally and concisely; keep responses short since they will be spoken aloud. If a question is unrelated to the handbook, answer briefly without inventing handbook policy. Always cite the section heading the lookup tool returns.`;

router.post(
  "/openai/conversations/:id/realtime/session",
  async (req, res): Promise<void> => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid conversation id" });
      return;
    }

    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));

    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    let model: string;
    try {
      model = getRealtimeModel();
    } catch (err) {
      res.status(503).json({
        reason: "Realtime model not resolved at startup. Check server logs.",
      });
      return;
    }

    try {
      const session = await createRealtimeSession({
        model,
        voice: "alloy",
        instructions: SYSTEM_INSTRUCTIONS,
        tools: [HANDBOOK_TOOL_DEFINITION],
      });
      res.status(200).json(session);
    } catch (err) {
      logger.error({ err }, "Failed to mint realtime session");
      res.status(500).json({
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  },
);

router.post(
  "/openai/conversations/:id/realtime/transcript",
  async (req, res): Promise<void> => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid conversation id" });
      return;
    }

    const body = req.body as {
      userText?: unknown;
      assistantText?: unknown;
      citation?: unknown;
    };

    if (
      typeof body.userText !== "string" ||
      body.userText.length === 0 ||
      typeof body.assistantText !== "string" ||
      body.assistantText.length === 0 ||
      (body.citation !== null && typeof body.citation !== "string")
    ) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));

    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const [userRow] = await db
      .insert(messages)
      .values({
        conversationId: id,
        role: "user",
        content: body.userText,
        citation: null,
      })
      .returning({ id: messages.id });

    const [assistantRow] = await db
      .insert(messages)
      .values({
        conversationId: id,
        role: "assistant",
        content: body.assistantText,
        citation: body.citation,
      })
      .returning({ id: messages.id });

    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, id));

    res.status(201).json({
      userMessageId: userRow.id,
      assistantMessageId: assistantRow.id,
    });
  },
);

router.post(
  "/openai/handbook/lookup",
  async (req, res): Promise<void> => {
    const body = req.body as { query?: unknown };
    if (typeof body.query !== "string" || body.query.length === 0) {
      res.status(400).json({ error: "Invalid query" });
      return;
    }

    try {
      const handbook = await getHandbook();
      const sections = findRelevantSections(handbook.sections, body.query, 1);
      if (sections.length === 0) {
        res.status(200).json({ heading: null, content: "" });
        return;
      }
      res.status(200).json({
        heading: sections[0].heading,
        content: sections[0].content,
      });
    } catch (err) {
      req.log.error({ err }, "Handbook lookup failed");
      res.status(500).json({ error: "Handbook unavailable" });
    }
  },
);

export default router;
