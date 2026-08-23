import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import * as ContextMenu from "@radix-ui/react-context-menu";
import type {
  FinanceSubscription,
  FinanceTransaction,
  SubscriptionCadence,
} from "../../types/note";
import {
  createFinanceSubscription,
  createFinanceTransaction,
  useFinance,
} from "../../context/FinanceContext";
import {
  cadenceLabel,
  currentMonthKey,
  dueLabel,
  dueSubscriptions,
  formatMoney,
  formatSignedMoney,
  isoDate,
  monthNet,
  monthTitle,
  parseCaptureLine,
  parseMoney,
  postedInMonth,
  recentTransactions,
} from "../../lib/finance";
import { useKanbanWorkspace } from "../../context/KanbanWorkspaceContext";
import { cn } from "../../lib/utils";
import type { NotesScope } from "../../lib/notesScope";
import { NoteTitlebar } from "../layout/NoteTitlebar";
import { isMobileApp } from "../../lib/platform";
import {
  Input,
  Select,
} from "../ui";
import { CheckmarkIcon } from "../ui/StateIcon";

const menuItemClass = "spell-menu-item cursor-pointer";

interface FinancePageProps {
  scope: NotesScope;
  sidebarVisible?: boolean;
  focusMode?: boolean;
  onToggleSidebar?: () => void;
  onNewNote?: () => void;
  showWindowControls?: boolean;
  hideTitleBar?: boolean;
}

export function FinancePage({
  scope,
  sidebarVisible = true,
  focusMode = false,
  onToggleSidebar,
  onNewNote,
  showWindowControls = false,
  hideTitleBar = false,
}: FinancePageProps) {
  const {
    workspace,
    isLoading,
    saveSubscription,
    saveTransaction,
    duplicateSubscription,
    duplicateTransaction,
    archiveSubscription,
    deleteSubscription,
    deleteTransaction,
    confirmSubscription,
  } = useFinance();
  const { workspace: projectWorkspace } = useKanbanWorkspace();
  const [subscriptionEditor, setSubscriptionEditor] = useState<FinanceSubscription | null>(null);
  const [transactionEditor, setTransactionEditor] = useState<FinanceTransaction | null>(null);
  const [focusCapture, setFocusCapture] = useState(false);
  const isOverview = scope.type === "money";
  const isSubscriptions = scope.type === "subscriptions";
  const month = scope.type === "moneyMonth" ? scope.month : currentMonthKey();
  const projects = projectWorkspace.projects;
  const projectName = useCallback((projectId?: string) => {
    if (!projectId) return "";
    return projects.find((project) => project.id === projectId)?.name ?? "";
  }, [projects]);

  const posted = useMemo(() => postedInMonth(workspace, month), [month, workspace]);
  const recent = useMemo(() => recentTransactions(workspace), [workspace]);
  const dues = useMemo(
    () => (isSubscriptions || (!isOverview && month !== currentMonthKey()) ? [] : dueSubscriptions(workspace, currentMonthKey())),
    [isOverview, isSubscriptions, month, workspace],
  );
  const subscriptions = useMemo(
    () => workspace.subscriptions.filter((subscription) => !subscription.archived)
      .sort((left, right) => left.nextBillingDate.localeCompare(right.nextBillingDate)),
    [workspace.subscriptions],
  );
  const net = monthNet(workspace, month);
  const monthEmpty = !isSubscriptions && !isOverview && posted.length === 0 && dues.length === 0;
  const overviewEmpty = isOverview && recent.length === 0 && dues.length === 0;

  const pageTitle = isSubscriptions ? "Subscriptions" : isOverview ? "Money" : monthTitle(month);

  const openSubscriptionEditor = useCallback((subscription: FinanceSubscription) => {
    setTransactionEditor(null);
    setSubscriptionEditor(subscription);
  }, []);
  const openTransactionEditor = useCallback((transaction: FinanceTransaction) => {
    setSubscriptionEditor(null);
    setTransactionEditor(transaction);
  }, []);

  const addFromCapture = useCallback((value: string) => {
    const parsed = parseCaptureLine(value);
    if (!parsed.title) return;
    if (isSubscriptions) {
      const draft = { ...createFinanceSubscription(), name: parsed.title, amountCents: parsed.amountCents ?? 0 };
      if (parsed.amountCents && parsed.amountCents > 0) saveSubscription(draft);
      else openSubscriptionEditor(draft);
      return;
    }
    const draft = {
      ...createFinanceTransaction("expense"),
      title: parsed.title,
      amountCents: parsed.amountCents ?? 0,
      date: month === currentMonthKey() ? isoDate() : `${month}-01`,
    };
    if (parsed.amountCents && parsed.amountCents > 0) saveTransaction(draft);
    else openTransactionEditor(draft);
  }, [isSubscriptions, month, openSubscriptionEditor, openTransactionEditor, saveSubscription, saveTransaction]);

  useEffect(() => {
    const onRecord = () => {
      if (isSubscriptions) return;
      openTransactionEditor({
        ...createFinanceTransaction("expense"),
        date: month === currentMonthKey() ? isoDate() : `${month}-01`,
      });
    };
    const onSubscription = () => {
      openSubscriptionEditor(createFinanceSubscription());
    };
    window.addEventListener("create-money-record", onRecord);
    window.addEventListener("create-money-subscription", onSubscription);
    return () => {
      window.removeEventListener("create-money-record", onRecord);
      window.removeEventListener("create-money-subscription", onSubscription);
    };
  }, [isSubscriptions, month, openSubscriptionEditor, openTransactionEditor]);

  const titlebar = (
    <NoteTitlebar
      sidebarVisible={sidebarVisible}
      focusMode={focusMode}
      onToggleSidebar={onToggleSidebar}
      onNewNote={onNewNote}
      showWindowControls={showWindowControls}
      showTools={false}
      center={
        <span className="titlebar-title">
          {pageTitle}
        </span>
      }
    />
  );

  if (isLoading) {
    return (
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-bg">
        {!hideTitleBar && titlebar}
        <div className="flex-1 bg-bg" />
      </div>
    );
  }

  return (
      <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg">
      {!hideTitleBar && titlebar}
      <div className="relative min-h-0 flex-1">
        {hideTitleBar ? (
          <div className="mobile-money">
            {isSubscriptions ? (
              <section className="mobile-group">
                <div className="mobile-group-card">
                  {subscriptions.length === 0 ? (
                    <button
                      type="button"
                      className="mobile-folder-row"
                      onClick={() => openSubscriptionEditor(createFinanceSubscription())}
                    >
                      <span className="mobile-folder-label">Add a subscription</span>
                    </button>
                  ) : (
                    subscriptions.map((subscription) => (
                      <SubscriptionRow
                        key={subscription.id}
                        subscription={subscription}
                        currency={workspace.currency}
                        onOpen={() => openSubscriptionEditor(subscription)}
                        onDuplicate={() => duplicateSubscription(subscription.id)}
                        onArchive={() => archiveSubscription(subscription.id, true)}
                        onDelete={() => deleteSubscription(subscription.id)}
                      />
                    ))
                  )}
                </div>
              </section>
            ) : isOverview ? (
              <>
                {overviewEmpty && (
                  <section className="mobile-group">
                    <div className="mobile-group-card">
                      <button
                        type="button"
                        className="mobile-folder-row"
                        onClick={() => openTransactionEditor(createFinanceTransaction("income"))}
                      >
                        <span className="mobile-folder-label">Income</span>
                      </button>
                      <button
                        type="button"
                        className="mobile-folder-row"
                        onClick={() => openTransactionEditor(createFinanceTransaction("expense"))}
                      >
                        <span className="mobile-folder-label">Expense</span>
                      </button>
                      <button
                        type="button"
                        className="mobile-folder-row"
                        onClick={() => openSubscriptionEditor(createFinanceSubscription())}
                      >
                        <span className="mobile-folder-label">Add a subscription</span>
                      </button>
                    </div>
                  </section>
                )}
                {dues.length > 0 && (
                  <section className="mobile-group">
                    <h2 className="mobile-group-title">Due</h2>
                    <div className="mobile-group-card">
                      {dues.map((subscription) => (
                        <DueRow
                          key={subscription.id}
                          subscription={subscription}
                          currency={workspace.currency}
                          onConfirm={() => confirmSubscription(subscription.id)}
                          onOpen={() => openSubscriptionEditor(subscription)}
                          onDuplicate={() => duplicateSubscription(subscription.id)}
                          onArchive={() => archiveSubscription(subscription.id, true)}
                          onDelete={() => deleteSubscription(subscription.id)}
                        />
                      ))}
                    </div>
                  </section>
                )}
                {recent.length > 0 && (
                  <section className="mobile-group">
                    <h2 className="mobile-group-title">Recent</h2>
                    <div className="mobile-group-card">
                      {recent.map((transaction) => (
                        <PostedRow
                          key={transaction.id}
                          transaction={transaction}
                          currency={workspace.currency}
                          projectName={projectName(transaction.projectId)}
                          onOpen={() => openTransactionEditor(transaction)}
                          onDuplicate={() => duplicateTransaction(transaction.id)}
                          onDelete={() => deleteTransaction(transaction.id)}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </>
            ) : (
              <>
                <p className="mobile-money-net">
                  {posted.length === 0 ? "Empty" : formatSignedMoney(net, workspace.currency)}
                </p>
                {dues.length > 0 && (
                  <section className="mobile-group">
                    <h2 className="mobile-group-title">Due</h2>
                    <div className="mobile-group-card">
                      {dues.map((subscription) => (
                        <DueRow
                          key={subscription.id}
                          subscription={subscription}
                          currency={workspace.currency}
                          onConfirm={() => confirmSubscription(subscription.id)}
                          onOpen={() => openSubscriptionEditor(subscription)}
                          onDuplicate={() => duplicateSubscription(subscription.id)}
                          onArchive={() => archiveSubscription(subscription.id, true)}
                          onDelete={() => deleteSubscription(subscription.id)}
                        />
                      ))}
                    </div>
                  </section>
                )}
                <section className="mobile-group">
                  <h2 className="mobile-group-title">Posted</h2>
                  <div className="mobile-group-card">
                    {posted.length === 0 ? (
                      <>
                        <button
                          type="button"
                          className="mobile-folder-row"
                          onClick={() => openTransactionEditor(createFinanceTransaction("income"))}
                        >
                          <span className="mobile-folder-label">Income</span>
                        </button>
                        <button
                          type="button"
                          className="mobile-folder-row"
                          onClick={() => openTransactionEditor(createFinanceTransaction("expense"))}
                        >
                          <span className="mobile-folder-label">Expense</span>
                        </button>
                      </>
                    ) : (
                      posted.map((transaction) => (
                        <PostedRow
                          key={transaction.id}
                          transaction={transaction}
                          currency={workspace.currency}
                          projectName={projectName(transaction.projectId)}
                          onOpen={() => openTransactionEditor(transaction)}
                          onDuplicate={() => duplicateTransaction(transaction.id)}
                          onDelete={() => deleteTransaction(transaction.id)}
                        />
                      ))
                    )}
                  </div>
                </section>
              </>
            )}
            <div className="mobile-money-capture">
              <CaptureLine
                autoFocus={focusCapture}
                onFocused={() => setFocusCapture(false)}
                onAdd={addFromCapture}
              />
            </div>
          </div>
        ) : (
        <div className="h-full overflow-y-auto">
          <div
            className="prose mx-auto w-full px-6 pt-3 pb-24"
            style={{ maxWidth: "var(--editor-max-width, 48rem)" }}
          >
            {!isSubscriptions && !isOverview && (
              <p className="not-prose mb-4 text-[13px] leading-5 text-text-muted">
                {posted.length === 0 ? "Empty" : formatSignedMoney(net, workspace.currency)}
              </p>
            )}

            {isSubscriptions ? (
              <>
                {subscriptions.length === 0 && (
                  <div className="not-prose mb-4 text-[length:var(--editor-base-font-size)] leading-[var(--editor-line-height)] text-text-muted">
                    <button type="button" className="hover:text-text" onClick={() => openSubscriptionEditor(createFinanceSubscription())}>
                      Add a subscription
                    </button>
                  </div>
                )}
                {subscriptions.map((subscription) => (
                  <SubscriptionRow
                    key={subscription.id}
                    subscription={subscription}
                    currency={workspace.currency}
                    onOpen={() => openSubscriptionEditor(subscription)}
                    onDuplicate={() => duplicateSubscription(subscription.id)}
                    onArchive={() => archiveSubscription(subscription.id, true)}
                    onDelete={() => deleteSubscription(subscription.id)}
                  />
                ))}
              </>
            ) : isOverview ? (
              <>
                {overviewEmpty && (
                  <div className="not-prose mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[length:var(--editor-base-font-size)] leading-[var(--editor-line-height)] text-text-muted">
                    <button type="button" className="hover:text-text" onClick={() => openTransactionEditor(createFinanceTransaction("income"))}>
                      Income
                    </button>
                    <button type="button" className="hover:text-text" onClick={() => openTransactionEditor(createFinanceTransaction("expense"))}>
                      Expense
                    </button>
                    <button type="button" className="hover:text-text" onClick={() => openSubscriptionEditor(createFinanceSubscription())}>
                      Add a subscription
                    </button>
                  </div>
                )}
                {dues.map((subscription) => (
                  <DueRow
                    key={subscription.id}
                    subscription={subscription}
                    currency={workspace.currency}
                    onConfirm={() => confirmSubscription(subscription.id)}
                    onOpen={() => openSubscriptionEditor(subscription)}
                    onDuplicate={() => duplicateSubscription(subscription.id)}
                    onArchive={() => archiveSubscription(subscription.id, true)}
                    onDelete={() => deleteSubscription(subscription.id)}
                  />
                ))}
                {recent.map((transaction) => (
                  <PostedRow
                    key={transaction.id}
                    transaction={transaction}
                    currency={workspace.currency}
                    projectName={projectName(transaction.projectId)}
                    onOpen={() => openTransactionEditor(transaction)}
                    onDuplicate={() => duplicateTransaction(transaction.id)}
                    onDelete={() => deleteTransaction(transaction.id)}
                  />
                ))}
              </>
            ) : (
              <>
                {monthEmpty && (
                  <div className="not-prose mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[length:var(--editor-base-font-size)] leading-[var(--editor-line-height)] text-text-muted">
                    <button type="button" className="hover:text-text" onClick={() => openTransactionEditor(createFinanceTransaction("income"))}>
                      Income
                    </button>
                    <button type="button" className="hover:text-text" onClick={() => openTransactionEditor(createFinanceTransaction("expense"))}>
                      Expense
                    </button>
                    <button type="button" className="hover:text-text" onClick={() => openSubscriptionEditor(createFinanceSubscription())}>
                      Add a subscription
                    </button>
                  </div>
                )}
                {dues.map((subscription) => (
                  <DueRow
                    key={subscription.id}
                    subscription={subscription}
                    currency={workspace.currency}
                    onConfirm={() => confirmSubscription(subscription.id)}
                    onOpen={() => openSubscriptionEditor(subscription)}
                    onDuplicate={() => duplicateSubscription(subscription.id)}
                    onArchive={() => archiveSubscription(subscription.id, true)}
                    onDelete={() => deleteSubscription(subscription.id)}
                  />
                ))}
                {posted.map((transaction) => (
                  <PostedRow
                    key={transaction.id}
                    transaction={transaction}
                    currency={workspace.currency}
                    projectName={projectName(transaction.projectId)}
                    onOpen={() => openTransactionEditor(transaction)}
                    onDuplicate={() => duplicateTransaction(transaction.id)}
                    onDelete={() => deleteTransaction(transaction.id)}
                  />
                ))}
              </>
            )}

            <CaptureLine
              autoFocus={focusCapture}
              onFocused={() => setFocusCapture(false)}
              onAdd={addFromCapture}
            />
          </div>
        </div>
        )}

        {subscriptionEditor && (
          <SubscriptionEditor
            key={subscriptionEditor.id}
            subscription={subscriptionEditor}
            currency={workspace.currency}
            projects={projects}
            onClose={() => setSubscriptionEditor(null)}
            onSave={(subscription) => {
              saveSubscription(subscription);
              setSubscriptionEditor(null);
            }}
            onArchive={(id) => {
              archiveSubscription(id, true);
              setSubscriptionEditor(null);
            }}
            onDelete={(id) => {
              deleteSubscription(id);
              setSubscriptionEditor(null);
            }}
          />
        )}
        {transactionEditor && (
          <TransactionEditor
            key={transactionEditor.id}
            transaction={transactionEditor}
            currency={workspace.currency}
            projects={projects}
            onClose={() => setTransactionEditor(null)}
            onSave={(transaction) => {
              saveTransaction(transaction);
              setTransactionEditor(null);
            }}
            onDelete={(id) => {
              deleteTransaction(id);
              setTransactionEditor(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function CaptureLine({
  onAdd,
  autoFocus = false,
  onFocused,
}: {
  onAdd: (value: string) => void;
  autoFocus?: boolean;
  onFocused?: () => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
    onFocused?.();
  }, [autoFocus, onFocused]);

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const next = value.trim();
        if (!next) return;
        onAdd(next);
        setValue("");
      }}
      placeholder="Add"
      aria-label="Add"
      className="not-prose mt-2 w-full bg-transparent py-1 text-[length:var(--editor-base-font-size)] leading-[var(--editor-line-height)] text-text outline-none placeholder:text-text-muted/45"
    />
  );
}

function DueRow({
  subscription,
  currency,
  onConfirm,
  onOpen,
  onDuplicate,
  onArchive,
  onDelete,
}: {
  subscription: FinanceSubscription;
  currency: string;
  onConfirm: () => void;
  onOpen: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const due = dueLabel(subscription.nextBillingDate);
  return (
    <RowMenu
      items={[
        { label: "Duplicate", onSelect: onDuplicate },
        { label: "Archive", onSelect: onArchive },
        { label: "Delete", onSelect: onDelete, danger: true },
      ]}
    >
      <div className="not-prose flex w-full items-start gap-2 py-1.5 text-left text-[length:var(--editor-base-font-size)] leading-[var(--editor-line-height)]">
        <button
          type="button"
          aria-label={`Confirm ${subscription.name}`}
          onClick={onConfirm}
          className="mt-1 flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-black/25 bg-transparent text-transparent transition-[background-color,border-color,transform] duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:border-black/40 active:scale-90 dark:border-white/30"
        >
          <CheckmarkIcon checked={false} className="size-2.5" />
        </button>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-text">{subscription.name}</span>
          <span className={cn("block text-[12px] leading-4 text-text-muted", due.tone === "overdue" && "text-[var(--color-menu-danger)]")}>
            {due.text} · {formatMoney(subscription.amountCents, currency)}
          </span>
        </button>
      </div>
    </RowMenu>
  );
}

function PostedRow({
  transaction,
  currency,
  projectName,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  transaction: FinanceTransaction;
  currency: string;
  projectName: string;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const date = new Date(`${transaction.date}T12:00:00`);
  const dateLabel = Number.isNaN(date.valueOf())
    ? transaction.date
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const amount = `${transaction.kind === "income" ? "+" : "−"}${formatMoney(transaction.amountCents, currency)}`;

  return (
    <RowMenu
      items={[
        { label: "Duplicate", onSelect: onDuplicate },
        { label: "Delete", onSelect: onDelete, danger: true },
      ]}
    >
      <button
        type="button"
        onClick={onOpen}
        className="not-prose flex w-full items-baseline gap-3 py-1.5 text-left text-[length:var(--editor-base-font-size)] leading-[var(--editor-line-height)]"
      >
        <span className="w-16 shrink-0 text-[13px] text-text-muted">{dateLabel}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-text">{transaction.title}</span>
          {projectName && (
            <span className="block truncate text-[12px] leading-4 text-text-muted">{projectName}</span>
          )}
        </span>
        <span className="shrink-0 tabular-nums text-text">{amount}</span>
      </button>
    </RowMenu>
  );
}

function SubscriptionRow({
  subscription,
  currency,
  onOpen,
  onDuplicate,
  onArchive,
  onDelete,
}: {
  subscription: FinanceSubscription;
  currency: string;
  onOpen: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const due = dueLabel(subscription.nextBillingDate);
  return (
    <RowMenu
      items={[
        { label: "Duplicate", onSelect: onDuplicate },
        { label: "Archive", onSelect: onArchive },
        { label: "Delete", onSelect: onDelete, danger: true },
      ]}
    >
      <button
        type="button"
        onClick={onOpen}
        className="not-prose flex w-full items-baseline gap-3 py-1.5 text-left text-[length:var(--editor-base-font-size)] leading-[var(--editor-line-height)]"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-text">{subscription.name}</span>
          <span className={cn("block text-[12px] leading-4 text-text-muted", due.tone === "overdue" && "text-[var(--color-menu-danger)]")}>
            {cadenceLabel(subscription.cadence)} · {due.text}
          </span>
        </span>
        <span className="shrink-0 tabular-nums text-text">{formatMoney(subscription.amountCents, currency)}</span>
      </button>
    </RowMenu>
  );
}

function RowMenu({
  items,
  children,
}: {
  items: { label: string; onSelect: () => void; danger?: boolean }[];
  children: ReactNode;
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div data-spell-context-menu>{children}</div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content data-spell-context-menu className="spell-menu z-50 min-w-40">
          {items.map((item) => (
            <ContextMenu.Item
              key={item.label}
              className={cn(menuItemClass, item.danger && "spell-menu-item-danger")}
              onSelect={item.onSelect}
            >
              {item.label}
            </ContextMenu.Item>
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function MoneyPopover({
  title,
  canDone,
  onCancel,
  onDone,
  children,
  footer,
}: {
  title: string;
  canDone: boolean;
  onCancel: () => void;
  onDone: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && canDone) {
        event.preventDefault();
        onDone();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canDone, onCancel, onDone]);

  return createPortal(
    <div className={cn("money-popover-layer", isMobileApp && "mobile-drawer-layer")} onMouseDown={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn("money-popover", isMobileApp && "mobile-drawer")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {isMobileApp && <span className="mobile-drawer-handle" aria-hidden />}
        <header className="grid h-11 shrink-0 grid-cols-[4.75rem_1fr_4.75rem] items-center border-b border-border px-3">
          <button type="button" className="justify-self-start text-[13px] text-text-muted hover:text-text" onClick={onCancel}>
            Cancel
          </button>
          <span className="truncate text-center text-[13px] font-semibold text-text">{title}</span>
          <button
            type="button"
            disabled={!canDone}
            className="justify-self-end text-[13px] font-semibold text-text disabled:text-text-muted/40"
            onClick={onDone}
          >
            Done
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer}
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, optional = false, children }: { label: string; optional?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-[12px] leading-4 text-text-muted">
        {label}
        {optional && <span>optional</span>}
      </span>
      {children}
    </label>
  );
}

function MoneyInput({ valueCents, onChange, currency }: { valueCents: number; onChange: (amountCents: number) => void; currency: string }) {
  const [value, setValue] = useState(valueCents ? String(valueCents / 100) : "");

  useEffect(() => {
    setValue(valueCents ? String(valueCents / 100) : "");
  }, [valueCents]);

  return (
    <div className="relative">
      <Input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          onChange(parseMoney(event.target.value));
        }}
        placeholder="0.00"
        className="h-9 pr-14 tabular-nums"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-muted">{currency}</span>
    </div>
  );
}

function SubscriptionEditor({
  subscription,
  currency,
  projects,
  onClose,
  onSave,
  onArchive,
  onDelete,
}: {
  subscription: FinanceSubscription;
  currency: string;
  projects: { id: string; name: string }[];
  onClose: () => void;
  onSave: (subscription: FinanceSubscription) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState(subscription);
  const isNew = !subscription.name && subscription.amountCents === 0;
  const canDone = Boolean(draft.name.trim() && draft.amountCents > 0 && draft.nextBillingDate);

  return (
    <MoneyPopover
      title="Subscription"
      canDone={canDone}
      onCancel={onClose}
      onDone={() => onSave(draft)}
      footer={
        !isNew ? (
          <div className="flex shrink-0 items-center justify-center gap-6 border-t border-border px-4 py-2.5">
            <button type="button" className="text-[13px] text-text-muted hover:text-text" onClick={() => onArchive(draft.id)}>
              Archive
            </button>
            <button type="button" className="text-[13px] text-[var(--color-menu-danger)]" onClick={() => onDelete(draft.id)}>
              Delete
            </button>
          </div>
        ) : undefined
      }
    >
      <Input
        autoFocus
        value={draft.name}
        onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
        placeholder="Name"
        className="mb-4 h-auto border-0 bg-transparent px-0 py-1 text-[17px] font-semibold leading-6 shadow-none focus-visible:border-0 focus-visible:ring-0"
      />
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <MoneyInput valueCents={draft.amountCents} onChange={(amountCents) => setDraft((current) => ({ ...current, amountCents }))} currency={currency} />
          </Field>
          <Field label="Billing">
            <Select value={draft.cadence} onValueChange={(cadence) => setDraft((current) => ({ ...current, cadence: cadence as SubscriptionCadence }))}>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="custom">Custom</option>
            </Select>
          </Field>
        </div>
        {draft.cadence === "custom" && (
          <Field label="Every how many days">
            <Input type="number" min="1" value={draft.customIntervalDays ?? 30} className="h-9" onChange={(event) => setDraft((current) => ({ ...current, customIntervalDays: Math.max(1, Number(event.target.value) || 1) }))} />
          </Field>
        )}
        <Field label="Next bill">
          <Input type="date" value={draft.nextBillingDate} className="h-9" onChange={(event) => setDraft((current) => ({ ...current, nextBillingDate: event.target.value }))} />
        </Field>
        <Field label="Category" optional>
          <Input value={draft.category} className="h-9" onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} />
        </Field>
        <Field label="Project" optional>
          <Select value={draft.projectId ?? ""} onValueChange={(projectId) => setDraft((current) => ({ ...current, projectId: projectId || undefined }))}>
            <option value="">Not linked</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </Select>
        </Field>
        <Field label="Notes" optional>
          <textarea
            value={draft.notes ?? ""}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Plan or account"
            rows={2}
            className="min-h-16 w-full resize-none rounded-lg border border-transparent bg-bg-secondary px-3 py-2 text-[13px] leading-5 text-text outline-none placeholder:text-text-muted focus:border-accent/45 focus:bg-bg"
          />
        </Field>
      </div>
    </MoneyPopover>
  );
}

function TransactionEditor({
  transaction,
  currency,
  projects,
  onClose,
  onSave,
  onDelete,
}: {
  transaction: FinanceTransaction;
  currency: string;
  projects: { id: string; name: string }[];
  onClose: () => void;
  onSave: (transaction: FinanceTransaction) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState(transaction);
  const isNew = !transaction.title && transaction.amountCents === 0;
  const canDone = Boolean(draft.title.trim() && draft.amountCents > 0 && draft.date);

  return (
    <MoneyPopover
      title="Record"
      canDone={canDone}
      onCancel={onClose}
      onDone={() => onSave(draft)}
      footer={
        !isNew ? (
          <div className="flex shrink-0 items-center justify-center border-t border-border px-4 py-2.5">
            <button type="button" className="text-[13px] text-[var(--color-menu-danger)]" onClick={() => onDelete(draft.id)}>
              Delete
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="mb-3 flex items-center gap-4 text-[15px]" role="group" aria-label="Record type">
        <button type="button" onClick={() => setDraft((current) => ({ ...current, kind: "income" }))} aria-pressed={draft.kind === "income"} className={cn(draft.kind === "income" ? "text-text" : "text-text-muted")}>
          Income
        </button>
        <button type="button" onClick={() => setDraft((current) => ({ ...current, kind: "expense" }))} aria-pressed={draft.kind === "expense"} className={cn(draft.kind === "expense" ? "text-text" : "text-text-muted")}>
          Expense
        </button>
      </div>
      <Input
        autoFocus
        value={draft.title}
        onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
        placeholder={draft.kind === "income" ? "From" : "For"}
        className="mb-4 h-auto border-0 bg-transparent px-0 py-1 text-[17px] font-semibold leading-6 shadow-none focus-visible:border-0 focus-visible:ring-0"
      />
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <MoneyInput valueCents={draft.amountCents} onChange={(amountCents) => setDraft((current) => ({ ...current, amountCents }))} currency={currency} />
          </Field>
          <Field label="Date">
            <Input type="date" value={draft.date} className="h-9" onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} />
          </Field>
        </div>
        <Field label="Category" optional>
          <Input value={draft.category} className="h-9" onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} />
        </Field>
        <Field label="Project" optional>
          <Select value={draft.projectId ?? ""} onValueChange={(projectId) => setDraft((current) => ({ ...current, projectId: projectId || undefined }))}>
            <option value="">Not linked</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </Select>
        </Field>
        <Field label="Notes" optional>
          <textarea
            value={draft.notes ?? ""}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Invoice, receipt, or context"
            rows={2}
            className="min-h-16 w-full resize-none rounded-lg border border-transparent bg-bg-secondary px-3 py-2 text-[13px] leading-5 text-text outline-none placeholder:text-text-muted focus:border-accent/45 focus:bg-bg"
          />
        </Field>
      </div>
    </MoneyPopover>
  );
}
