import { forwardRef } from "react";
import type { SlashCommandItem } from "./SlashCommand";
import {
  SuggestionList,
  type SuggestionListRef,
} from "./SuggestionList";

export type SlashCommandListRef = SuggestionListRef;

interface SlashCommandListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

export const SlashCommandList = forwardRef<
  SlashCommandListRef,
  SlashCommandListProps
>(({ items, command }, ref) => (
  <SuggestionList
    ref={ref}
    items={items}
    command={command}
    itemKey={(item) => item.title}
    renderItem={(item, isSelected) => (
      <div className="flex items-center gap-3">
        <div className={isSelected
          ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg text-text [&_svg]:stroke-[1.55]"
          : "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-secondary text-text-muted [&_svg]:stroke-[1.55]"}>
          {item.icon}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-xs leading-4 font-medium truncate">
            {item.title}
          </span>
          <span className="mt-0.5 text-2xs leading-4 text-text-muted truncate">
            {item.description}
          </span>
        </div>
      </div>
    )}
  />
));
SlashCommandList.displayName = "SlashCommandList";
