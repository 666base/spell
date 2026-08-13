import { IconButton } from "../ui";
import { useNotes } from "../../context/NotesContext";
import { MenuIcon, MoreVerticalIcon, PlusIcon } from "../icons/velocity";

interface MobileTopBarProps {
  onOpenLeftDrawer: () => void;
  onOpenRightDrawer: () => void;
  title: string;
}

export function MobileTopBar({
  onOpenLeftDrawer,
  onOpenRightDrawer,
  title,
}: MobileTopBarProps) {
  const { createNote } = useNotes();

  return (
    <header className="flex-shrink-0 h-[calc(3.5rem+env(safe-area-inset-top))] flex items-center justify-between px-3 pt-[env(safe-area-inset-top)] border-b border-border bg-bg/85 backdrop-blur-xl z-30">
      <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
        <IconButton size="md" onClick={onOpenLeftDrawer} title="Menu">
          <MenuIcon className="w-5 h-5 stroke-[1.65]" />
        </IconButton>
        
        <span className="text-sm font-semibold tracking-[-0.01em] truncate flex-1 text-center">
          {title}
        </span>
      </div>

      <div className="flex items-center gap-1 flex-1 justify-end">
        <IconButton size="md" onClick={createNote} title="New Note">
          <PlusIcon className="w-5 h-5 stroke-[1.65]" />
        </IconButton>
        <IconButton size="md" onClick={onOpenRightDrawer} title="More">
          <MoreVerticalIcon className="w-5 h-5 stroke-[1.65]" />
        </IconButton>
      </div>
    </header>
  );
}
