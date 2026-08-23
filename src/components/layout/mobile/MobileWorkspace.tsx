import { useEffect, useMemo, useState } from "react";
import { useKanbanWorkspace } from "../../../context/KanbanWorkspaceContext";
import { useFinance } from "../../../context/FinanceContext";
import { KanbanPage } from "../../kanban/KanbanPage";
import { ProjectsHub } from "../../kanban/ProjectsHub";
import { FinancePage } from "../../finance/FinancePage";
import { ProjectGlyph } from "../../kanban/ProjectGlyph";
import { overviewSubtitle, PROJECT_TEMPLATES, projectListSubtitle, type ProjectTemplateId } from "../../../lib/kanban";
import { moneyListItems, monthTitle } from "../../../lib/finance";
import { AddMonthButton } from "../../finance/MoneyList";
import type { NotesScope } from "../../../lib/notesScope";
import {
  CalendarIcon,
  CheckIcon,
  FinanceIcon,
  KanbanIcon,
  PlusIcon,
  SubscriptionIcon,
} from "../../icons/velocity";
import {
  MobileBottomBar,
  MobileNavBar,
  MobileScreen,
  MobileScroll,
} from "./MobileChrome";

type WorkspaceView = "hub" | "create" | "overview" | "project" | "moneyList" | "money";

interface MobileWorkspaceProps {
  onBackToDaily: () => void;
}

export function MobileWorkspace({ onBackToDaily }: MobileWorkspaceProps) {
  const { workspace, selectProject, activeProject, createProject } = useKanbanWorkspace();
  const { addMonth } = useFinance();
  const [view, setView] = useState<WorkspaceView>("hub");
  const [moneyScope, setMoneyScope] = useState<NotesScope>({ type: "money" });
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  useEffect(() => {
    const onCreate = () => setView("create");
    window.addEventListener("create-new-project", onCreate);
    return () => window.removeEventListener("create-new-project", onCreate);
  }, []);

  const title =
    view === "project"
      ? activeProject?.name || "Project"
      : view === "money"
        ? moneyPageTitle(moneyScope)
        : view === "moneyList"
          ? "Money"
          : view === "create"
            ? "New Project"
            : view === "overview"
              ? "Overview"
              : "Workspace";

  const backLabel =
    view === "hub" ? "Daily" : view === "money" ? "Money" : "Workspace";

  const onBack =
    view === "hub"
      ? onBackToDaily
      : view === "money"
        ? () => setView("moneyList")
        : () => setView("hub");

  return (
    <MobileScreen className="mobile-workspace">
      <MobileNavBar
        backLabel={backLabel}
        onBack={onBack}
        title={title}
        trailing={
          view === "money" ? (
            <button
              type="button"
              className="mobile-nav-action"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent(
                    moneyScope.type === "subscriptions"
                      ? "create-money-subscription"
                      : "create-money-record",
                  ),
                );
              }}
            >
              Add
            </button>
          ) : undefined
        }
      />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="mobile-pager-edge mobile-pager-edge-start" aria-hidden />
        <div className="flex h-full min-h-0 flex-col">
          {view === "hub" ? (
          <MobileScroll>
            <section className="mobile-group">
              <h2 className="mobile-group-title">Projects</h2>
              <div className="mobile-group-card">
                <button
                  type="button"
                  className="mobile-folder-row"
                  onClick={() => setView("overview")}
                >
                  <span className="mobile-folder-icon">
                    <KanbanIcon />
                  </span>
                  <span className="mobile-folder-copy">
                    <span className="mobile-folder-label">Overview</span>
                    <span className="mobile-folder-sub">{overviewSubtitle(workspace)}</span>
                  </span>
                </button>
                {workspace.projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className="mobile-folder-row"
                    onClick={() => {
                      selectProject(project.id);
                      setOpenCardId(null);
                      setView("project");
                    }}
                  >
                    <span className="mobile-folder-icon">
                      <ProjectGlyph id={project.icon} />
                    </span>
                    <span className="mobile-folder-copy">
                      <span className="mobile-folder-label">{project.name}</span>
                      <span className="mobile-folder-sub">{projectListSubtitle(project)}</span>
                    </span>
                  </button>
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
            <section className="mobile-group">
              <h2 className="mobile-group-title">Money</h2>
              <div className="mobile-group-card">
                <button
                  type="button"
                  className="mobile-folder-row"
                  onClick={() => setView("moneyList")}
                >
                  <span className="mobile-folder-icon">
                    <FinanceIcon />
                  </span>
                  <span className="mobile-folder-label">Money</span>
                </button>
              </div>
            </section>
          </MobileScroll>
        ) : view === "create" ? (
          <CreateProjectPage
            onCreate={(name, template) => {
              const project = createProject({
                name: name.trim() || "Untitled",
                template,
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
              setOpenCardId(cardId);
              setView("project");
            }}
          />
        ) : view === "moneyList" ? (
          <MoneyIndex
            onSelect={(scope) => {
              setMoneyScope(scope);
              setView("money");
            }}
            onAddMonth={(month) => {
              addMonth(month);
              setMoneyScope({ type: "moneyMonth", month });
              setView("money");
            }}
          />
        ) : view === "project" ? (
          <KanbanPage sidebarVisible={false} hideTitleBar openCardId={openCardId} />
        ) : (
          <FinancePage scope={moneyScope} sidebarVisible={false} hideTitleBar />
        )}
        </div>
      </div>
    </MobileScreen>
  );
}

function moneyPageTitle(scope: NotesScope) {
  if (scope.type === "subscriptions") return "Subscriptions";
  if (scope.type === "moneyMonth") return monthTitle(scope.month);
  return "Overview";
}

function MoneyIndex({
  onSelect,
  onAddMonth,
}: {
  onSelect: (scope: NotesScope) => void;
  onAddMonth: (month: string) => void;
}) {
  const { workspace } = useFinance();
  const items = useMemo(() => moneyListItems(workspace), [workspace]);

  return (
    <MobileScroll>
      <section className="mobile-group">
        <div className="mobile-group-card">
          {items.map((item) => {
            const Icon =
              item.kind === "overview"
                ? FinanceIcon
                : item.kind === "subscriptions"
                  ? SubscriptionIcon
                  : CalendarIcon;
            return (
              <button
                key={item.id}
                type="button"
                className="mobile-folder-row"
                onClick={() => {
                  if (item.kind === "overview") onSelect({ type: "money" });
                  else if (item.kind === "subscriptions") onSelect({ type: "subscriptions" });
                  else onSelect({ type: "moneyMonth", month: item.month });
                }}
              >
                <span className="mobile-folder-icon">
                  <Icon />
                </span>
                <span className="mobile-folder-copy">
                  <span className="mobile-folder-label">{item.title}</span>
                  <span className="mobile-folder-sub">{item.subtitle}</span>
                </span>
              </button>
            );
          })}
          <AddMonthButton variant="row" onAdd={onAddMonth} />
        </div>
      </section>
    </MobileScroll>
  );
}

function CreateProjectPage({
  onCreate,
}: {
  onCreate: (name: string, template: ProjectTemplateId) => void;
}) {
  const [name, setName] = useState("");
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
          onClick={() => onCreate(name, template)}
        >
          Create
        </button>
      </MobileBottomBar>
    </>
  );
}
