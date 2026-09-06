import { useEffect, useState } from "react";
import { PIXEL_LOADER_DELAYS_MS, formatElapsedSeconds } from "../../lib/glide";
import { cn } from "../../lib/utils";

type PixelLoaderProps = {
  label: string;
  running?: boolean;
  className?: string;
};

/**
 * Pixel-grid wait state with shimmer copy and a live elapsed clock.
 * Tells the user the app is still working without a generic spinner.
 */
export function PixelLoader({
  label,
  running = true,
  className,
}: PixelLoaderProps) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [running]);

  return (
    <div
      role="status"
      className={cn("pixel-loader", className)}
      aria-live="polite"
      aria-label={`${label}, ${formatElapsedSeconds(startedAt, now)} seconds`}
    >
      <span className="pixel-loader-grid" aria-hidden="true">
        {PIXEL_LOADER_DELAYS_MS.map((delay, index) => (
          <span
            key={index}
            className="pixel-loader-cell"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      <span className="pixel-loader-label">{label}</span>
      <span className="pixel-loader-time">
        {formatElapsedSeconds(startedAt, now)}s
      </span>
    </div>
  );
}
