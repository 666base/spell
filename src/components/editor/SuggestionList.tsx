import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { cn } from "../../lib/utils";
import { GlideMenu } from "../ui/GlideMenu";

export interface SuggestionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface SuggestionListProps<T> {
  items: T[];
  command: (item: T) => void;
  itemKey: (item: T) => string;
  renderItem: (item: T, isSelected: boolean) => ReactNode;
  groupOf?: (item: T) => string;
  emptyText?: string;
  width?: string;
}

type GroupedEntries<T> = {
  label: string | null;
  entries: { item: T; index: number }[];
};

function groupedEntries<T>(
  items: T[],
  groupOf?: (item: T) => string,
): GroupedEntries<T>[] {
  if (!groupOf) {
    return [
      {
        label: null,
        entries: items.map((item, index) => ({ item, index })),
      },
    ];
  }

  const groups: { label: string; entries: { item: T; index: number }[] }[] = [];
  const indexByLabel = new Map<string, number>();

  items.forEach((item, index) => {
    const label = groupOf(item);
    let groupIndex = indexByLabel.get(label);
    if (groupIndex === undefined) {
      groupIndex = groups.length;
      indexByLabel.set(label, groupIndex);
      groups.push({ label, entries: [] });
    }
    groups[groupIndex].entries.push({ item, index });
  });

  return groups;
}

function SuggestionListInner<T>(
  {
    items,
    command,
    itemKey,
    renderItem,
    groupOf,
    emptyText = "No results",
    width = "w-56",
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

  const groups = useMemo(
    () => groupedEntries(items, groupOf),
    [groupOf, items],
  );
  const showHeaders = groups.length > 1 && groups[0]?.label != null;

  useEffect(() => {
    const el = listRef.current?.querySelector(
      `[data-index="${selectedIndex}"]`,
    );
    el?.scrollIntoView?.({ block: "nearest" });
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
      <div className={cn("spell-menu spell-suggestion-menu", width)}>
        <div className="spell-suggestion-empty">{emptyText}</div>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      className={cn("spell-menu spell-suggestion-menu", width)}
    >
      <GlideMenu
        className="min-w-0"
        activeSelector={`[data-index="${selectedIndex}"]`}
        highlightClassName="spell-suggestion-highlight"
      >
        {groups.map((group) => (
          <div
            key={group.label ?? "items"}
            role={showHeaders && group.label ? "group" : undefined}
            aria-label={showHeaders ? group.label ?? undefined : undefined}
            className={showHeaders ? "spell-suggestion-group" : undefined}
          >
            {showHeaders && group.label && (
              <div className="spell-suggestion-heading">{group.label}</div>
            )}
            {group.entries.map(({ item, index }) => (
              <div
                key={itemKey(item)}
                data-row
                data-index={index}
                role="option"
                aria-selected={selectedIndex === index}
                tabIndex={-1}
                onClick={() => command(item)}
                onMouseEnter={() => setSelectedIndex(index)}
                className="spell-suggestion-item"
              >
                {renderItem(item, selectedIndex === index)}
              </div>
            ))}
          </div>
        ))}
      </GlideMenu>
    </div>
  );
}

export const SuggestionList = forwardRef(SuggestionListInner) as <T>(
  props: SuggestionListProps<T> & { ref?: React.Ref<SuggestionListRef> },
) => ReactNode;
