// -----------------------------------------------------------------------------
// Timers the tests move by hand: setTimeout / setInterval and their clear
// functions, plus `advance(ms)` and the matching clock (`now()`). Passed to
// the classes that take a `timers` option, so no test waits for real time.
// -----------------------------------------------------------------------------

/** Let the promise callbacks queued so far run. */
export async function flush(rounds = 5) {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

export function createFakeTimers() {
  let clock = 0;
  let nextId = 1;
  const tasks = new Map();

  const schedule = (fn, ms, every) => {
    const id = nextId;
    nextId += 1;
    tasks.set(id, { fn, at: clock + ms, every });
    return id;
  };

  return {
    setTimeout: (fn, ms = 0) => schedule(fn, ms, 0),
    setInterval: (fn, ms = 0) => schedule(fn, ms, ms),
    clearTimeout: (id) => tasks.delete(id),
    clearInterval: (id) => tasks.delete(id),
    now: () => clock,
    /** Delays of the timers still waiting, in ms from now. */
    pending: () => [...tasks.values()].map((task) => task.at - clock),
    /** Move the clock, running every timer due on the way, in order. */
    async advance(ms) {
      const target = clock + ms;
      for (;;) {
        const due = [...tasks.entries()]
          .filter(([, task]) => task.at <= target)
          .sort(([, a], [, b]) => a.at - b.at)[0];
        if (!due) {
          break;
        }
        const [id, task] = due;
        clock = task.at;
        if (task.every) {
          task.at += task.every;
        } else {
          tasks.delete(id);
        }
        task.fn();
        await flush();
      }
      clock = target;
      await flush();
    },
  };
}
