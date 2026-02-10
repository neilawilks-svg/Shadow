// Lightweight, approximate per-1k token price assumptions for demo cost visibility.
const PRICE_PER_1K: Record<string, { input: number; output: number }> = {
  "gpt-4.1": { input: 0.01, output: 0.03 },
  "gpt-4.1-mini": { input: 0.002, output: 0.006 },
  "gpt-4o-mini-transcribe": { input: 0.0015, output: 0.0015 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const key = model in PRICE_PER_1K ? model : "gpt-4.1-mini";
  const pricing = PRICE_PER_1K[key];

  return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
}
