// Ping periódico na própria URL pública para o plano Free do Render não dormir.
// Só liga com KEEP_ALIVE_URL; em plano pago não é necessário.
export function startKeepAlive(
  url: string,
  intervalMs: number,
  fetchImpl: typeof fetch,
  onError: (err: unknown) => void = () => {},
): () => void {
  const timer = setInterval(() => {
    fetchImpl(url, { signal: AbortSignal.timeout(10_000) }).catch(onError);
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
