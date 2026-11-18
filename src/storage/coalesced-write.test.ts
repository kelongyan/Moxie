import { afterEach, describe, expect, it, vi } from "vitest";
import { coalescedWrite } from "./coalesced-write";
import {
  flushPendingWrites,
  resetPendingWritesForTests,
} from "./pending-writes";

afterEach(() => {
  resetPendingWritesForTests();
  vi.useRealTimers();
});

describe("session snapshot writes", () => {
  it("writes only the latest snapshot during a burst of restored tabs", async () => {
    vi.useFakeTimers();
    const send = vi.fn<(_: number) => Promise<void>>(async () => {});
    const queue = coalescedWrite(send, 250);
    for (let n = 0; n < 20; n++) queue.set(n);
    await vi.advanceTimersByTimeAsync(250);
    expect(send.mock.calls).toEqual([[19]]);
    queue.dispose();
  });

  it("closing waits for the newest snapshot behind an unfinished write", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const send = vi.fn(async (value: number) => {
      if (value === 1)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
    });
    const queue = coalescedWrite(send, 250);
    queue.set(1);
    await vi.advanceTimersByTimeAsync(250);
    queue.set(2);
    queue.set(3);
    const closing = flushPendingWrites();
    expect(send.mock.calls).toEqual([[1]]);
    release();
    await closing;
    expect(send.mock.calls).toEqual([[1], [3]]);
    queue.dispose();
  });
});
