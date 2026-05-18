import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, conversations } from "@workspace/db";
import { createRealtimeSession } from "@workspace/integrations-openai-ai-server";
import { getRealtimeModel } from "../../lib/realtime-model";
import { logger } from "../../lib/logger";

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

    try {
      const session = await createRealtimeSession({
        model: getRealtimeModel(),
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

export default router;
