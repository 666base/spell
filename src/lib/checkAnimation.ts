const CHECK_SPARK_COLOR = "#ffcc00";

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** AFFiNE-style spark burst played when a checkbox is checked. */
export async function playCheckAnimation(refElement: Element): Promise<void> {
  if (prefersReducedMotion()) return;

  const host = refElement instanceof HTMLElement ? refElement : refElement.parentElement;
  if (!host) return;

  const rect = host.getBoundingClientRect();
  const size = Math.max(20, Math.round(rect.width));
  const sparkingEl = document.createElement("div");
  sparkingEl.className = "check-spark";
  sparkingEl.setAttribute("aria-hidden", "true");
  sparkingEl.style.cssText = `
    position: fixed;
    width: ${size}px;
    height: ${size}px;
    border-radius: 50%;
    left: ${rect.left + rect.width / 2 - size / 2}px;
    top: ${rect.top + rect.height / 2 - size / 2}px;
    pointer-events: none;
    z-index: 80;
  `;
  document.body.append(sparkingEl);

  try {
    await sparkingEl.animate(
      [
        {
          boxShadow: `0 -18px 0 -8px ${CHECK_SPARK_COLOR}, 16px -8px 0 -8px ${CHECK_SPARK_COLOR}, 16px 8px 0 -8px ${CHECK_SPARK_COLOR}, 0 18px 0 -8px ${CHECK_SPARK_COLOR}, -16px 8px 0 -8px ${CHECK_SPARK_COLOR}, -16px -8px 0 -8px ${CHECK_SPARK_COLOR}`,
        },
      ],
      { duration: 240, easing: "ease", fill: "forwards" },
    ).finished;

    await sparkingEl.animate(
      [
        {
          boxShadow:
            "0 -36px 0 -10px transparent, 32px -16px 0 -10px transparent, 32px 16px 0 -10px transparent, 0 36px 0 -10px transparent, -32px 16px 0 -10px transparent, -32px -16px 0 -10px transparent",
        },
      ],
      { duration: 360, easing: "ease", fill: "forwards" },
    ).finished;
  } catch {
    // Cancelled when the host unmounts mid-burst.
  } finally {
    sparkingEl.remove();
  }
}
