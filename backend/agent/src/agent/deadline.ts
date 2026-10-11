import { AppError } from "../errors/index.js";

/** Bound the entire turn even when an adapter does not react to AbortSignal. */
export async function withTurnSignal<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new AppError("AGENT_TIMEOUT", "本轮查询超过时间限制", { retryable: true }));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([operation, aborted]); }
  finally { signal.removeEventListener("abort", onAbort); }
}
