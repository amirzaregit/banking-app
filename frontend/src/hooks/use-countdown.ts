import { useEffect, useState } from 'react';

/** A whole-seconds countdown: `start(5)` makes `remaining` go 5, 4, 3, 2, 1, 0, one tick per second. */
export function useCountdown() {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (remaining <= 0) return;
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining]);
  return { remaining, start: setRemaining };
}
