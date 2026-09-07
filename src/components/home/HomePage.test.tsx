import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { HomePage } from "./HomePage";

const { notesState, trashApi } = vi.hoisted(() => ({
  notesState: {
    notes: [
      { id: "Inbox", title: "Inbox", preview: "", modified: 2 },
      { id: "Work/alpha", title: "Alpha", preview: "", modified: 1 },
      { id: "journals/2026-09-06", title: "6", preview: "", modified: 1 },
    ],
    selectNote: vi.fn(async () => undefined),
    refreshNotes: vi.fn(async () => undefined),
    reloadVersion: 0,
  },
  trashApi: {
    listTrash: vi.fn(async () => [] as { id: string; title: string; preview: string; modified: number }[]),
    restoreTrashNote: vi.fn(),
    deleteTrashNote: vi.fn(),
    emptyTrash: vi.fn(),
    readNote: vi.fn(),
  },
}));

vi.mock("../../context/NotesContext", () => ({
  useNotes: () => notesState,
}));

vi.mock("../../services/notes", () => trashApi);

vi.mock("../../services/cloudSync", () => ({
  queueCloudUpsert: vi.fn(),
}));

vi.mock("../notes/VirtualizedNoteList", () => ({
  VirtualizedNoteList: ({
    count,
    renderRow,
  }: {
    count: number;
    renderRow: (index: number) => ReactNode;
  }) => (
    <div>
      {Array.from({ length: count }, (_, index) => (
        <div key={index}>{renderRow(index)}</div>
      ))}
    </div>
  ),
}));

vi.mock("../settings/AccountSettingsSection", () => ({
  AccountSettingsSection: () => <div>Account settings</div>,
}));
vi.mock("../settings/GeneralSettingsSection", () => ({
  GeneralSettingsSection: () => <div>General settings</div>,
}));
vi.mock("../settings/AppearanceSettingsSection", () => ({
  AppearanceSettingsSection: () => <div>Appearance settings</div>,
}));
vi.mock("../settings/AppUpdateSection", () => ({
  AppUpdateSection: () => <div>App update</div>,
}));

describe("HomePage", () => {
  beforeEach(() => {
    notesState.selectNote.mockClear();
    notesState.refreshNotes.mockClear();
    trashApi.listTrash.mockReset();
    trashApi.listTrash.mockResolvedValue([]);
    trashApi.restoreTrashNote.mockReset();
    trashApi.deleteTrashNote.mockReset();
    trashApi.emptyTrash.mockReset();
    trashApi.readNote.mockReset();
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("splits Home into tabs and lists every library note", () => {
    const onSelectScope = vi.fn();
    render(<HomePage onSelectScope={onSelectScope} />);

    expect(document.querySelector(".titlebar-title")?.textContent).toBe("Home");
    expect(screen.getByRole("tab", { name: "Library" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Inbox")).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.queryByText("6")).toBeNull();
    expect(screen.queryByText("Account settings")).toBeNull();
    expect(screen.queryByText("Nothing archived")).toBeNull();
    expect(screen.queryByText("Trash is empty")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Journal" }));
    expect(onSelectScope).toHaveBeenCalledWith({ type: "journal" });
    fireEvent.click(screen.getByRole("button", { name: "Projects" }));
    expect(onSelectScope).toHaveBeenCalledWith({ type: "projects" });
    fireEvent.click(screen.getByRole("button", { name: "Money" }));
    expect(onSelectScope).toHaveBeenCalledWith({ type: "money" });

    fireEvent.click(screen.getByText("Alpha"));
    expect(notesState.selectNote).toHaveBeenCalledWith("Work/alpha");
    expect(onSelectScope).toHaveBeenCalledWith({ type: "folder", path: "Work" });

    fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
    expect(screen.getByText("Account settings")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Plugins" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    expect(screen.getByText("Appearance settings")).toBeTruthy();
  });

  it("restores an archived folder from the Archive tab", () => {
    window.localStorage.setItem(
      "spell:sidebar-library",
      JSON.stringify({
        pinned: [],
        pinOrder: [],
        hidden: ["folder:Work"],
        folderOrder: [],
        itemOrder: [],
        collapsedFolders: [],
        collapsed: [],
        showHidden: [],
      }),
    );
    const onSelectScope = vi.fn();
    render(<HomePage onSelectScope={onSelectScope} />);

    fireEvent.click(screen.getByRole("tab", { name: "Archive" }));
    fireEvent.click(screen.getByRole("button", { name: /Work/ }));
    expect(onSelectScope).toHaveBeenCalledWith({ type: "folder", path: "Work" });
    expect(JSON.parse(window.localStorage.getItem("spell:sidebar-library") ?? "{}").hidden).toEqual(
      [],
    );
  });

  it("restores a trashed note from the Trash tab", async () => {
    let trashItems = [{ id: "Work/gone", title: "Gone", preview: "old", modified: 1 }];
    trashApi.listTrash.mockImplementation(async () => trashItems);
    trashApi.restoreTrashNote.mockImplementation(async (id: string) => {
      trashItems = [];
      return { id, title: "Gone", preview: "old", modified: 1 };
    });
    trashApi.readNote.mockResolvedValue({
      id: "Work/gone",
      title: "Gone",
      content: "# Gone\n",
      path: "/notes/Work/gone.md",
      modified: 1,
    });

    render(<HomePage onSelectScope={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Trash" }));

    expect(await screen.findByText("Gone")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() => {
      expect(trashApi.restoreTrashNote).toHaveBeenCalledWith("Work/gone");
    });
    expect(notesState.refreshNotes).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText("Gone")).toBeNull();
    });
    expect(screen.getByText("Trash is empty")).toBeTruthy();
  });

  it("opens the Settings tab when asked from the account shortcut", () => {
    render(<HomePage onSelectScope={vi.fn()} openSettingsToken={1} />);
    expect(screen.getByRole("tab", { name: "Settings" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Account settings")).toBeTruthy();
    expect(screen.queryByText("Inbox")).toBeNull();
  });

  it("keeps Home notes, icons, and destinations in grouped cards on a phone", () => {
    const onSelectScope = vi.fn();
    const onOpenNote = vi.fn();
    render(<HomePage compact onSelectScope={onSelectScope} onOpenNote={onOpenNote} />);

    expect(screen.queryByRole("tablist", { name: "Home" })).toBeNull();
    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.getByText("Inbox")).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.queryByText("Account settings")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Projects" }));
    expect(onSelectScope).toHaveBeenCalledWith({ type: "projects" });
    fireEvent.click(screen.getByText("Alpha"));
    expect(onOpenNote).toHaveBeenCalledWith("Work/alpha");

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(screen.getByText("Nothing archived")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Home" }));

    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.getByText("Account settings")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Projects" })).toBeNull();
  });

  it("opens Account settings directly from the compact account shortcut", () => {
    render(<HomePage compact onSelectScope={vi.fn()} openSettingsToken={1} />);
    expect(screen.queryByRole("tablist", { name: "Home" })).toBeNull();
    expect(screen.getByText("Account")).toBeTruthy();
    expect(screen.getByText("Account settings")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Journal" })).toBeNull();
  });
});
