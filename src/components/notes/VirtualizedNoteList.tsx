import { useRef, type ReactNode, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "../../lib/utils";

export const NOTE_ROW_ESTIMATE_PX = 68;

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
      className={cn("group/notelist h-full overflow-y-auto px-1 pt-2.5 pb-2 outline-none", className)}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => (
          <div
            key={row.key}
            data-index={row.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 w-full px-1.5 pb-1"
            style={{ top: row.start }}
          >
            {renderRow(row.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
