import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, conversations, messages } from "@workspace/db";
import {
  SendOpenaiMessageParams,
  SendOpenaiMessageBody,
  SendOpenaiVoiceMessageParams,
  SendOpenaiVoiceMessageBody,
  ListOpenaiMessagesParams,
  ListOpenaiMessagesResponse,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { ensureCompatibleFormat } from "@workspace/integrations-openai-ai-server/audio";
import { getHandbook, findRelevantSections } from "../../lib/handbook";
import { logger } from "../../lib/logger";

const router: IRouter = Router();

router.get("/openai/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = ListOpenaiMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, params.data.id))
    .orderBy(messages.createdAt);
  res.json(ListOpenaiMessagesResponse.parse(msgs));
});

router.post("/openai/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = SendOpenaiMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SendOpenaiMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const conversationId = parseInt(raw, 10);

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  let handbook;
  try {
    handbook = await getHandbook();
  } catch (err) {
    req.log.warn({ err }, "Failed to fetch handbook, proceeding without context");
    handbook = null;
  }

  const relevantSections = handbook
    ? findRelevantSections(handbook.sections, body.data.content, 8)
    : [];

  const citationSection = relevantSections.length > 0 ? relevantSections[0].heading : null;

  const handbookContext =
    relevantSections.length > 0
      ? relevantSections
          .map((s) => `## ${s.heading}\n${s.content}`)
          .join("\n\n")
      : "No handbook context available.";

  const systemPrompt = `You are a helpful assistant for a creative production team. Answer questions using the following excerpts from the team handbook.

Be concise, direct, and accurate. Only cite information that appears in the handbook. If the answer isn't in the handbook, say so clearly.

HANDBOOK EXCERPTS:
${handbookContext}`;

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);

  const chatMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: body.data.content },
  ];

  await db.insert(messages).values({
    conversationId,
    role: "user",
    content: body.data.content,
    citation: null,
  });

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";

  const stream = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 8192,
    messages: chatMessages,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      fullResponse += content;
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
  }

  await db.insert(messages).values({
    conversationId,
    role: "assistant",
    content: fullResponse,
    citation: citationSection,
  });

  res.write(`data: ${JSON.stringify({ done: true, citation: citationSection })}\n\n`);
  res.end();
});

router.post("/openai/conversations/:id/voice-messages", async (req, res): Promise<void> => {
  const params = SendOpenaiVoiceMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SendOpenaiVoiceMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const conversationId = parseInt(raw, 10);

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const audioBuffer = Buffer.from(body.data.audio, "base64");
  const { buffer: compatBuffer, format } = await ensureCompatibleFormat(audioBuffer);

  let userTranscript = "";
  let assistantTranscript = "";

  let handbook;
  try {
    handbook = await getHandbook();
  } catch (err) {
    req.log.warn({ err }, "Failed to fetch handbook for voice message");
    handbook = null;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const audioBytes = new Uint8Array(compatBuffer.byteLength);
    audioBytes.set(compatBuffer);
    const transcriptionResp = await openai.audio.transcriptions.create({
      model: "gpt-4o-mini-transcribe",
      file: new File([audioBytes], `audio.${format}`, { type: `audio/${format}` }),
      response_format: "json",
    });
    userTranscript = transcriptionResp.text;
    res.write(`data: ${JSON.stringify({ type: "user_transcript", data: userTranscript })}\n\n`);

    const relevantSections = handbook
      ? findRelevantSections(handbook.sections, userTranscript, 6)
      : [];
    const citationSection = relevantSections.length > 0 ? relevantSections[0].heading : null;
    const handbookContext =
      relevantSections.length > 0
        ? relevantSections.map((s) => `## ${s.heading}\n${s.content}`).join("\n\n")
        : "No handbook context available.";

    const systemPrompt = `You are a helpful voice assistant for a creative production team. Answer concisely using the team handbook excerpts below. Keep responses short and conversational since this is spoken aloud.

HANDBOOK EXCERPTS:
${handbookContext}`;

    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);

    const chatMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: userTranscript },
    ];

    const textStream = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 2048,
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of textStream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        assistantTranscript += content;
        res.write(`data: ${JSON.stringify({ type: "transcript", data: content })}\n\n`);
      }
    }

    const ttsResp = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: assistantTranscript,
      response_format: "opus",
    });
    const audioData = Buffer.from(await ttsResp.arrayBuffer());
    const audioBase64 = audioData.toString("base64");
    res.write(`data: ${JSON.stringify({ type: "audio", data: audioBase64 })}\n\n`);

    await db.insert(messages).values([
      {
        conversationId,
        role: "user",
        content: userTranscript,
        citation: null,
      },
      {
        conversationId,
        role: "assistant",
        content: assistantTranscript,
        citation: citationSection,
      },
    ]);

    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    logger.error({ err }, "Voice message error");
    res.write(`data: ${JSON.stringify({ error: "Voice processing failed" })}\n\n`);
    res.end();
  }
});

export default router;
