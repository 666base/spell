import { createPortal } from "react-dom";
import { Toaster as Sonner } from "sonner";
import { useTheme } from "../../context/ThemeContext";
import { isMobileApp } from "../../lib/platform";
import {
  CheckIcon,
  InfoIcon,
  SpinnerIcon,
  XIcon,
} from "../icons/velocity";

const toastIconClass = "ui-icon spell-toast-icon";

export function Toaster() {
  const { resolvedTheme } = useTheme();

  const toaster = (
    <Sonner
      theme={resolvedTheme}
      className="spell-toaster"
      position={isMobileApp ? "top-center" : "bottom-right"}
      offset={16}
      mobileOffset={{
        top: "calc(var(--safe-area-top) + 8px)",
        bottom: "calc(var(--safe-area-bottom) + 8px)",
        left: 12,
        right: 12,
      }}
      duration={2800}
      gap={10}
      visibleToasts={3}
      icons={{
        success: <CheckIcon aria-hidden="true" className={toastIconClass} />,
        error: <XIcon aria-hidden="true" className={toastIconClass} />,
        info: <InfoIcon aria-hidden="true" className={toastIconClass} />,
        warning: <InfoIcon aria-hidden="true" className={toastIconClass} />,
        loading: (
          <SpinnerIcon
            aria-hidden="true"
            className={`${toastIconClass} animate-spin`}
          />
        ),
      }}
    />
  );

  if (typeof document === "undefined") return toaster;
  return createPortal(toaster, document.body);
}
