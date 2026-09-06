import { useRef, type ReactNode, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "../../lib/utils";
import { GlideMenu } from "../ui/GlideMenu";

export const NOTE_ROW_ESTIMATE_PX = 72;
export const NOTE_LIST_ROW_INSET_CLASS = "px-[var(--note-list-inset-x,0.75rem)]";

interface VirtualizedNoteListProps {
  count: number;
  renderRow: (index: number) => ReactNode;
  className?: string;
  scrollRef?: RefObject<HTMLDivElement | null>;
}

export function VirtualizedNoteList({
  count,
  renderRow,
  className,
  scrollRef,
}: VirtualizedNoteListProps) {
  const localRef = useRef<HTMLDivElement>(null);
  const parentRef = scrollRef ?? localRef;
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => NOTE_ROW_ESTIMATE_PX,
    overscan: 12,
  });

  return (
    <div
      ref={parentRef}
      tabIndex={0}
      data-note-list
      data-virtual-list
      className={cn("group/notelist h-full overflow-y-auto pt-3 pb-3 outline-none", className)}
    >
      <GlideMenu className="w-full" activeSelector='[data-selected="true"]'>
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((row) => (
            <div
              key={row.key}
              data-index={row.index}
              data-note-list-row
              ref={virtualizer.measureElement}
              className={cn("absolute left-0 w-full pb-1.5", NOTE_LIST_ROW_INSET_CLASS)}
              style={{ top: row.start }}
            >
              {renderRow(row.index)}
            </div>
          ))}
        </div>
      </GlideMenu>
    </div>
  );
}
