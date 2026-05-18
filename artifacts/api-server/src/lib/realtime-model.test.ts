import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveRealtimeModel, getRealtimeModel } from "./realtime-model";

const REAL_FETCH = global.fetch;
beforeEach(() => {
  global.fetch = vi.fn() as typeof fetch;
  process.env.OPENAI_API_KEY = "sk-test";
});

afterEach(() => {
  global.fetch = REAL_FETCH;
});

describe("resolveRealtimeModel", () => {
  it("picks gpt-realtime when available", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: "gpt-3.5-turbo" },
          { id: "gpt-realtime" },
          { id: "gpt-4o-realtime-preview" },
        ],
      }),
    } as Response);

    const model = await resolveRealtimeModel();
    expect(model).toBe("gpt-realtime");
    expect(getRealtimeModel()).toBe("gpt-realtime");
  });

  it("falls back to gpt-4o-realtime-preview when gpt-realtime is missing", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: "gpt-3.5-turbo" },
          { id: "gpt-4o-realtime-preview" },
        ],
      }),
    } as Response);

    const model = await resolveRealtimeModel();
    expect(model).toBe("gpt-4o-realtime-preview");
  });

  it("throws when no realtime model is available", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: "gpt-3.5-turbo" }] }),
    } as Response);

    await expect(resolveRealtimeModel()).rejects.toThrow(/No realtime model/);
  });
});
