import { useState, useEffect, useRef, type ReactNode } from "react";
import {
  AccountIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  SettingsIcon,
  SwatchIcon,
} from "../icons/velocity";
import { IconButton } from "../ui";
import { cn } from "../../lib/utils";
import { windowDragRegionProps } from "../../lib/windowDrag";
import { AccountSettingsSection } from "./AccountSettingsSection";
import { AppUpdateSection } from "./AppUpdateSection";
import { GeneralSettingsSection } from "./GeneralSettingsSection";
import { AppearanceSettingsSection } from "./AppearanceSettingsSection";
import { isMac } from "../../lib/platform";
import { WindowControls } from "../layout/WindowControls";
import { MobileNavBar } from "../layout/mobile/MobileChrome";

interface SettingsPageProps {
  onBack: () => void;
  compact?: boolean;
  prefix?: ReactNode;
}

type SettingsTab = "account" | "general" | "appearance";
type MobileSection = SettingsTab | "update";

const tabs: {
  id: SettingsTab;
  label: string;
  icon: typeof AccountIcon;
}[] = [
  { id: "account", label: "Account", icon: AccountIcon },
  { id: "general", label: "General", icon: SettingsIcon },
  { id: "appearance", label: "Appearance", icon: SwatchIcon },
];

const mobileRows: {
  id: MobileSection;
  label: string;
  icon: typeof AccountIcon;
}[] = [
  { id: "update", label: "App Update", icon: DownloadIcon },
  ...tabs,
];

export function SettingsPage({ onBack, compact = false, prefix }: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("account");
  const [section, setSection] = useState<MobileSection | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [activeTab, section]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      const index = Number(e.key) - 1;
      const tab = tabs[index];
      if (!tab) return;
      e.preventDefault();
      setActiveTab(tab.id);
      setSection(tab.id);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const body = (tab: MobileSection) => (
    <>
      {tab === "update" && <AppUpdateSection />}
      {tab === "account" && <AccountSettingsSection />}
      {tab === "general" && <GeneralSettingsSection />}
      {tab === "appearance" && <AppearanceSettingsSection />}
    </>
  );

  if (compact) {
    const open = section ? mobileRows.find((tab) => tab.id === section) : null;
    return (
      <div className="mobile-settings">
        <MobileNavBar
          backLabel={open ? "Home" : "Folders"}
          onBack={open ? () => setSection(null) : onBack}
          title={open ? open.label : "Home"}
        />
        <div ref={scrollContainerRef} className="mobile-scroll">
          {open ? (
            <div className="mobile-settings-section">{body(open.id)}</div>
          ) : (
            <>
              {prefix}
              <section className="mobile-group">
                {prefix && <h2 className="mobile-group-title">Settings</h2>}
                <div className="mobile-group-card">
                {mobileRows.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className="mobile-folder-row"
                      onClick={() => setSection(tab.id)}
                    >
                      <span className="mobile-folder-icon">
                        <Icon />
                      </span>
                      <span className="mobile-folder-label">{tab.label}</span>
                      <ChevronRightIcon className="mobile-folder-chevron" />
                    </button>
                  );
                })}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-bg">
      <aside className="app-sidebar-surface flex w-full shrink-0 select-none flex-col border-b border-border md:h-full md:w-64 md:border-b-0 md:border-r">
        <div
          className={cn(
            "app-titlebar flex shrink-0 items-center gap-1",
            isMac && "pl-20",
          )}
          {...windowDragRegionProps}
        >
          <IconButton size="sm" className="titlebar-no-drag" title="Back" onClick={onBack}>
            <ChevronLeftIcon />
          </IconButton>
          <span className="text-[13px] font-semibold text-text">Settings</span>
        </div>

        <nav className="flex flex-row gap-1 overflow-x-auto p-2 md:flex-col md:overflow-y-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium",
                  isActive
                    ? "bg-bg-selected text-text"
                    : "text-text-muted hover:bg-bg-hover hover:text-text",
                )}
              >
                <Icon className="h-4 w-4 stroke-[1.5]" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg">
        <div
          className="hidden h-11 shrink-0 items-center justify-end px-3 md:flex"
          {...windowDragRegionProps}
        >
          <WindowControls />
        </div>

        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto scrollbar-gutter-stable"
        >
          <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-4 md:px-6">
            {body(activeTab)}
          </div>
        </div>
      </div>
    </div>
  );
}
