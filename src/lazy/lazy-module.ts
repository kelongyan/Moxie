// Every heavy part of the app loads the first time it is needed (mermaid,
// KaTeX, a language's strings, Settings). A "warm" part loads in the
// background once the window is idle, so its first open doesn't wait.

export interface LazyModule<T> {
  readonly name: string;
  /** The module, loaded on the first call and shared after. A failed load
   *  is forgotten, so the next call tries again. */
  load(): Promise<T>;
  /** The module if it has loaded, for code that can go without it. */
  peek(): T | undefined;
  /** Forgets this module (a plugin turned off), so a later lazyModule under its
   *  name starts afresh. */
  drop(): void;
}

interface Entry {
  module: LazyModule<unknown>;
  warm: boolean;
  loaded: boolean;
}

const entries = new Map<string, Entry>();

/** Declares a part of the app that loads on first use. `name` identifies it
 *  in loadedModules, which e2e and the startup budget read. */
export function lazyModule<T>(
  name: string,
  loader: () => Promise<T>,
  options: { warm?: boolean } = {},
): LazyModule<T> {
  let pending: Promise<T> | null = null;
  let value: T | undefined;
  const module: LazyModule<T> = {
    name,
    load() {
      pending ??= loader().then(
        (loaded) => {
          value = loaded;
          const entry = entries.get(name);
          if (entry?.module === module) entry.loaded = true;
          return loaded;
        },
        (err: unknown) => {
          pending = null;
          throw err;
        },
      );
      return pending;
    },
    peek: () => value,
    drop() {
      if (entries.get(name)?.module === module) entries.delete(name);
    },
  };
  entries.set(name, {
    module: module as LazyModule<unknown>,
    warm: !!options.warm,
    loaded: false,
  });
  if (options.warm && warming) scheduleWarm();
  return module;
}

/** The parts loaded so far, by name. */
export function loadedModules(): string[] {
  return [...entries.values()]
    .filter((entry) => entry.loaded)
    .map((entry) => entry.module.name);
}

// For e2e: what a development build has loaded.
if (import.meta.env?.DEV)
  (globalThis as { __loadedModules?: () => string[] }).__loadedModules =
    loadedModules;

let warming = false;
let scheduled = false;
let lastInput = 0;

/** From now on, warm parts load one at a time whenever the window is idle.
 *  Called once the first document has painted. */
export function startWarming(): void {
  if (warming) return;
  warming = true;
  if (typeof document !== "undefined") {
    const input = () => {
      lastInput = Date.now();
    };
    document.addEventListener("keydown", input, { passive: true });
    document.addEventListener("pointerdown", input, { passive: true });
  }
  // Leave the first interaction a clear window before evaluating optional
  // modules; requestIdleCallback alone may fire immediately after the paint.
  setTimeout(scheduleWarm, 750);
}

function scheduleWarm() {
  if (scheduled) return;
  scheduled = true;
  whenIdle(async () => {
    scheduled = false;
    // A module's evaluation cannot be interrupted once started: don't start
    // another while the reader is typing or interacting with the window.
    if (Date.now() - lastInput < 500) {
      setTimeout(scheduleWarm, 500);
      return;
    }
    const next = [...entries.values()].find(
      (entry) => entry.warm && !entry.loaded,
    );
    if (!next) return;
    // A failed warm-up is left for the real first use to report.
    await next.module.load().catch(() => {});
    next.warm = false;
    scheduleWarm();
  });
}

function whenIdle(run: () => void) {
  const idle = (
    globalThis as {
      requestIdleCallback?: (
        cb: () => void,
        options?: { timeout: number },
      ) => number;
    }
  ).requestIdleCallback;
  // WebKit has no requestIdleCallback: a pause after the frame stands in.
  if (idle) idle(run, { timeout: 3000 });
  else setTimeout(run, 300);
}
