import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note, NoteMetadata } from "../types/note";
import { NotesProvider, useNotes } from "./NotesContext";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function noteOf(id: string, content: string): Note {
  return {
    id,
    title: id.split("/").pop() ?? id,
    content,
    path: `/${id}.md`,
    modified: 1,
  };
}

function metaOf(id: string): NoteMetadata {
  return { id, title: id.split("/").pop() ?? id, preview: "", modified: 1 };
}

const disk = new Map<string, string>();
const catalog = new Map<string, Note>();
const saveQueue: Array<{
  id: string;
  content: string;
  done: Deferred<Note>;
}> = [];

vi.mock("../services/notes", () => ({
  getNotesFolder: vi.fn(async () => "/vault"),
  listNotes: vi.fn(async () => [...catalog.values()].map((note) => metaOf(note.id))),
  startFileWatcher: vi.fn(async () => undefined),
  readNote: vi.fn(async (id: string) => {
    const note = catalog.get(id);
    if (!note) throw new Error(`missing ${id}`);
    return { ...note, content: disk.get(id) ?? note.content };
  }),
  saveNote: vi.fn((id: string, content: string) => {
    const done = deferred<Note>();
    saveQueue.push({ id, content, done });
    return done.promise.then((saved) => {
      disk.set(saved.id, content);
      catalog.set(saved.id, saved);
      return saved;
    });
  }),
  createNote: vi.fn(async (targetFolder?: string, content?: string) => {
    if (createHold) await createHold.promise;
    const body = content?.trim() ? content : "# Untitled\n\n";
    const leaf = "Untitled";
    const id = targetFolder ? `${targetFolder}/${leaf}` : leaf;
    let unique = id;
    let n = 2;
    while (catalog.has(unique)) {
      unique = `${id}-${n}`;
      n += 1;
    }
    const created = noteOf(unique, body);
    disk.set(unique, body);
    catalog.set(unique, created);
    return created;
  }),
  getSettings: vi.fn(async () => ({
    theme: { mode: "system" as const },
    pinnedNoteIds: [],
    noteOrder: [],
  })),
  updateSettings: vi.fn(async () => undefined),
  searchNotes: vi.fn(async () => []),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => undefined),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("../services/cloudSync", () => ({
  queueCloudDelete: vi.fn(),
  queueCloudUpsert: vi.fn(),
}));

vi.mock("../services/notePublish", () => ({
  movePublishedNoteQuietly: vi.fn(),
  unpublishNoteQuietly: vi.fn(),
}));

let api: ReturnType<typeof useNotes> | null = null;
let createHold: Deferred<void> | null = null;

function Probe() {
  const notes = useNotes();
  useEffect(() => {
    api = notes;
  });
  return (
    <div>
      <span data-testid="loading">{String(notes.isLoading)}</span>
      <span data-testid="open">{notes.currentNote?.id ?? ""}</span>
      <span data-testid="error">{notes.error ?? ""}</span>
      <span data-testid="creating">{String(notes.isCreatingNote)}</span>
    </div>
  );
}

function wrap(node: ReactNode) {
  return <NotesProvider>{node}</NotesProvider>;
}

async function ready() {
  const view = render(wrap(<Probe />));
  await waitFor(() => expect(view.getByTestId("loading").textContent).toBe("false"));
  if (!api) throw new Error("notes api missing");
  return { view, notes: api };
}

async function finishSave(index: number, saved: Note) {
  const item = saveQueue[index];
  if (!item) throw new Error(`no save at ${index}`);
  item.done.resolve(saved);
  await item.done.promise;
}

describe("NotesContext save and create", () => {
  afterEach(() => {
    cleanup();
    api = null;
  });

  beforeEach(() => {
    disk.clear();
    catalog.clear();
    saveQueue.length = 0;
    createHold = null;
    api = null;
    catalog.set("A", noteOf("A", "# A\n\nold"));
    disk.set("A", "# A\n\nold");
  });

  it("round-trips the latest save when a slower earlier write finishes last", async () => {
    const { notes } = await ready();
    await act(async () => {
      await notes.selectNote("A");
    });

    let first: Promise<Note | undefined> = Promise.resolve(undefined);
    let second: Promise<Note | undefined> = Promise.resolve(undefined);
    await act(async () => {
      first = notes.saveNote("# A\n\nstale", "A");
      second = notes.saveNote("# A\n\nlatest", "A");
    });

    expect(saveQueue.map((item) => item.content)).toEqual(["# A\n\nlatest"]);

    await act(async () => {
      await finishSave(0, noteOf("A", "# A\n\nlatest"));
      await Promise.all([first, second]);
    });

    expect(disk.get("A")).toBe("# A\n\nlatest");
  });

  it("keeps the new note open when a save of the previous note finishes after create", async () => {
    const { view, notes } = await ready();
    await act(async () => {
      await notes.selectNote("A");
    });

    let createdId = "";
    await act(async () => {
      const saving = notes.saveNote("# A\n\nin flight", "A");
      const createdP = notes.createNote();
      const created = await createdP;
      createdId = created?.id ?? "";
      await finishSave(0, noteOf("A", "# A\n\nin flight"));
      await saving;
    });

    expect(createdId).toBeTruthy();
    expect(view.getByTestId("open").textContent).toBe(createdId);
  });

  it("does not resolve a failed save as success", async () => {
    const { notes } = await ready();
    await act(async () => {
      await notes.selectNote("A");
    });

    let saving: Promise<Note | undefined> = Promise.resolve(undefined);
    await act(async () => {
      saving = notes.saveNote("# A\n\nunsaved", "A");
    });

    const failed = expect(saving).rejects.toThrow("disk full");
    await act(async () => {
      saveQueue[0]?.done.reject(new Error("disk full"));
    });
    await failed;
    expect(disk.get("A")).toBe("# A\n\nold");
  });

  it("coalesces a rapid burst of saves to the last snapshot", async () => {
    const { notes } = await ready();
    await act(async () => {
      await notes.selectNote("A");
    });

    const writes: Promise<Note | undefined>[] = [];
    await act(async () => {
      for (let i = 0; i < 12; i += 1) {
        writes.push(notes.saveNote(`# A\n\nedit-${i}`, "A"));
      }
    });

    expect(saveQueue.map((item) => item.content)).toEqual(["# A\n\nedit-11"]);

    await act(async () => {
      await finishSave(0, noteOf("A", "# A\n\nedit-11"));
      await Promise.all(writes);
    });

    expect(disk.get("A")).toBe("# A\n\nedit-11");
  });

  it("round-trips an empty note and a very large note", async () => {
    const { notes } = await ready();
    await act(async () => {
      await notes.selectNote("A");
    });

    let emptySave: Promise<Note | undefined> = Promise.resolve(undefined);
    await act(async () => {
      emptySave = notes.saveNote("", "A");
    });
    await act(async () => {
      await finishSave(0, noteOf("A", ""));
      await emptySave;
    });
    expect(disk.get("A")).toBe("");

    const huge = `# Large\n\n${"x".repeat(500_000)}`;
    let hugeSave: Promise<Note | undefined> = Promise.resolve(undefined);
    await act(async () => {
      hugeSave = notes.saveNote(huge, "A");
    });
    await act(async () => {
      await finishSave(1, noteOf("A", huge));
      await hugeSave;
    });
    expect(disk.get("A")).toBe(huge);
  });

  it("keeps the latest snapshot per note when two notes save at once", async () => {
    catalog.set("B", noteOf("B", "# B\n\nold"));
    disk.set("B", "# B\n\nold");
    const { notes } = await ready();
    await act(async () => {
      await notes.selectNote("A");
    });

    let saveA: Promise<Note | undefined> = Promise.resolve(undefined);
    let saveB: Promise<Note | undefined> = Promise.resolve(undefined);
    let saveA2: Promise<Note | undefined> = Promise.resolve(undefined);
    await act(async () => {
      saveA = notes.saveNote("# A\n\nstale", "A");
      saveB = notes.saveNote("# B\n\nkeep", "B");
      saveA2 = notes.saveNote("# A\n\nlatest", "A");
    });

    expect(saveQueue.map((item) => `${item.id}:${item.content}`)).toEqual([
      "A:# A\n\nlatest",
      "B:# B\n\nkeep",
    ]);

    await act(async () => {
      await finishSave(0, noteOf("A", "# A\n\nlatest"));
      await finishSave(1, noteOf("B", "# B\n\nkeep"));
      await Promise.all([saveA, saveB, saveA2]);
    });

    expect(disk.get("A")).toBe("# A\n\nlatest");
    expect(disk.get("B")).toBe("# B\n\nkeep");
  });

  it("retries after a failed save and persists the recovered content", async () => {
    const { notes } = await ready();
    await act(async () => {
      await notes.selectNote("A");
    });

    let first: Promise<Note | undefined> = Promise.resolve(undefined);
    await act(async () => {
      first = notes.saveNote("# A\n\nlost", "A");
    });
    const failed = expect(first).rejects.toThrow("offline");
    await act(async () => {
      saveQueue[0]?.done.reject(new Error("offline"));
    });
    await failed;
    expect(disk.get("A")).toBe("# A\n\nold");

    let retry: Promise<Note | undefined> = Promise.resolve(undefined);
    await act(async () => {
      retry = notes.saveNote("# A\n\nrecovered", "A");
    });
    await act(async () => {
      await finishSave(1, noteOf("A", "# A\n\nrecovered"));
      await retry;
    });
    expect(disk.get("A")).toBe("# A\n\nrecovered");
  });

  it("double create opens one note and does not leave the editor on the previous note", async () => {
    const { view, notes } = await ready();
    await act(async () => {
      await notes.selectNote("A");
    });

    let first: Note | undefined;
    let second: Note | undefined;
    await act(async () => {
      const a = notes.createNote();
      const b = notes.createNote();
      first = await a;
      second = await b;
    });

    expect(first?.id).toBeTruthy();
    expect(second).toBeUndefined();
    expect([...catalog.keys()].filter((id) => id !== "A")).toEqual([first!.id]);
    expect(view.getByTestId("open").textContent).toBe(first!.id);
  });

  it("marks new-note as busy until create finishes so a second tap is not a silent no-op", async () => {
    const { view, notes } = await ready();
    createHold = deferred();

    let creating: Promise<Note | undefined> = Promise.resolve(undefined);
    await act(async () => {
      creating = notes.createNote();
    });
    await waitFor(() => expect(view.getByTestId("creating").textContent).toBe("true"));

    await act(async () => {
      createHold?.resolve();
      await creating;
    });
    await waitFor(() => expect(view.getByTestId("creating").textContent).toBe("false"));
    expect(view.getByTestId("open").textContent).toBe("Untitled");
  });
});
