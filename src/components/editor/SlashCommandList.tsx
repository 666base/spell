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
      <div className="flex items-center gap-2.5">
        <span
          className={
            isSelected ? "text-text" : "text-text-muted"
          }
        >
          {item.icon}
        </span>
        <span className="min-w-0 truncate text-[13px] font-medium leading-5">
          {item.title}
        </span>
      </div>
    )}
  />
));
SlashCommandList.displayName = "SlashCommandList";
