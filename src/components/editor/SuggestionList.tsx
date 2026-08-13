import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { cn } from "../../lib/utils";

export interface SuggestionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface SuggestionListProps<T> {
  items: T[];
  command: (item: T) => void;
  itemKey: (item: T) => string;
  renderItem: (item: T, isSelected: boolean) => ReactNode;
  emptyText?: string;
  width?: string;
}

function SuggestionListInner<T>(
  {
    items,
    command,
    itemKey,
    renderItem,
    emptyText = "No results",
    width = "w-64",
  }: SuggestionListProps<T>,
  ref: React.ForwardedRef<SuggestionListRef>,
) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [previousItems, setPreviousItems] = useState(items);
  const listRef = useRef<HTMLDivElement>(null);

  if (items !== previousItems) {
    setPreviousItems(items);
    setSelectedIndex(0);
  }

  useEffect(() => {
    const el = listRef.current?.querySelector(
      `[data-index="${selectedIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((i) => (i > 0 ? i - 1 : items.length - 1));
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((i) => (i < items.length - 1 ? i + 1 : 0));
        return true;
      }
      if (event.key === "Enter") {
        if (items[selectedIndex]) {
          command(items[selectedIndex]);
        }
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div
        className={cn(
          "spell-menu spell-suggestion-menu",
          width,
        )}
      >
        <div className="spell-suggestion-empty">{emptyText}</div>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      className={cn(
        "spell-menu spell-suggestion-menu",
        width,
      )}
    >
      {items.map((item, index) => (
        <div
          key={itemKey(item)}
          data-index={index}
          data-highlighted={selectedIndex === index ? "" : undefined}
          role="option"
          aria-selected={selectedIndex === index}
          tabIndex={-1}
          onClick={() => command(item)}
          onMouseEnter={() => setSelectedIndex(index)}
          className={cn(
            "spell-menu-item spell-suggestion-item cursor-pointer",
          )}
        >
          {renderItem(item, selectedIndex === index)}
        </div>
      ))}
    </div>
  );
}

export const SuggestionList = forwardRef(SuggestionListInner) as <T>(
  props: SuggestionListProps<T> & { ref?: React.Ref<SuggestionListRef> },
) => ReactNode;
