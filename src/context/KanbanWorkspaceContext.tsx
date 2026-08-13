import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNotesData } from "./NotesContext";
import * as notesService from "../services/notes";
import type {
  KanbanBoard,
  KanbanCard,
  KanbanColumn,
  KanbanProject,
  KanbanWorkspace,
} from "../types/note";

interface CreateProjectInput {
  name: string;
  client?: string;
}

interface KanbanWorkspaceContextValue {
  workspace: KanbanWorkspace;
  activeProject: KanbanProject | null;
  isLoading: boolean;
  createProject: (input: CreateProjectInput) => KanbanProject;
  selectProject: (projectId: string) => void;
  updateProject: (project: KanbanProject) => void;
  deleteProject: (projectId: string) => void;
}

const KanbanWorkspaceContext = createContext<KanbanWorkspaceContextValue | null>(null);

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createEmptyBoard(): KanbanBoard {
  return {
    version: 1,
    columns: [
      { id: "inbox", title: "Inbox", cardIds: [] },
      { id: "ready", title: "This week", cardIds: [] },
      { id: "doing", title: "In progress", cardIds: [] },
      { id: "waiting", title: "Waiting on client", cardIds: [] },
      { id: "done", title: "Done", cardIds: [] },
    ],
    cards: [],
  };
}

export function normalizeBoard(value: KanbanBoard | undefined): KanbanBoard {
  const fallback = createEmptyBoard();
  if (!value || value.version !== 1 || !Array.isArray(value.cards) || !Array.isArray(value.columns)) {
    return fallback;
  }

  const cards = value.cards.filter((card): card is KanbanCard =>
    typeof card?.id === "string" &&
    typeof card.title === "string" &&
    (card.priority === "high" || card.priority === "medium" || card.priority === "low"),
  ).map((card) => ({
    ...card,
    todos: Array.isArray(card.todos)
      ? card.todos.filter((todo) => typeof todo?.id === "string" && typeof todo.title === "string" && typeof todo.completed === "boolean")
      : [],
  }));
  const validIds = new Set(cards.map((card) => card.id));
  const placed = new Set<string>();
  const columns = value.columns
    .filter((column): column is KanbanColumn => typeof column?.id === "string" && typeof column.title === "string" && Array.isArray(column.cardIds))
    .map((column) => ({
      id: column.id,
      title: column.title.trim() || "Untitled stage",
      cardIds: column.cardIds.filter((id): id is string => typeof id === "string" && validIds.has(id) && !placed.has(id) && (placed.add(id), true)),
    }));

  if (columns.length === 0) return fallback;
  columns[0].cardIds.push(...cards.filter((card) => !placed.has(card.id)).map((card) => card.id));
  return { version: 1, columns, cards };
}

function makeProject(input: CreateProjectInput): KanbanProject {
  const now = Date.now();
  return {
    id: makeId(),
    name: input.name.trim() || "Untitled project",
    client: input.client?.trim() || "",
    createdAt: now,
    updatedAt: now,
    board: createEmptyBoard(),
  };
}

function createInitialWorkspace(board?: KanbanBoard): KanbanWorkspace {
  const project = makeProject({ name: "Client projects" });
  project.board = normalizeBoard(board);
  return { version: 2, activeProjectId: project.id, projects: [project] };
}

function normalizeWorkspace(value: KanbanWorkspace | undefined, legacyBoard?: KanbanBoard): KanbanWorkspace {
  if (!value || value.version !== 2 || !Array.isArray(value.projects)) {
    return createInitialWorkspace(legacyBoard);
  }

  const projects = value.projects
    .filter((project): project is KanbanProject => typeof project?.id === "string" && typeof project.name === "string")
    .map((project) => ({
      ...project,
      name: project.name.trim() || "Untitled project",
      client: project.client?.trim() || "",
      createdAt: Number.isFinite(project.createdAt) ? project.createdAt : Date.now(),
      updatedAt: Number.isFinite(project.updatedAt) ? project.updatedAt : Date.now(),
      board: normalizeBoard(project.board),
    }));

  if (projects.length === 0) return createInitialWorkspace(legacyBoard);
  const activeProjectId = projects.some((project) => project.id === value.activeProjectId)
    ? value.activeProjectId
    : projects[0].id;
  return { version: 2, activeProjectId, projects };
}

function readLocalWorkspace(storageKey: string) {
  try {
    const saved = window.localStorage.getItem(storageKey);
    return saved ? normalizeWorkspace(JSON.parse(saved) as KanbanWorkspace) : undefined;
  } catch {
    return undefined;
  }
}

function writeLocalWorkspace(storageKey: string, workspace: KanbanWorkspace) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(workspace));
  } catch {
    // The active workspace remains usable if browser storage is unavailable.
  }
}

export function KanbanWorkspaceProvider({ children }: { children: ReactNode }) {
  const { notesFolder } = useNotesData();
  const [workspace, setWorkspace] = useState<KanbanWorkspace>(createInitialWorkspace);
  const [isLoading, setIsLoading] = useState(true);
  const workspaceRef = useRef(workspace);
  const persistQueue = useRef(Promise.resolve());
  const storageKey = useMemo(() => `spell:kanban-workspace:${notesFolder ?? "default"}`, [notesFolder]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    notesService.getSettings()
      .then((settings) => {
        if (!cancelled) {
          const nextWorkspace = normalizeWorkspace(
            settings.kanbanWorkspace,
            settings.kanbanBoard ?? undefined,
          );
          workspaceRef.current = nextWorkspace;
          setWorkspace(nextWorkspace);
        }
      })
      .catch((error) => {
        console.warn("Using local project workspace storage:", error);
        if (!cancelled) {
          const nextWorkspace = readLocalWorkspace(storageKey) ?? createInitialWorkspace();
          workspaceRef.current = nextWorkspace;
          setWorkspace(nextWorkspace);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const persist = useCallback((nextWorkspace: KanbanWorkspace) => {
    workspaceRef.current = nextWorkspace;
    setWorkspace(nextWorkspace);
    persistQueue.current = persistQueue.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const settings = await notesService.getSettings();
          await notesService.updateSettings({
            ...settings,
            kanbanBoard: undefined,
            kanbanWorkspace: nextWorkspace,
          });
          window.localStorage.removeItem(storageKey);
        } catch (error) {
          console.warn("Using local project workspace storage:", error);
          writeLocalWorkspace(storageKey, nextWorkspace);
        }
      })
      .catch(() => writeLocalWorkspace(storageKey, nextWorkspace));
  }, [storageKey]);

  const createProject = useCallback((input: CreateProjectInput) => {
    const currentWorkspace = workspaceRef.current;
    const project = makeProject(input);
    persist({ version: 2, activeProjectId: project.id, projects: [...currentWorkspace.projects, project] });
    return project;
  }, [persist]);

  const selectProject = useCallback((projectId: string) => {
    const currentWorkspace = workspaceRef.current;
    if (!currentWorkspace.projects.some((project) => project.id === projectId) || currentWorkspace.activeProjectId === projectId) return;
    persist({ ...currentWorkspace, activeProjectId: projectId });
  }, [persist]);

  const updateProject = useCallback((project: KanbanProject) => {
    const currentWorkspace = workspaceRef.current;
    persist({
      ...currentWorkspace,
      projects: currentWorkspace.projects.map((current) => current.id === project.id ? { ...project, updatedAt: Date.now() } : current),
    });
  }, [persist]);

  const deleteProject = useCallback((projectId: string) => {
    const currentWorkspace = workspaceRef.current;
    const projects = currentWorkspace.projects.filter((project) => project.id !== projectId);
    if (projects.length === 0) {
      persist(createInitialWorkspace());
      return;
    }
    persist({
      version: 2,
      activeProjectId: currentWorkspace.activeProjectId === projectId ? projects[0].id : currentWorkspace.activeProjectId,
      projects,
    });
  }, [persist]);

  const activeProject = workspace.projects.find((project) => project.id === workspace.activeProjectId) ?? null;
  const value = useMemo(() => ({ workspace, activeProject, isLoading, createProject, selectProject, updateProject, deleteProject }), [workspace, activeProject, isLoading, createProject, selectProject, updateProject, deleteProject]);

  return <KanbanWorkspaceContext.Provider value={value}>{children}</KanbanWorkspaceContext.Provider>;
}

export function useKanbanWorkspace() {
  const context = useContext(KanbanWorkspaceContext);
  if (!context) throw new Error("useKanbanWorkspace must be used inside KanbanWorkspaceProvider");
  return context;
}
