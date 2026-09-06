import { DndContext } from "@dnd-kit/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FolderSourceList } from "./FolderSourceList";

vi.mock("../../context/NotesContext", () => ({
  useNotes: () => ({
    notes: [
      { id: "Work/alpha", title: "Alpha", preview: "", modified: 1 },
      { id: "Personal/beta", title: "Beta", preview: "", modified: 1 },
      { id: "Inbox", title: "Inbox", preview: "", modified: 1 },
    ],
    notesFolder: "/home/me/Notes",
    selectedNoteId: null,
    selectNote: vi.fn(),
    createFolder: vi.fn(),
    deleteFolder: vi.fn(),
    renameFolder: vi.fn(),
  }),
}));

vi.mock("../../services/notes", () => ({
  listFolders: vi.fn(async () => ["Work", "Work/Clients", "Personal"]),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function renderList(onSelectScope = vi.fn(), scope: { type: "all" } | { type: "home" } = { type: "all" }) {
  return {
    onSelectScope,
    ...render(
      <DndContext>
        <FolderSourceList
          scope={scope}
          onSelectScope={onSelectScope}
        />
      </DndContext>,
    ),
  };
}

describe("FolderSourceList", () => {
  beforeEach(() => {
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

  it("keeps folders in the rail and puts Journal, Projects, and Money under them", async () => {
    renderList();

    expect(screen.getByRole("button", { name: "Home" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
    expect(screen.queryByRole("button", { name: "All Notes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "New folder" })).toBeNull();
    expect(screen.getByRole("button", { name: "New" })).toBeTruthy();
    expect(document.querySelector(".create-plus-icon")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("Work")).toBeTruthy();
      expect(screen.getByText("Personal")).toBeTruthy();
    });

    const projects = screen.getByRole("button", { name: "Projects" });
    const journal = screen.getByRole("button", { name: "Journal" });
    const money = screen.getByRole("button", { name: "Money" });
    const work = screen.getByText("Work");
    expect(work.compareDocumentPosition(projects) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(journal).toBeTruthy();
    expect(money).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Search folders" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search folders" }), {
      target: { value: "pers" },
    });

    expect(screen.getByText("Personal")).toBeTruthy();
    expect(screen.queryByText("Work")).toBeNull();
    expect(screen.queryByRole("button", { name: "Projects" })).toBeNull();
  });

  it("puts New to the left of folder search without an empty titlebar", () => {
    renderList();
    const home = screen.getByRole("button", { name: "Home" });
    const search = screen.getByRole("button", { name: "Search folders" });
    const create = screen.getByRole("button", { name: "New" });

    expect(document.querySelector(".folder-titlebar")).toBeNull();
    expect(home.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(create.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("opens Home from the folder rail header", () => {
    const { onSelectScope } = renderList();
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(onSelectScope).toHaveBeenCalledWith({ type: "home" });
  });

  it("paints Home with the two-tone source glyph", () => {
    renderList();
    const home = screen.getByRole("button", { name: "Home" });
    expect(home.querySelector(".home-glyph")).toBeTruthy();
    expect(home.querySelector(".home-glyph-roof")).toBeTruthy();
    expect(home.querySelector(".home-glyph-door")).toBeTruthy();
    expect(home.querySelector("svg.lucide")).toBeNull();
  });

  it("marks Home selected when that tab is open", () => {
    renderList(vi.fn(), { type: "home" });
    expect(screen.getByRole("button", { name: "Home" }).getAttribute("data-selected")).toBe("true");
  });

  it("selects workspace rows without leaving the folder rail", () => {
    const { onSelectScope } = renderList();
    fireEvent.click(screen.getByRole("button", { name: "Projects" }));
    expect(onSelectScope).toHaveBeenCalledWith({ type: "projects" });
    fireEvent.click(screen.getByRole("button", { name: "Journal" }));
    expect(onSelectScope).toHaveBeenCalledWith({ type: "journal" });
    fireEvent.click(screen.getByRole("button", { name: "Money" }));
    expect(onSelectScope).toHaveBeenCalledWith({ type: "money" });
  });

  it("keeps Journal, Projects, and Money on the same compact rows as folder notes", async () => {
    renderList();

    await waitFor(() => {
      expect(screen.getByText("Work")).toBeTruthy();
      expect(screen.getByText("Inbox")).toBeTruthy();
    });

    const workRow = screen.getByText("Work").closest("[data-row]");
    const noteRow = screen.getByText("Inbox").closest("[data-row]");
    const workspaceRows = ["Journal", "Projects", "Money"].map((name) =>
      screen.getByRole("button", { name }).closest("[data-row]"),
    );

    expect(workRow?.classList.contains("source-list-row")).toBe(true);
    expect(noteRow?.classList.contains("source-list-row")).toBe(true);
    expect(workRow?.querySelector(".folder-glyph")).toBeTruthy();
    expect(document.querySelector(".source-list-divider")).toBeNull();

    expect(noteRow?.getAttribute("data-line-icon")).toBe("true");
    expect(noteRow?.querySelector("svg.lucide")).toBeTruthy();

    for (const row of workspaceRows) {
      expect(row?.classList.contains("source-list-row")).toBe(true);
      expect(row?.getAttribute("data-line-icon")).toBeNull();
      expect(row?.querySelector(".source-glyph")).toBeTruthy();
      expect(row?.querySelector("svg.lucide")).toBeNull();
    }
    expect(workspaceRows[0]?.querySelector(".journal-glyph")).toBeTruthy();
    expect(workspaceRows[0]?.querySelectorAll(".journal-glyph-ring").length).toBe(2);
    expect(workspaceRows[0]?.querySelectorAll(".journal-glyph-day").length).toBe(6);
    expect(workRow?.getAttribute("data-line-icon")).toBeNull();
  });

  it("puts pinned folders first, including nested ones", async () => {
    window.localStorage.setItem(
      "spell:sidebar-library",
      JSON.stringify({ pinned: ["folder:Work/Clients", "folder:Personal"] }),
    );
    renderList();

    await waitFor(() => {
      expect(screen.getByText("Clients")).toBeTruthy();
      expect(screen.getByText("Personal")).toBeTruthy();
      expect(screen.getByText("Work")).toBeTruthy();
    });

    const clients = screen.getByText("Clients");
    const personal = screen.getByText("Personal");
    const work = screen.getByText("Work");
    expect(clients.compareDocumentPosition(personal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(personal.compareDocumentPosition(work) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText("Clients")).toHaveLength(1);
  });

  it("keeps the folder glyph closed when that folder is selected", async () => {
    render(
      <DndContext>
        <FolderSourceList
          scope={{ type: "folder", path: "Work" }}
          onSelectScope={vi.fn()}
        />
      </DndContext>,
    );

    await waitFor(() => {
      expect(screen.getByText("Work")).toBeTruthy();
    });

    const workRow = screen.getByText("Work").closest("[data-row]");
    expect(workRow?.getAttribute("data-selected")).toBe("true");
    expect(workRow?.querySelector(".folder-glyph")?.getAttribute("data-open")).toBe("false");
  });

  it("opens create options from the header plus", async () => {
    renderList();
    const trigger = screen.getByRole("button", { name: "New" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Folder" })).toBeTruthy();
      expect(screen.getByRole("menuitem", { name: "Project" })).toBeTruthy();
      expect(screen.getByRole("menuitem", { name: "Month" })).toBeTruthy();
    });
  });
});
