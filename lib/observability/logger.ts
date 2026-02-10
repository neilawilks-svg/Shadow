export function logInfo(message: string, context: Record<string, unknown> = {}): void {
  // Structured logs are easier to search and aggregate in local and hosted runtimes.
  console.info(
    JSON.stringify({
      level: "info",
      message,
      context,
      createdAt: new Date().toISOString(),
    }),
  );
}

export function logError(message: string, context: Record<string, unknown> = {}): void {
  console.error(
    JSON.stringify({
      level: "error",
      message,
      context,
      createdAt: new Date().toISOString(),
    }),
  );
}
