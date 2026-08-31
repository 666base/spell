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
import { createEmptyBoard, createBoardFromTemplate, iconForTemplate, isProjectIcon, isProjectView, normalizeBoard } from "../lib/kanban";
import type { ProjectTemplateId } from "../lib/kanban";
import type {
  KanbanBoard,
  KanbanProject,
  KanbanWorkspace,
  ProjectIconId,
} from "../types/note";

interface CreateProjectInput {
  name: string;
  client?: string;
  template?: ProjectTemplateId;
  icon?: ProjectIconId;
  board?: KanbanBoard;
}

interface KanbanWorkspaceContextValue {
  workspace: KanbanWorkspace;
  activeProject: KanbanProject | null;
  isLoading: boolean;
  createProject: (input: CreateProjectInput) => KanbanProject;
  selectProject: (projectId: string) => void;
  reorderProjects: (activeProjectId: string, overProjectId: string) => void;
  updateProject: (project: KanbanProject) => void;
  deleteProject: (projectId: string) => void;
}

const KanbanWorkspaceContext = createContext<KanbanWorkspaceContextValue | null>(null);

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeProject(input: CreateProjectInput): KanbanProject {
  const now = Date.now();
  const board = input.board
    ? normalizeBoard(input.board)
    : input.template
      ? createBoardFromTemplate(input.template)
      : createEmptyBoard();
  return {
    id: makeId(),
    name: input.name.trim() || "Untitled project",
    client: input.client?.trim() || "",
    icon: input.icon ?? iconForTemplate(input.template ?? "blank"),
    view: "list",
    createdAt: now,
    updatedAt: now,
    board,
  };
}

function emptyWorkspace(): KanbanWorkspace {
  return { version: 2, activeProjectId: "", projects: [] };
}

function createInitialWorkspace(board?: KanbanBoard): KanbanWorkspace {
  if (!board || (board.columns.length === 0 && board.cards.length === 0)) {
    return emptyWorkspace();
  }
  const project = makeProject({ name: "Projects", template: "week" });
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
      icon: isProjectIcon(project.icon) ? project.icon : "briefcase",
      view: isProjectView(project.view) ? project.view : "list",
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
  const persistQueue = useRef<Promise<void> | null>(null);
  const storageKey = useMemo(() => `spell:kanban-workspace:${notesFolder ?? "default"}`, [notesFolder]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    notesService.getKanbanData()
      .then((data) => {
        if (!cancelled) {
          const nextWorkspace = normalizeWorkspace(
            data,
            data?.legacyBoard ?? undefined,
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
    persistQueue.current = (persistQueue.current ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        try {
          await notesService.updateKanbanData(nextWorkspace);
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
    persist({ version: 2, activeProjectId: project.id, projects: [project, ...currentWorkspace.projects] });
    return project;
  }, [persist]);

  const selectProject = useCallback((projectId: string) => {
    const currentWorkspace = workspaceRef.current;
    if (!currentWorkspace.projects.some((project) => project.id === projectId) || currentWorkspace.activeProjectId === projectId) return;
    persist({ ...currentWorkspace, activeProjectId: projectId });
  }, [persist]);

  const reorderProjects = useCallback((activeProjectId: string, overProjectId: string) => {
    if (activeProjectId === overProjectId) return;

    const currentWorkspace = workspaceRef.current;
    const fromIndex = currentWorkspace.projects.findIndex((project) => project.id === activeProjectId);
    const toIndex = currentWorkspace.projects.findIndex((project) => project.id === overProjectId);
    if (fromIndex < 0 || toIndex < 0) return;

    const projects = [...currentWorkspace.projects];
    const [project] = projects.splice(fromIndex, 1);
    projects.splice(toIndex, 0, project);
    persist({ ...currentWorkspace, projects });
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
      persist(emptyWorkspace());
      return;
    }
    persist({
      version: 2,
      activeProjectId: currentWorkspace.activeProjectId === projectId ? projects[0].id : currentWorkspace.activeProjectId,
      projects,
    });
  }, [persist]);

  const activeProject = workspace.projects.find((project) => project.id === workspace.activeProjectId) ?? null;
  const value = useMemo(() => ({ workspace, activeProject, isLoading, createProject, selectProject, reorderProjects, updateProject, deleteProject }), [workspace, activeProject, isLoading, createProject, selectProject, reorderProjects, updateProject, deleteProject]);

  return <KanbanWorkspaceContext.Provider value={value}>{children}</KanbanWorkspaceContext.Provider>;
}

export function useKanbanWorkspace() {
  const context = useContext(KanbanWorkspaceContext);
  if (!context) throw new Error("useKanbanWorkspace must be used inside KanbanWorkspaceProvider");
  return context;
}
