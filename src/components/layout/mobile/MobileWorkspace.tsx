import { memo, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useKanbanWorkspace } from "../../../context/KanbanWorkspaceContext";
import { KanbanPage } from "../../kanban/KanbanPage";
import { ProjectsHub } from "../../kanban/ProjectsHub";
import { FinancePage } from "../../finance/FinancePage";
import { ProjectGlyph } from "../../kanban/ProjectGlyph";
import { ClientField } from "../../kanban/ClientField";
import { overviewOpenCount, knownClientNames, PROJECT_TEMPLATES, projectListSubtitle, type ProjectTemplateId } from "../../../lib/kanban";
import { EASE_DRAWER, EASE_OUT, MOTION_FAST_S, MOTION_PANEL_S } from "../../../lib/motion";
import { isMoneyTab, type NotesScope } from "../../../lib/notesScope";
import type { ProjectIconId } from "../../../types/note";
import {
  CheckIcon,
  PlusIcon,
  TrashIcon,
} from "../../icons/velocity";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  OverviewGlyph,
  ProjectsGlyph,
  MoneyGlyph,
  InlineNameInput,
} from "../../ui";
import {
  MobileActionSheet,
  MobileBottomBar,
  MobileNavBar,
  MobileScreen,
  MobileScroll,
  MobileSidebarToggle,
} from "./MobileChrome";
import { useLongPress } from "./useLongPress";

type WorkspaceView = "hub" | "create" | "overview" | "project";
type HubPane = "projects" | "money";

interface MobileWorkspaceProps {
  onBackToDaily: () => void;
  onOpenFolders: () => void;
}

export const MobileWorkspace = memo(function MobileWorkspace({ onBackToDaily, onOpenFolders }: MobileWorkspaceProps) {
  const { workspace, selectProject, activeProject, createProject, updateProject, deleteProject } = useKanbanWorkspace();
  const [view, setView] = useState<WorkspaceView>("hub");
  const [hubPane, setHubPane] = useState<HubPane>("projects");
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [projectSheetId, setProjectSheetId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [clientingId, setClientingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const drillIn = view !== "hub";
  const direction = drillIn ? 1 : -1;
  const openCount = overviewOpenCount(workspace);
  const projectSheet = workspace.projects.find((project) => project.id === projectSheetId) ?? null;
  const deleting = workspace.projects.find((project) => project.id === deleteId) ?? null;

  useEffect(() => {
    const onCreate = () => {
      setHubPane("projects");
      setView("create");
    };
    const onBack = (event: Event) => {
      if (view === "hub") return;
      event.preventDefault();
      setView("hub");
    };
    const onWorkspace = (event: Event) => {
      const scope = (event as CustomEvent<NotesScope>).detail;
      if (!scope) return;
      if (isMoneyTab(scope)) {
        setHubPane("money");
        setView("hub");
        return;
      }
      setHubPane("projects");
      if (scope.type === "project") {
        selectProject(scope.id);
        setOpenCardId(null);
        setView("project");
        return;
      }
      setView("hub");
    };
    window.addEventListener("create-new-project", onCreate);
    window.addEventListener("spell-mobile-back", onBack);
    window.addEventListener("spell-mobile-workspace", onWorkspace);
    return () => {
      window.removeEventListener("create-new-project", onCreate);
      window.removeEventListener("spell-mobile-back", onBack);
      window.removeEventListener("spell-mobile-workspace", onWorkspace);
    };
  }, [selectProject, view]);

  const title =
    view === "project"
      ? activeProject?.name || "Project"
      : view === "create"
        ? "New Project"
        : view === "overview"
          ? "Overview"
          : undefined;

  const paneSwitch = (
    <div className="mobile-workspace-switch" role="tablist" aria-label="Workspace" data-pager-ignore>
      <button
        type="button"
        role="tab"
        title="Projects"
        aria-label="Projects"
        aria-selected={hubPane === "projects"}
        onClick={() => {
          setHubPane("projects");
          if (view !== "hub") setView("hub");
        }}
      >
        <ProjectsGlyph />
      </button>
      <button
        type="button"
        role="tab"
        title="Money"
        aria-label="Money"
        aria-selected={hubPane === "money"}
        onClick={() => {
          setHubPane("money");
          if (view !== "hub") setView("hub");
        }}
      >
        <MoneyGlyph />
      </button>
    </div>
  );

  const backLabel = view === "hub" ? undefined : "Projects";

  const onBack =
    view === "hub"
      ? undefined
      : () => setView("hub");

  return (
    <MobileScreen className="mobile-workspace">
      <MobileNavBar
        leading={
          view === "hub" ? (
            <MobileSidebarToggle side="left" onClick={onOpenFolders} />
          ) : undefined
        }
        backLabel={backLabel}
        onBack={onBack}
        title={view === "hub" ? paneSwitch : title}
        trailing={
          <MobileSidebarToggle side="right" pressed={view === "hub"} onClick={onBackToDaily} />
        }
      />
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="mobile-workspace-stage">
          <AnimatePresence initial={false} custom={direction}>
            <motion.div
              key={view}
              className="mobile-workspace-view"
              custom={direction}
              style={{ zIndex: view === "hub" ? 0 : 1 }}
              variants={{
                enter: (dir: number) =>
                  reduceMotion
                    ? { opacity: 0 }
                    : { transform: dir > 0 ? "translate3d(100%, 0, 0)" : "translate3d(-30%, 0, 0)" },
                shown: reduceMotion
                  ? { opacity: 1 }
                  : { transform: "translate3d(0, 0, 0)" },
                leave: (dir: number) =>
                  reduceMotion
                    ? { opacity: 0 }
                    : { transform: dir > 0 ? "translate3d(-30%, 0, 0)" : "translate3d(100%, 0, 0)" },
              }}
              initial="enter"
              animate="shown"
              exit="leave"
              transition={
                reduceMotion
                  ? { duration: MOTION_FAST_S, ease: EASE_OUT }
                  : { duration: MOTION_PANEL_S, ease: EASE_DRAWER }
              }
            >
          {view === "hub" ? (
            hubPane === "projects" ? (
          <MobileScroll>
            <section className="mobile-group">
              <div className="mobile-group-card">
                <button
                  type="button"
                  className="mobile-folder-row"
                  onClick={() => setView("overview")}
                >
                  <span className="mobile-folder-icon">
                    <OverviewGlyph />
                  </span>
                  <span className="mobile-folder-label">Overview</span>
                  {openCount > 0 && <span className="mobile-folder-count">{openCount}</span>}
                </button>
                {workspace.projects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    name={project.name}
                    subtitle={projectListSubtitle(project)}
                    icon={project.icon}
                    client={project.client ?? ""}
                    clients={knownClientNames(workspace)}
                    renaming={renamingId === project.id}
                    clienting={clientingId === project.id}
                    onOpen={() => {
                      selectProject(project.id);
                      setOpenCardId(null);
                      setView("project");
                    }}
                    onOpenSheet={() => setProjectSheetId(project.id)}
                    onRename={(name) => {
                      updateProject({ ...project, name });
                      setRenamingId(null);
                    }}
                    onRenameCancel={() => setRenamingId(null)}
                    onClient={(client) => {
                      updateProject({ ...project, client });
                      setClientingId(null);
                    }}
                    onClientCancel={() => setClientingId(null)}
                  />
                ))}
                <button
                  type="button"
                  className="mobile-folder-row"
                  onClick={() => setView("create")}
                >
                  <span className="mobile-folder-icon">
                    <PlusIcon />
                  </span>
                  <span className="mobile-folder-label">New Project</span>
                </button>
              </div>
            </section>
          </MobileScroll>
            ) : (
              <FinancePage scope={{ type: "money" }} sidebarVisible={false} hideTitleBar />
            )
        ) : view === "create" ? (
          <CreateProjectPage
            clients={knownClientNames(workspace)}
            onCreate={(name, template, client) => {
              const project = createProject({
                name: name.trim() || "Untitled",
                template,
                client,
              });
              selectProject(project.id);
              setOpenCardId(null);
              setView("project");
            }}
          />
        ) : view === "overview" ? (
          <ProjectsHub
            sidebarVisible={false}
            hideTitleBar
            onOpenProject={(id, cardId) => {
              selectProject(id);
              setOpenCardId(cardId ?? null);
              setView("project");
            }}
          />
        ) : (
          <KanbanPage sidebarVisible={false} hideTitleBar openCardId={openCardId} />
        )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      {projectSheet && (
        <MobileActionSheet title={projectSheet.name} onClose={() => setProjectSheetId(null)}>
          <button
            type="button"
            className="mobile-action-item"
            onClick={() => {
              setRenamingId(projectSheet.id);
              setProjectSheetId(null);
            }}
          >
            Rename
          </button>
          <button
            type="button"
            className="mobile-action-item"
            onClick={() => {
              setClientingId(projectSheet.id);
              setProjectSheetId(null);
            }}
          >
            Client
          </button>
          <button
            type="button"
            className="mobile-action-item is-danger"
            onClick={() => {
              setDeleteId(projectSheet.id);
              setProjectSheetId(null);
            }}
          >
            <span>Delete</span>
            <TrashIcon aria-hidden="true" />
          </button>
        </MobileActionSheet>
      )}
      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This project and its tasks will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteId) return;
                deleteProject(deleteId);
                setDeleteId(null);
                if (view === "project" && activeProject?.id === deleteId) setView("hub");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobileScreen>
  );
});

function ProjectRow({
  name,
  subtitle,
  icon,
  client,
  clients,
  renaming,
  clienting,
  onOpen,
  onOpenSheet,
  onRename,
  onRenameCancel,
  onClient,
  onClientCancel,
}: {
  name: string;
  subtitle: string;
  icon?: ProjectIconId;
  client: string;
  clients: string[];
  renaming: boolean;
  clienting: boolean;
  onOpen: () => void;
  onOpenSheet: () => void;
  onRename: (name: string) => void;
  onRenameCancel: () => void;
  onClient: (client: string) => void;
  onClientCancel: () => void;
}) {
  const press = useLongPress(onOpenSheet, onOpen);
  const [clientDraft, setClientDraft] = useState(client);

  useEffect(() => {
    if (clienting) setClientDraft(client);
  }, [client, clienting]);

  if (renaming) {
    return (
      <div className="mobile-folder-row">
        <span className="mobile-folder-icon">
          <ProjectGlyph id={icon} />
        </span>
        <InlineNameInput
          label="Project name"
          placeholder="Project name"
          initialValue={name === "Untitled" ? "" : name}
          onConfirm={onRename}
          onCancel={onRenameCancel}
          className="min-w-0 flex-1"
        />
      </div>
    );
  }

  if (clienting) {
    return (
      <div className="mobile-folder-row">
        <span className="mobile-folder-icon">
          <ProjectGlyph id={icon} />
        </span>
        <ClientField
          value={clientDraft}
          suggestions={clients}
          onChange={setClientDraft}
          onCommit={(value) => onClient(value.trim())}
          onCancel={onClientCancel}
          autoFocus
          className="mobile-field h-auto min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none"
        />
      </div>
    );
  }

  return (
    <button type="button" className="mobile-folder-row" {...press}>
      <span className="mobile-folder-icon">
        <ProjectGlyph id={icon} />
      </span>
      <span className="mobile-folder-copy">
        <span className="mobile-folder-label">{name}</span>
        <span className="mobile-folder-sub">{subtitle}</span>
      </span>
    </button>
  );
}

function CreateProjectPage({
  clients,
  onCreate,
}: {
  clients: string[];
  onCreate: (name: string, template: ProjectTemplateId, client: string) => void;
}) {
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [template, setTemplate] = useState<ProjectTemplateId>("blank");

  return (
    <>
      <MobileScroll>
        <section className="mobile-group">
          <h2 className="mobile-group-title">Name</h2>
          <div className="mobile-group-card">
            <input
              className="mobile-field"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Untitled"
              autoCapitalize="sentences"
              autoComplete="off"
              autoCorrect="on"
            />
          </div>
        </section>
        <section className="mobile-group">
          <h2 className="mobile-group-title">Client</h2>
          <div className="mobile-group-card">
            <ClientField
              value={client}
              suggestions={clients}
              onChange={setClient}
              className="mobile-field h-auto border-0 bg-transparent px-3.5 shadow-none"
              placeholder="Optional"
            />
          </div>
        </section>
        <section className="mobile-group">
          <h2 className="mobile-group-title">Template</h2>
          <div className="mobile-group-card">
            {PROJECT_TEMPLATES.map((item) => (
              <button
                key={item.id}
                type="button"
                className="mobile-folder-row"
                onClick={() => setTemplate(item.id)}
              >
                <span className="mobile-folder-copy">
                  <span className="mobile-folder-label">{item.name}</span>
                  <span className="mobile-folder-sub">{item.description}</span>
                </span>
                {template === item.id && <CheckIcon className="mobile-folder-check" />}
              </button>
            ))}
          </div>
        </section>
      </MobileScroll>
      <MobileBottomBar>
        <div className="flex-1" />
        <button
          type="button"
          className="mobile-nav-action"
          onClick={() => onCreate(name, template, client.trim())}
        >
          Create
        </button>
      </MobileBottomBar>
    </>
  );
}
