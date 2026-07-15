// Latest-wins async loader — replaces the hand-rolled
// `let alive = true; …; return () => { alive = false; }` effect pattern.

import { useEffect, useState, type DependencyList } from "react";

/** Run `load` whenever `deps` change; return its latest result (null while
 *  loading or on rejection — encode errors as a sentinel inside `load` if
 *  you need to tell them apart). Out-of-date resolutions are discarded.
 *  `reset: false` keeps the previous value visible during a reload instead
 *  of flashing null. */
export function useAsync<T>(
  load: () => Promise<T>,
  deps: DependencyList,
  opts: { reset?: boolean } = {},
): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    if (opts.reset !== false) setValue(null);
    load().then(
      (v) => alive && setValue(v),
      () => alive && setValue(null),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
