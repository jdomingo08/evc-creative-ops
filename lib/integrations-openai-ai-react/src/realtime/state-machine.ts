export type RealtimeState =
  | "idle"
  | "connecting"
  | "ready"
  | "listening"
  | "thinking"
  | "responding"
  | "error";

export type RealtimeEvent =
  | { type: "connect-requested" }
  | { type: "connection-opened" }
  | { type: "start-speaking" }
  | { type: "stop-speaking" }
  | { type: "transcript-delta" }
  | { type: "response-done" }
  | { type: "terminal-error" }
  | { type: "disconnect" };

export function reduceRealtimeState(
  state: RealtimeState,
  event: RealtimeEvent,
): RealtimeState {
  if (event.type === "disconnect") return "idle";
  if (event.type === "terminal-error") return "error";

  switch (state) {
    case "idle":
      return event.type === "connect-requested" ? "connecting" : "idle";
    case "connecting":
      return event.type === "connection-opened" ? "ready" : "connecting";
    case "ready":
      if (event.type === "start-speaking") return "listening";
      return "ready";
    case "listening":
      if (event.type === "stop-speaking") return "thinking";
      return "listening";
    case "thinking":
      if (event.type === "transcript-delta") return "responding";
      if (event.type === "response-done") return "ready";
      return "thinking";
    case "responding":
      if (event.type === "response-done") return "ready";
      return "responding";
    case "error":
      return event.type === "connect-requested" ? "connecting" : "error";
  }
}
