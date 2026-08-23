import type { ProjectIconId } from "../../types/note";
import {
  BookIcon,
  CalendarIcon,
  ClientIcon,
  DoneIcon,
  FlagIcon,
  InboxIcon,
  KanbanIcon,
  WorkflowIcon,
} from "../icons/velocity";

const ICONS: Record<ProjectIconId, typeof ClientIcon> = {
  briefcase: ClientIcon,
  board: KanbanIcon,
  flag: FlagIcon,
  book: BookIcon,
  calendar: CalendarIcon,
  inbox: InboxIcon,
  check: DoneIcon,
  workflow: WorkflowIcon,
};

export function ProjectGlyph({
  id,
  className,
}: {
  id?: ProjectIconId;
  className?: string;
}) {
  const Icon = ICONS[id ?? "briefcase"] ?? ClientIcon;
  return <Icon className={className} />;
}
