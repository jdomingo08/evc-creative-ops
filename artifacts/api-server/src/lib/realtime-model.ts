let resolvedModel = "gpt-realtime";

export function setRealtimeModel(model: string): void {
  resolvedModel = model;
}

export function getRealtimeModel(): string {
  return resolvedModel;
}
