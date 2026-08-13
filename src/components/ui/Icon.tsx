import * as React from "react";
import { cn } from "../../lib/utils";

/**
 * Applies the shared optical treatment to icon components without touching
 * text, badges, or layout spans passed alongside them.
 */
export function normalizeIconChildren(children: React.ReactNode) {
  return React.Children.map(children, (child) => {
    if (!React.isValidElement<{ className?: string }>(child)) return child;
    if (typeof child.type === "string") return child;
    return React.cloneElement(child, {
      className: cn("ui-icon", child.props.className),
    });
  });
}
