import { useEffect, useRef, useState } from "react";

export type SmoothTextOptions = {
  intervalMs?: number;
  maxChunkSize?: number;
};

export function useSmoothText(
  target: string,
  active: boolean,
  { intervalMs = 18, maxChunkSize = 10 }: SmoothTextOptions = {},
) {
  const [visible, setVisible] = useState(() => (active ? "" : target));
  const visibleRef = useRef(active ? "" : target);
  const targetRef = useRef(target);

  useEffect(() => {
    targetRef.current = target;

    if (!active) {
      visibleRef.current = target;
      setVisible(target);
      return;
    }

    if (!target.startsWith(visibleRef.current)) {
      visibleRef.current = "";
      setVisible("");
    }
  }, [active, target]);

  useEffect(() => {
    if (!active) return;

    const timer = setInterval(() => {
      const current = visibleRef.current;
      const target = targetRef.current;
      if (current === target) return;

      const remaining = target.length - current.length;
      const nextSize = Math.min(maxChunkSize, Math.max(1, Math.ceil(remaining / 10)));
      const next = target.slice(0, current.length + nextSize);

      visibleRef.current = next;
      setVisible(next);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [active, intervalMs, maxChunkSize]);

  return visible;
}
