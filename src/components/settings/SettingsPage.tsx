import { useState, useEffect, useRef } from "react";
import {
  ArrowLeftIcon,
  FolderIcon,
  SwatchIcon,
  IntegrationsIcon,
} from "../icons/velocity";
import { Button, IconButton } from "../ui";
import { GeneralSettingsSection } from "./GeneralSettingsSection";
import { AppearanceSettingsSection } from "./EditorSettingsSection";
import { ToolsSettingsSection } from "./ToolsSettingsSection";
import { isWindows } from "../../lib/platform";

interface SettingsPageProps {
  onBack: () => void;
}

type SettingsTab = "general" | "tools" | "editor";

const tabs: {
  id: SettingsTab;
  label: string;
  icon: typeof FolderIcon;
}[] = [
  { id: "general", label: "General", icon: FolderIcon },
  { id: "tools", label: "Integrations", icon: IntegrationsIcon },
  { id: "editor", label: "Appearance", icon: SwatchIcon },
];

export function SettingsPage({ onBack }: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Reset scroll position when tab changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "1") {
          e.preventDefault();
          setActiveTab("general");
        } else if (e.key === "2") {
          e.preventDefault();
          setActiveTab("tools");
        } else if (e.key === "3") {
          e.preventDefault();
          setActiveTab("editor");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="h-full flex flex-col md:flex-row bg-bg w-full">
      {/* Sidebar - matches main Notes sidebar */}
      <div className="w-full md:w-64 h-auto md:h-full bg-bg-secondary border-b md:border-b-0 md:border-r border-border flex flex-col select-none shrink-0">
        {/* Drag region */}
        {!isWindows && <div className="hidden md:block h-11 shrink-0" data-tauri-drag-region></div>}

        {/* Header with back button and Settings title */}
        <div className={`flex items-center justify-between px-3 py-2 md:pb-2 border-b border-border shrink-0${isWindows ? " md:pt-2" : ""}`}>
          <div className="flex items-center gap-1">
            <IconButton
              onClick={onBack}
              title="Back"
            >
              <ArrowLeftIcon className="w-4.5 h-4.5 stroke-[1.5]" />
            </IconButton>
            <div className="font-medium text-base">Settings</div>
          </div>
        </div>

        {/* Navigation tabs */}
        <nav className="p-2 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-y-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <Button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                className="shrink-0 justify-between gap-2.5 h-10 pr-3.5"
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4.5 h-4.5 stroke-[1.5]" />
                  {tab.label}
                </div>
              </Button>
            );
          })}
        </nav>
      </div>

      {/* Main content area */}
      <div className="flex-1 min-h-0 flex flex-col bg-bg overflow-hidden">
        {/* Drag region */}
        {!isWindows && <div className="hidden md:block h-11 shrink-0" data-tauri-drag-region></div>}

        {/* Content - centered with max width */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto scrollbar-gutter-stable"
        >
          <div className={`w-full max-w-3xl mx-auto px-4 md:px-6 pb-8${isWindows ? " md:pt-2" : " pt-2"}`}>
            {activeTab === "general" && <GeneralSettingsSection />}
            {activeTab === "tools" && <ToolsSettingsSection />}
            {activeTab === "editor" && <AppearanceSettingsSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
