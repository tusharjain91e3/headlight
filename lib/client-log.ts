export function logApiError(url: string, status: number, data: { error?: string; reason?: string } | undefined) {
  const reason = data?.reason && data.reason !== data.error ? ` | reason: ${data.reason}` : '';
  console.error(`[Headlight] ${url} -> ${status} ${data?.error ?? ''}${reason}`);
}
