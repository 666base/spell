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

const GROUP_LABEL: Record<SlashCommandItem["group"], string> = {
  style: "Text",
  list: "Lists",
  insert: "Insert",
};

export const SlashCommandList = forwardRef<
  SlashCommandListRef,
  SlashCommandListProps
>(({ items, command }, ref) => (
  <SuggestionList
    ref={ref}
    items={items}
    command={command}
    itemKey={(item) => item.title}
    groupOf={(item) => GROUP_LABEL[item.group]}
    renderItem={(item) => (
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className="flex size-[18px] shrink-0 items-center justify-center text-text-muted"
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
