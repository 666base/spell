import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useNotes } from "../../context/NotesContext";
import { notesInScope, scopeForNote, type NotesScope } from "../../lib/notesScope";
import {
  folderItemId,
  loadSidebarLibrary,
  saveSidebarLibrary,
  toggleListValue,
} from "../../lib/sidebarLibrary";
import { NoteTitlebar } from "../layout/NoteTitlebar";
import { MobileNavBar } from "../layout/mobile/MobileChrome";
import { AccountSettingsSection } from "../settings/AccountSettingsSection";
import { AppearanceSettingsSection } from "../settings/AppearanceSettingsSection";
import { AppUpdateSection } from "../settings/AppUpdateSection";
import { GeneralSettingsSection } from "../settings/GeneralSettingsSection";
import { NoteItem } from "../notes/NoteList";
import { VirtualizedNoteList } from "../notes/VirtualizedNoteList";
import { cn } from "../../lib/utils";
import * as notesService from "../../services/notes";
import { queueCloudUpsert } from "../../services/cloudSync";
import type { NoteMetadata } from "../../types/note";
import {
  AccountIcon,
  ChevronRightIcon,
  DownloadIcon,
  SettingsIcon,
  SwatchIcon,
  TrashIcon,
} from "../icons/velocity";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  ArchiveGlyph,
  JournalGlyph,
  MoneyGlyph,
  ProjectsGlyph,
} from "../ui";

export type HomeTab = "library" | "archive" | "trash" | "settings";

const HOME_TABS: { id: HomeTab; label: string }[] = [
  { id: "library", label: "Library" },
  { id: "archive", label: "Archive" },
  { id: "trash", label: "Trash" },
  { id: "settings", label: "Settings" },
];

type SettingsTab = "account" | "general" | "appearance";
type MobileSettingsSection = SettingsTab | "update";
type CompactPane = "index" | "archive" | "trash" | MobileSettingsSection;

const SETTINGS_TABS: {
  id: SettingsTab;
  label: string;
  icon: typeof AccountIcon;
}[] = [
  { id: "account", label: "Account", icon: AccountIcon },
  { id: "general", label: "General", icon: SettingsIcon },
  { id: "appearance", label: "Appearance", icon: SwatchIcon },
];

const MOBILE_SETTINGS_ROWS: {
  id: MobileSettingsSection;
  label: string;
  icon: typeof AccountIcon;
}[] = [
  { id: "update", label: "App Update", icon: DownloadIcon },
  ...SETTINGS_TABS,
];

interface HomePageProps {
  sidebarVisible?: boolean;
  foldersVisible?: boolean;
  focusMode?: boolean;
  onToggleSidebar?: () => void;
  onNewNote?: () => void;
  showWindowControls?: boolean;
  onSelectScope: (scope: NotesScope) => void;
  compact?: boolean;
  onBack?: () => void;
  openSettingsToken?: number;
  onOpenNote?: (id: string) => void;
}

export function HomePage({
  sidebarVisible = true,
  foldersVisible,
  focusMode = false,
  onToggleSidebar,
  onNewNote,
  showWindowControls = false,
  onSelectScope,
  compact = false,
  onBack,
  openSettingsToken = 0,
  onOpenNote,
}: HomePageProps) {
  const { notes, selectNote, refreshNotes, reloadVersion } = useNotes();
  const [tab, setTab] = useState<HomeTab>(openSettingsToken > 0 ? "settings" : "library");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("account");
  const [compactPane, setCompactPane] = useState<CompactPane>(
    openSettingsToken > 0 ? "account" : "index",
  );
  const [trash, setTrash] = useState<NoteMetadata[]>([]);
  const [confirm, setConfirm] = useState<{ type: "empty" } | { type: "delete"; id: string; title: string } | null>(
    null,
  );

  useEffect(() => {
    if (openSettingsToken > 0) {
      setTab("settings");
      setCompactPane("account");
    }
  }, [openSettingsToken]);

  const allNotes = useMemo(
    () =>
      notesInScope(notes, { type: "all" }).slice().sort((a, b) => b.modified - a.modified),
    [notes],
  );

  const loadTrash = useCallback(async () => {
    try {
      const items = await notesService.listTrash();
      setTrash(items.slice().sort((a, b) => b.modified - a.modified));
    } catch (err) {
      console.error("Failed to list trash", err);
      toast.error(err instanceof Error ? err.message : "Couldn’t load trash");
    }
  }, []);

  useEffect(() => {
    if (tab !== "trash" && compactPane !== "trash") return;
    void loadTrash();
  }, [tab, compactPane, reloadVersion, loadTrash]);

  const openNote = useCallback(
    (id: string) => {
      if (onOpenNote) {
        onOpenNote(id);
        return;
      }
      void selectNote(id);
      onSelectScope(scopeForNote(id));
    },
    [onOpenNote, onSelectScope, selectNote],
  );

  const restoreNote = useCallback(
    async (id: string) => {
      try {
        const restored = await notesService.restoreTrashNote(id);
        await refreshNotes();
        try {
          queueCloudUpsert(await notesService.readNote(restored.id));
        } catch (err) {
          console.error("Failed to queue restored note for cloud", err);
        }
        await loadTrash();
      } catch (err) {
        console.error("Failed to restore note", err);
        toast.error(err instanceof Error ? err.message : "Couldn’t restore that note");
      }
    },
    [loadTrash, refreshNotes],
  );

  const deleteForever = useCallback(
    async (id: string) => {
      try {
        await notesService.deleteTrashNote(id);
        await loadTrash();
      } catch (err) {
        console.error("Failed to delete trashed note", err);
        toast.error(err instanceof Error ? err.message : "Couldn’t delete that note");
      }
    },
    [loadTrash],
  );

  const empty = useCallback(async () => {
    try {
      await notesService.emptyTrash();
      await loadTrash();
    } catch (err) {
      console.error("Failed to empty trash", err);
      toast.error(err instanceof Error ? err.message : "Couldn’t empty trash");
    }
  }, [loadTrash]);

  const layout = compact ? "rows" : "cards";
  const compactSettings = compact
    ? MOBILE_SETTINGS_ROWS.find((row) => row.id === compactPane)
    : null;

  const tabs = (
    <nav className="home-tabs" role="tablist" aria-label="Home">
      {HOME_TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={tab === item.id}
          className="home-tab"
          onClick={() => setTab(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );

  const body = (
    <>
      {tab === "library" && (
        <LibraryPanel
          notes={allNotes}
          onSelectScope={onSelectScope}
          onOpenNote={openNote}
        />
      )}
      {tab === "archive" && <ArchivePanel layout={layout} onSelectScope={onSelectScope} />}
      {tab === "trash" && (
        <TrashPanel
          notes={trash}
          layout={layout}
          onRestore={(id) => void restoreNote(id)}
          onDelete={(note) => setConfirm({ type: "delete", id: note.id, title: note.title })}
          onEmpty={() => setConfirm({ type: "empty" })}
        />
      )}
      {tab === "settings" && !compact && (
        <section className="home-settings">
          <nav className="flex flex-wrap gap-1 p-1.5">
            {SETTINGS_TABS.map((item) => {
              const Icon = item.icon;
              const active = settingsTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSettingsTab(item.id)}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium",
                    active
                      ? "bg-bg-selected text-text"
                      : "text-text-muted hover:bg-bg-hover hover:text-text",
                  )}
                >
                  <Icon className="size-3.5" />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="border-t border-border px-3 py-4">
            {settingsTab === "account" && <AccountSettingsSection />}
            {settingsTab === "general" && <GeneralSettingsSection />}
            {settingsTab === "appearance" && <AppearanceSettingsSection />}
          </div>
        </section>
      )}
    </>
  );

  const dialog = (
    <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {confirm?.type === "empty" ? "Empty trash?" : "Delete forever?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirm?.type === "empty"
              ? "Every note in the trash will be permanently deleted. This cannot be undone."
              : `“${confirm?.title}” will be permanently deleted. This cannot be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (confirm?.type === "empty") void empty();
              if (confirm?.type === "delete") void deleteForever(confirm.id);
              setConfirm(null);
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (compact) {
    const onCompactBack =
      compactPane === "index"
        ? onBack
        : () => setCompactPane("index");
    const compactTitle = compactSettings
      ? compactSettings.label
      : compactPane === "archive"
        ? "Archive"
        : compactPane === "trash"
          ? "Trash"
          : "Home";
    const compactBackLabel = compactPane === "index" ? "Folders" : "Home";

    return (
      <div className="mobile-settings">
        <MobileNavBar
          backLabel={compactBackLabel}
          onBack={onCompactBack}
          title={compactTitle}
          trailing={
            compactPane === "trash" && trash.length > 0 ? (
              <button
                type="button"
                className="mobile-nav-action is-danger"
                onClick={() => setConfirm({ type: "empty" })}
              >
                Empty
              </button>
            ) : undefined
          }
        />
        <div className="mobile-scroll">
          {compactSettings ? (
            <div className="mobile-settings-section">
              {compactSettings.id === "update" && <AppUpdateSection />}
              {compactSettings.id === "account" && <AccountSettingsSection />}
              {compactSettings.id === "general" && <GeneralSettingsSection />}
              {compactSettings.id === "appearance" && <AppearanceSettingsSection />}
            </div>
          ) : compactPane === "archive" ? (
            <ArchivePanel layout="rows" onSelectScope={onSelectScope} />
          ) : compactPane === "trash" ? (
            <TrashPanel
              notes={trash}
              layout="rows"
              showToolbar={false}
              onRestore={(id) => void restoreNote(id)}
              onDelete={(note) => setConfirm({ type: "delete", id: note.id, title: note.title })}
              onEmpty={() => setConfirm({ type: "empty" })}
            />
          ) : (
            <CompactHomeIndex
              notes={allNotes}
              onSelectScope={onSelectScope}
              onOpenNote={openNote}
              onOpenArchive={() => setCompactPane("archive")}
              onOpenTrash={() => setCompactPane("trash")}
              onOpenSettings={(id) => setCompactPane(id)}
            />
          )}
        </div>
        {dialog}
      </div>
    );
  }

  return (
    <div className="home-page">
      <NoteTitlebar
        sidebarVisible={sidebarVisible}
        foldersVisible={foldersVisible}
        focusMode={focusMode}
        onToggleSidebar={onToggleSidebar}
        onNewNote={onNewNote}
        showCompose={false}
        showWindowControls={showWindowControls}
        center={<span className="titlebar-title">Home</span>}
      />
      {tabs}
      <div className="home-panel">{body}</div>
      {dialog}
    </div>
  );
}

function CompactHomeIndex({
  notes,
  onSelectScope,
  onOpenNote,
  onOpenArchive,
  onOpenTrash,
  onOpenSettings,
}: {
  notes: NoteMetadata[];
  onSelectScope: (scope: NotesScope) => void;
  onOpenNote: (id: string) => void;
  onOpenArchive: () => void;
  onOpenTrash: () => void;
  onOpenSettings: (id: MobileSettingsSection) => void;
}) {
  return (
    <>
      <section className="mobile-group">
        <h2 className="mobile-group-title">Open</h2>
        <div className="mobile-group-card">
          <HomeRow
            layout="rows"
            icon={<JournalGlyph />}
            title="Journal"
            onClick={() => onSelectScope({ type: "journal" })}
          />
          <HomeRow
            layout="rows"
            icon={<ProjectsGlyph />}
            title="Projects"
            onClick={() => onSelectScope({ type: "projects" })}
          />
          <HomeRow
            layout="rows"
            icon={<MoneyGlyph />}
            title="Money"
            onClick={() => onSelectScope({ type: "money" })}
          />
        </div>
      </section>
      <section className="mobile-group">
        <h2 className="mobile-group-title">All notes</h2>
        <div className="mobile-group-card">
          {notes.length === 0 ? (
            <div className="mobile-folder-row">
              <span className="mobile-folder-label text-text-muted">No notes yet</span>
            </div>
          ) : (
            notes.map((note) => (
              <button
                key={note.id}
                type="button"
                className="mobile-folder-row"
                onClick={() => onOpenNote(note.id)}
              >
                <span className="mobile-folder-label">{note.title}</span>
              </button>
            ))
          )}
        </div>
      </section>
      <section className="mobile-group">
        <h2 className="mobile-group-title">Library</h2>
        <div className="mobile-group-card">
          <HomeRow layout="rows" icon={<ArchiveGlyph />} title="Archive" onClick={onOpenArchive} />
          <HomeRow layout="rows" icon={<TrashIcon />} title="Trash" onClick={onOpenTrash} />
        </div>
      </section>
      <section className="mobile-group">
        <h2 className="mobile-group-title">Settings</h2>
        <div className="mobile-group-card">
          {MOBILE_SETTINGS_ROWS.map((item) => {
            const Icon = item.icon;
            return (
              <HomeRow
                key={item.id}
                layout="rows"
                icon={<Icon />}
                title={item.label}
                onClick={() => onOpenSettings(item.id)}
              />
            );
          })}
        </div>
      </section>
    </>
  );
}

function LibraryPanel({
  notes,
  onSelectScope,
  onOpenNote,
}: {
  notes: NoteMetadata[];
  onSelectScope: (scope: NotesScope) => void;
  onOpenNote: (id: string) => void;
}) {
  const shortcuts = (
      <>
        <button type="button" className="home-chip" onClick={() => onSelectScope({ type: "journal" })}>
          <JournalGlyph />
          Journal
        </button>
        <button type="button" className="home-chip" onClick={() => onSelectScope({ type: "projects" })}>
          <ProjectsGlyph />
          Projects
        </button>
        <button type="button" className="home-chip" onClick={() => onSelectScope({ type: "money" })}>
          <MoneyGlyph />
          Money
        </button>
      </>
    );

  return (
    <div className="home-library">
      <div className="home-shortcuts">{shortcuts}</div>
      {notes.length === 0 ? (
        <p className="home-empty">No notes yet</p>
      ) : (
        <VirtualizedNoteList
          count={notes.length}
          renderRow={(index) => {
            const note = notes[index];
            return (
              <NoteItem
                id={note.id}
                title={note.title}
                preview={note.preview}
                modified={note.modified}
                isSelected={false}
                isPinned={false}
                onSelect={(id) => onOpenNote(id)}
              />
            );
          }}
        />
      )}
    </div>
  );
}

function ArchivePanel({
  layout,
  onSelectScope,
}: {
  layout: "cards" | "rows";
  onSelectScope: (scope: NotesScope) => void;
}) {
  const [library, setLibrary] = useState(loadSidebarLibrary);
  const archivedFolders = useMemo(
    () =>
      library.hidden
        .filter((id) => id.startsWith("folder:"))
        .map((id) => id.slice("folder:".length)),
    [library.hidden],
  );

  const unhideFolder = (path: string) => {
    const next = {
      ...library,
      hidden: toggleListValue(library.hidden, folderItemId(path)),
    };
    setLibrary(next);
    saveSidebarLibrary(next);
    onSelectScope({ type: "folder", path });
  };

  if (archivedFolders.length === 0) {
    return layout === "rows" ? (
      <section className="mobile-group">
        <div className="mobile-group-card">
          <div className="mobile-folder-row">
            <span className="mobile-folder-label text-text-muted">Nothing archived</span>
          </div>
        </div>
      </section>
    ) : (
      <p className="home-empty">Nothing archived</p>
    );
  }

  const rows = archivedFolders.map((path) => (
    <HomeRow
      key={path}
      layout={layout}
      icon={<ArchiveGlyph />}
      title={path}
      subtitle="Hidden folder"
      onClick={() => unhideFolder(path)}
    />
  ));

  if (layout === "rows") {
    return (
      <section className="mobile-group">
        <div className="mobile-group-card">{rows}</div>
      </section>
    );
  }

  return <div className="home-stack">{rows}</div>;
}

function TrashPanel({
  notes,
  layout,
  showToolbar = true,
  onRestore,
  onDelete,
  onEmpty,
}: {
  notes: NoteMetadata[];
  layout: "cards" | "rows";
  showToolbar?: boolean;
  onRestore: (id: string) => void;
  onDelete: (note: NoteMetadata) => void;
  onEmpty: () => void;
}) {
  const toolbar =
    showToolbar && notes.length > 0 ? (
      <div className="home-trash-toolbar">
        <button type="button" className="home-text-button" onClick={onEmpty}>
          Empty trash
        </button>
      </div>
    ) : null;

  if (notes.length === 0) {
    return layout === "rows" ? (
      <section className="mobile-group">
        <div className="mobile-group-card">
          <div className="mobile-folder-row">
            <span className="mobile-folder-label text-text-muted">Trash is empty</span>
          </div>
        </div>
      </section>
    ) : (
      <p className="home-empty">Trash is empty</p>
    );
  }

  const rows = notes.map((note) => (
    <div key={note.id} className={layout === "rows" ? "mobile-folder-row mobile-trash-row" : "money-row"}>
      <span className="min-w-0 flex-1 text-left">
        <span className={layout === "rows" ? "mobile-folder-label" : "money-row-title"}>{note.title}</span>
        {note.preview && layout !== "rows" && <span className="money-row-meta">{note.preview}</span>}
      </span>
      <span className="home-trash-actions">
        <button type="button" className="home-text-button" onClick={() => onRestore(note.id)}>
          Restore
        </button>
        <button type="button" className="home-text-button is-danger" onClick={() => onDelete(note)}>
          Delete
        </button>
      </span>
    </div>
  ));

  if (layout === "rows") {
    return (
      <>
        {toolbar}
        <section className="mobile-group">
          <div className="mobile-group-card">{rows}</div>
        </section>
      </>
    );
  }

  return (
    <div className="home-stack">
      {toolbar}
      {rows}
    </div>
  );
}

function HomeRow({
  layout,
  icon,
  title,
  subtitle,
  onClick,
}: {
  layout: "cards" | "rows";
  icon: ReactNode;
  title: string;
  subtitle?: string;
  onClick: () => void;
}) {
  if (layout === "rows") {
    return (
      <button type="button" className="mobile-folder-row" onClick={onClick}>
        <span className="mobile-folder-icon">{icon}</span>
        <span className="mobile-folder-copy">
          <span className="mobile-folder-label">{title}</span>
          {subtitle && <span className="mobile-folder-sub">{subtitle}</span>}
        </span>
        <ChevronRightIcon className="mobile-folder-chevron" />
      </button>
    );
  }

  return (
    <button type="button" className="money-row" onClick={onClick}>
      {icon}
      <span className="min-w-0 flex-1 text-left">
        <span className="money-row-title">{title}</span>
        {subtitle && <span className="money-row-meta">{subtitle}</span>}
      </span>
    </button>
  );
}
