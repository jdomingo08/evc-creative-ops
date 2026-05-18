import { describe, it, expect } from "vitest";
import { reduceRealtimeState, type RealtimeState, type RealtimeEvent } from "./state-machine";

describe("reduceRealtimeState", () => {
  it("starts in idle and moves to connecting on connect", () => {
    const next = reduceRealtimeState("idle", { type: "connect-requested" });
    expect(next).toBe("connecting");
  });

  it("connecting → ready on connection-opened", () => {
    expect(reduceRealtimeState("connecting", { type: "connection-opened" })).toBe("ready");
  });

  it("ready → listening on start-speaking", () => {
    expect(reduceRealtimeState("ready", { type: "start-speaking" })).toBe("listening");
  });

  it("listening → thinking on stop-speaking", () => {
    expect(reduceRealtimeState("listening", { type: "stop-speaking" })).toBe("thinking");
  });

  it("thinking → responding on first transcript delta", () => {
    expect(reduceRealtimeState("thinking", { type: "transcript-delta" })).toBe("responding");
  });

  it("responding → ready on response-done", () => {
    expect(reduceRealtimeState("responding", { type: "response-done" })).toBe("ready");
  });

  it("ignores start-speaking unless state is ready", () => {
    expect(reduceRealtimeState("listening", { type: "start-speaking" })).toBe("listening");
    expect(reduceRealtimeState("responding", { type: "start-speaking" })).toBe("responding");
    expect(reduceRealtimeState("idle", { type: "start-speaking" })).toBe("idle");
  });

  it("ignores stop-speaking unless state is listening", () => {
    expect(reduceRealtimeState("ready", { type: "stop-speaking" })).toBe("ready");
    expect(reduceRealtimeState("thinking", { type: "stop-speaking" })).toBe("thinking");
  });

  it("any state → error on terminal-error", () => {
    expect(reduceRealtimeState("connecting", { type: "terminal-error" })).toBe("error");
    expect(reduceRealtimeState("listening", { type: "terminal-error" })).toBe("error");
    expect(reduceRealtimeState("responding", { type: "terminal-error" })).toBe("error");
  });

  it("error → connecting on connect-requested (allows retry)", () => {
    expect(reduceRealtimeState("error", { type: "connect-requested" })).toBe("connecting");
  });

  it("any state → idle on disconnect", () => {
    expect(reduceRealtimeState("responding", { type: "disconnect" })).toBe("idle");
    expect(reduceRealtimeState("error", { type: "disconnect" })).toBe("idle");
  });
});
