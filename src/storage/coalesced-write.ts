import { onFlush, trackWrite } from "./pending-writes";

/** Coalesces snapshots and sends them in order. Closing a window drains the
 * newest value even while an earlier write is still in flight. */
export function coalescedWrite<T>(
  write: (value: T) => Promise<unknown>,
  delay: number,
) {
  let pending: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | null = null;

  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (running || !pending) return;
    running = (async () => {
      while (pending) {
        const next = pending;
        pending = null;
        await write(next.value).catch(() => {});
      }
    })().finally(() => {
      running = null;
    });
    void trackWrite(running);
  };
  const unregister = onFlush(flush);
  return {
    set(value: T) {
      pending = { value };
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    dispose() {
      flush();
      unregister();
    },
  };
}
