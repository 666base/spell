import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  monthExpenses,
  monthIncome,
  monthNet,
  monthTitle,
  monthlyCost,
  parseCaptureLine,
  parseMoney,
  postedInMonth,
  recentTransactions,
} from "../../lib/finance";
import { useKanbanWorkspace } from "../../context/KanbanWorkspaceContext";
import { cn } from "../../lib/utils";
import type { NotesScope } from "../../lib/notesScope";
import { NoteTitlebar } from "../layout/NoteTitlebar";
import {
  AppPopover,
  Input,
  Select,
  SpellDateField,
} from "../ui";
import { PlusIcon } from "../icons/velocity";
import { CHECK_DRAW_MS, CheckmarkIcon } from "../ui/StateIcon";

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
  const income = monthIncome(workspace, month);
  const expenses = monthExpenses(workspace, month);
  const monthlyBurn = useMemo(
    () => subscriptions.reduce((total, subscription) => total + monthlyCost(subscription), 0),
    [subscriptions],
  );
  const monthEmpty = !isSubscriptions && !isOverview && posted.length === 0 && dues.length === 0;
  const overviewEmpty = isOverview && recent.length === 0 && dues.length === 0;
  const showEmptyActions = overviewEmpty || monthEmpty;
  const activity = isOverview ? recent : posted;

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
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-bg-secondary">
        {!hideTitleBar && titlebar}
        <div className="flex-1 bg-bg-secondary" />
      </div>
    );
  }

  const emptyActions = (
    <MoneyGroup>
      <button
        type="button"
        className="money-row"
        onClick={() => openTransactionEditor(createFinanceTransaction("income"))}
      >
        <span className="money-row-title">Income</span>
      </button>
      <button
        type="button"
        className="money-row"
        onClick={() => openTransactionEditor(createFinanceTransaction("expense"))}
      >
        <span className="money-row-title">Expense</span>
      </button>
      <button
        type="button"
        className="money-row"
        onClick={() => openSubscriptionEditor(createFinanceSubscription())}
      >
        <span className="money-row-title">Add a subscription</span>
      </button>
    </MoneyGroup>
  );

  const dueGroup = dues.length > 0 && (
    <MoneyGroup title="Due">
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
    </MoneyGroup>
  );

  const content = isSubscriptions ? (
    <>
      <MoneyHero label="Per month" value={formatMoney(monthlyBurn, workspace.currency)} />
      <MoneyGroup>
        {subscriptions.length === 0 ? (
          <button
            type="button"
            className="money-row"
            onClick={() => openSubscriptionEditor(createFinanceSubscription())}
          >
            <span className="money-row-title">Add a subscription</span>
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
      </MoneyGroup>
    </>
  ) : (
    <>
      <MoneyHero
        label={isOverview ? "This month" : "Net"}
        value={formatSignedMoney(net, workspace.currency)}
        inCents={income}
        outCents={expenses}
        currency={workspace.currency}
      />
      {showEmptyActions && emptyActions}
      {dueGroup}
      {activity.length > 0 && (
        <MoneyGroup>
          {activity.map((transaction) => (
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
        </MoneyGroup>
      )}
    </>
  );

  const capture = (
    <CaptureLine
      autoFocus={focusCapture}
      onFocused={() => setFocusCapture(false)}
      onAdd={addFromCapture}
    />
  );

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg-secondary">
      {!hideTitleBar && titlebar}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {hideTitleBar ? (
          <div className="mobile-money">
            {content}
            <div className="mobile-money-capture">{capture}</div>
          </div>
        ) : (
          <div className="money-page">
            <div className="money-page-inner">
              {content}
              <MoneyGroup>{capture}</MoneyGroup>
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

function MoneyHero({
  label,
  value,
  inCents,
  outCents,
  currency,
}: {
  label: string;
  value: string;
  inCents?: number;
  outCents?: number;
  currency?: string;
}) {
  return (
    <header className="money-hero">
      <p className="money-hero-label">{label}</p>
      <p className="money-hero-value">{value}</p>
      {currency !== undefined && inCents !== undefined && outCents !== undefined && (
        <p className="money-hero-split">
          <span>
            In <strong>{formatMoney(inCents, currency)}</strong>
          </span>
          <span>
            Out <strong>{formatMoney(outCents, currency)}</strong>
          </span>
        </p>
      )}
    </header>
  );
}

function MoneyGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="money-group">
      {title && <h2 className="money-group-title">{title}</h2>}
      <div className="money-group-card">{children}</div>
    </section>
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
    <div className="money-capture-field">
      <PlusIcon className="money-capture-icon" aria-hidden="true" />
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
        aria-label="Add a record"
        className="money-capture"
      />
    </div>
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
  const [checked, setChecked] = useState(false);
  const confirmTimer = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(confirmTimer.current), []);

  return (
    <RowMenu
      items={[
        { label: "Duplicate", onSelect: onDuplicate },
        { label: "Archive", onSelect: onArchive },
        { label: "Delete", onSelect: onDelete, danger: true },
      ]}
    >
      <div className="money-row">
        <button
          type="button"
          aria-label={`Confirm ${subscription.name}`}
          aria-pressed={checked}
          onClick={() => {
            if (checked) return;
            setChecked(true);
            confirmTimer.current = window.setTimeout(onConfirm, CHECK_DRAW_MS);
          }}
          className={cn("money-row-check", checked && "is-checked")}
        >
          <CheckmarkIcon checked={checked} className="size-2.5" />
        </button>
        <button type="button" onClick={onOpen} className="money-row-main">
          <span className="money-row-title">{subscription.name}</span>
          <span className={cn("money-row-meta", due.tone === "overdue" && "is-overdue")}>
            {due.text}
          </span>
        </button>
        <span className="money-row-amount">{formatMoney(subscription.amountCents, currency)}</span>
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

  const meta = [dateLabel, projectName].filter(Boolean).join(" · ");

  return (
    <RowMenu
      items={[
        { label: "Duplicate", onSelect: onDuplicate },
        { label: "Delete", onSelect: onDelete, danger: true },
      ]}
    >
      <button type="button" onClick={onOpen} className="money-row">
        <span className="money-row-main">
          <span className="money-row-title">{transaction.title}</span>
          <span className="money-row-meta">{meta}</span>
        </span>
        <span className={cn("money-row-amount", transaction.kind === "income" && "is-income")}>
          {amount}
        </span>
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
      <button type="button" onClick={onOpen} className="money-row">
        <span className="money-row-main">
          <span className="money-row-title">{subscription.name}</span>
          <span className={cn("money-row-meta", due.tone === "overdue" && "is-overdue")}>
            {cadenceLabel(subscription.cadence)} · {due.text}
          </span>
        </span>
        <span className="money-row-amount">{formatMoney(subscription.amountCents, currency)}</span>
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
    <AppPopover
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
          <SpellDateField
            value={draft.nextBillingDate}
            onChange={(nextBillingDate) => setDraft((current) => ({ ...current, nextBillingDate }))}
          />
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
    </AppPopover>
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
    <AppPopover
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
            <SpellDateField
              value={draft.date}
              onChange={(date) => setDraft((current) => ({ ...current, date }))}
            />
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
    </AppPopover>
  );
}
