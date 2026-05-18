import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  createRealtimeSession: vi.fn(),
  openai: {
    chat: { completions: { create: vi.fn() } },
    audio: {
      transcriptions: { create: vi.fn() },
      speech: { create: vi.fn() },
    },
  },
}));

vi.mock("@workspace/integrations-openai-ai-server/audio", () => ({
  ensureCompatibleFormat: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
    orderBy: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
  conversations: {},
  messages: {},
}));

vi.mock("../../lib/handbook", () => ({
  getHandbook: vi.fn().mockResolvedValue({ sections: [] }),
  findRelevantSections: vi.fn().mockReturnValue([]),
}));

vi.mock("../../lib/realtime-model", () => ({
  getRealtimeModel: vi.fn(() => "gpt-realtime"),
}));

import { createRealtimeSession } from "@workspace/integrations-openai-ai-server";
import { db } from "@workspace/db";
import app from "../../app";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb = db as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /openai/conversations/:id/realtime/session", () => {
  it("returns 404 when conversation does not exist", async () => {
    mockDb.where.mockResolvedValueOnce([]);

    const res = await request(app).post("/api/openai/conversations/999/realtime/session").send({});

    expect(res.status).toBe(404);
  });

  it("returns 200 with ephemeral key on success", async () => {
    mockDb.where.mockResolvedValueOnce([{ id: 1, title: "t" }]);
    vi.mocked(createRealtimeSession).mockResolvedValueOnce({
      ephemeralKey: "ek_test_123",
      sessionId: "sess_abc",
      model: "gpt-realtime",
      expiresAt: 9999999999,
    });

    const res = await request(app).post("/api/openai/conversations/1/realtime/session").send({});

    expect(res.status).toBe(200);
    expect(res.body.ephemeralKey).toBe("ek_test_123");
    expect(res.body.sessionId).toBe("sess_abc");
    expect(res.body.model).toBe("gpt-realtime");
    expect(createRealtimeSession).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when OpenAI session mint fails", async () => {
    mockDb.where.mockResolvedValueOnce([{ id: 1, title: "t" }]);
    vi.mocked(createRealtimeSession).mockRejectedValueOnce(new Error("OpenAI: invalid_request"));

    const res = await request(app).post("/api/openai/conversations/1/realtime/session").send({});

    expect(res.status).toBe(500);
    expect(res.body.reason).toMatch(/invalid_request/);
  });
});
