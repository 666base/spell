import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useKanbanWorkspace } from "../../context/KanbanWorkspaceContext";
import { cn } from "../../lib/utils";
import {
  Button,
  IconButton,
  Input,
  Select,
} from "../ui";
import {
  ArchiveIcon,
  ExpenseIcon,
  FinanceIcon,
  IncomeIcon,
  PlusIcon,
  RenewalIcon,
  SubscriptionIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  XIcon,
} from "../icons/velocity";

export type FinanceView = "overview" | "income" | "expenses" | "subscriptions" | "activity" | "archive";

const CURRENCIES = ["BGN", "EUR", "USD", "GBP", "CAD", "AUD"] as const;

function formatMoney(amountCents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency}`;
  }
}

function parseMoney(value: string) {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : 0;
}

function startOfDay(value: string | Date) {
  const date = typeof value === "string" ? new Date(`${value}T12:00:00`) : new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysUntil(dateString: string) {
  const today = startOfDay(new Date());
  return Math.round((startOfDay(dateString).valueOf() - today.valueOf()) / 86_400_000);
}

function renewalLabel(nextBillingDate: string) {
  const days = daysUntil(nextBillingDate);
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, tone: "overdue" as const };
  if (days === 0) return { text: "Due today", tone: "soon" as const };
  if (days === 1) return { text: "Tomorrow", tone: "soon" as const };
  return { text: `In ${days} days`, tone: days <= 7 ? "soon" as const : "normal" as const };
}

function monthlyCost(subscription: FinanceSubscription) {
  if (subscription.cadence === "monthly") return subscription.amountCents;
  if (subscription.cadence === "yearly") return Math.round(subscription.amountCents / 12);
  return Math.round(subscription.amountCents / Math.max(1, subscription.customIntervalDays ?? 30) * 30.4375);
}

function cadenceLabel(subscription: FinanceSubscription) {
  if (subscription.cadence === "monthly") return "Monthly";
  if (subscription.cadence === "yearly") return "Yearly";
  const days = subscription.customIntervalDays ?? 30;
  return `Every ${days} days`;
}

function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function sum(items: { amountCents: number }[]) {
  return items.reduce((total, item) => total + item.amountCents, 0);
}

function brandTone(name: string) {
  const tones = [
    "bg-sky-500/12 text-sky-700 dark:text-sky-300",
    "bg-violet-500/12 text-violet-700 dark:text-violet-300",
    "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    "bg-orange-500/12 text-orange-700 dark:text-orange-300",
    "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  ];
  const value = Array.from(name.toLocaleLowerCase()).reduce((total, character) => total + character.charCodeAt(0), 0);
  return tones[value % tones.length];
}

function BrandMark({ name, className }: { name: string; className?: string }) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1
    ? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`
    : (words[0] ?? "?").slice(0, 2);

  return (
    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold uppercase tracking-[-0.03em]", brandTone(name), className)} aria-hidden="true">
      {letters}
    </span>
  );
}

function Field({ label, optional = false, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-text">
        {label}
        {optional && <span className="font-normal text-text-muted">optional</span>}
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
        className="pr-14 tabular-nums"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-muted">{currency}</span>
    </div>
  );
}

interface FinancePageProps {
  view?: FinanceView;
  onViewChange?: (view: FinanceView) => void;
  showSectionTabs?: boolean;
}

export function FinancePage({
  view: controlledView,
  onViewChange,
  showSectionTabs = true,
}: FinancePageProps) {
  const {
    workspace,
    isLoading,
    setCurrency,
    saveSubscription,
    saveTransaction,
    archiveSubscription,
    archiveTransaction,
  } = useFinance();
  const { workspace: projectWorkspace } = useKanbanWorkspace();
  const [localView, setLocalView] = useState<FinanceView>("overview");
  const view = controlledView ?? localView;
  const setView = onViewChange ?? setLocalView;
  const [subscriptionEditor, setSubscriptionEditor] = useState<FinanceSubscription | null>(null);
  const [transactionEditor, setTransactionEditor] = useState<FinanceTransaction | null>(null);
  const openSubscriptionEditor = useCallback((subscription: FinanceSubscription) => {
    setTransactionEditor(null);
    setSubscriptionEditor(subscription);
  }, []);
  const openTransactionEditor = useCallback((transaction: FinanceTransaction) => {
    setSubscriptionEditor(null);
    setTransactionEditor(transaction);
  }, []);
  const detailOpen = Boolean(subscriptionEditor || transactionEditor);

  const activeSubscriptions = useMemo(
    () => workspace.subscriptions.filter((subscription) => !subscription.archived).sort((a, b) => a.nextBillingDate.localeCompare(b.nextBillingDate)),
    [workspace.subscriptions],
  );
  const activeTransactions = useMemo(
    () => workspace.transactions.filter((transaction) => !transaction.archived).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt),
    [workspace.transactions],
  );
  const archivedSubscriptions = useMemo(() => workspace.subscriptions.filter((subscription) => subscription.archived), [workspace.subscriptions]);
  const archivedTransactions = useMemo(() => workspace.transactions.filter((transaction) => transaction.archived), [workspace.transactions]);
  const monthTransactions = useMemo(() => activeTransactions.filter((transaction) => transaction.date.startsWith(monthKey())), [activeTransactions]);
  const incomeThisMonth = useMemo(() => sum(monthTransactions.filter((transaction) => transaction.kind === "income")), [monthTransactions]);
  const expensesThisMonth = useMemo(() => sum(monthTransactions.filter((transaction) => transaction.kind === "expense")), [monthTransactions]);
  const recurringMonthly = useMemo(() => activeSubscriptions.reduce((total, subscription) => total + monthlyCost(subscription), 0), [activeSubscriptions]);
  const upcomingSubscriptions = useMemo(() => activeSubscriptions.filter((subscription) => daysUntil(subscription.nextBillingDate) <= 30).slice(0, 5), [activeSubscriptions]);

  if (isLoading) return <FinanceLoading />;

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-bg">
      <header className="shrink-0 border-b border-border bg-bg px-3 sm:px-5">
        <div className="flex min-h-16 items-center gap-3 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-muted text-text-muted">
            <FinanceIcon className="h-4 w-4 stroke-[1.65]" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold tracking-[-0.015em] text-text">Money</h1>
            <p className="truncate text-xs text-text-muted">Income, costs, and renewals</p>
          </div>
          <Select value={workspace.currency} onValueChange={setCurrency} className="h-7 w-[72px] px-2 text-2xs" contentClassName="min-w-[108px]">
            {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
          </Select>
          <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
            <Button variant="ghost" size="sm" onClick={() => openTransactionEditor(createFinanceTransaction("expense"))} className="gap-1.5">
              <ExpenseIcon className="h-3.5 w-3.5 stroke-[1.7]" />
              Expense
            </Button>
            <Button variant="primary" size="sm" onClick={() => openTransactionEditor(createFinanceTransaction("income"))} className="gap-1.5 shadow-none hover:shadow-none">
              <IncomeIcon className="h-3.5 w-3.5 stroke-[1.7]" />
              Income
            </Button>
          </div>
          <IconButton onClick={() => openSubscriptionEditor(createFinanceSubscription())} title="Add subscription" className="shrink-0 sm:hidden">
            <SubscriptionIcon className="h-4 w-4 stroke-[1.7]" />
          </IconButton>
          <Button variant="outline" size="sm" onClick={() => openSubscriptionEditor(createFinanceSubscription())} className="hidden shrink-0 gap-1.5 sm:inline-flex">
            <SubscriptionIcon className="h-3.5 w-3.5 stroke-[1.7]" />
            Subscription
          </Button>
          <Button variant="primary" size="sm" onClick={() => openTransactionEditor(createFinanceTransaction("income"))} className="shrink-0 gap-1.5 shadow-none hover:shadow-none sm:hidden">
            <PlusIcon className="h-3.5 w-3.5 stroke-[1.8]" />
            Add
          </Button>
        </div>
        {showSectionTabs && <nav className="-mb-px flex gap-4 overflow-x-auto" aria-label="Money sections">
          {([
            ["overview", "Overview"],
            ["income", "Income"],
            ["expenses", "Spending"],
            ["subscriptions", "Subscriptions"],
            ["activity", "Activity"],
            ["archive", "Archive"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              aria-current={view === id ? "page" : undefined}
              className={cn(
                "shrink-0 border-b-2 px-0.5 py-2 text-xs font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                view === id ? "border-accent text-text" : "border-transparent text-text-muted hover:text-text",
              )}
            >
              {label}
            </button>
          ))}
        </nav>}
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className={cn("flex min-w-0 flex-1 flex-col overflow-hidden", detailOpen && "hidden min-[1440px]:flex")}>
      {view === "overview" && (
        <FinanceOverview
          currency={workspace.currency}
          incomeThisMonth={incomeThisMonth}
          expensesThisMonth={expensesThisMonth}
          recurringMonthly={recurringMonthly}
          upcomingSubscriptions={upcomingSubscriptions}
          activeSubscriptions={activeSubscriptions}
          activeTransactions={activeTransactions}
          onOpenSubscription={openSubscriptionEditor}
          onViewSubscriptions={() => setView("subscriptions")}
          onViewActivity={() => setView("activity")}
        />
      )}
      {view === "subscriptions" && (
        <SubscriptionList
          subscriptions={activeSubscriptions}
          currency={workspace.currency}
          projectNames={new Map(projectWorkspace.projects.map((project) => [project.id, project.name]))}
          onOpen={openSubscriptionEditor}
          onArchive={(id) => archiveSubscription(id, true)}
          onCreate={() => openSubscriptionEditor(createFinanceSubscription())}
        />
      )}
      {(view === "income" || view === "expenses" || view === "activity") && (
        <TransactionList
          transactions={view === "income" ? activeTransactions.filter((transaction) => transaction.kind === "income") : view === "expenses" ? activeTransactions.filter((transaction) => transaction.kind === "expense") : activeTransactions}
          currency={workspace.currency}
          projectNames={new Map(projectWorkspace.projects.map((project) => [project.id, project.name]))}
          onOpen={openTransactionEditor}
          onArchive={(id) => archiveTransaction(id, true)}
          onCreateIncome={() => openTransactionEditor(createFinanceTransaction("income"))}
          onCreateExpense={() => openTransactionEditor(createFinanceTransaction("expense"))}
          kind={view === "income" ? "income" : view === "expenses" ? "expense" : undefined}
        />
      )}
      {view === "archive" && (
        <ArchiveView
          subscriptions={archivedSubscriptions}
          transactions={archivedTransactions}
          currency={workspace.currency}
          onRestoreSubscription={(id) => archiveSubscription(id, false)}
          onRestoreTransaction={(id) => archiveTransaction(id, false)}
        />
      )}

      </div>

      {subscriptionEditor && (
        <SubscriptionEditor
          key={subscriptionEditor.id}
          subscription={subscriptionEditor}
          currency={workspace.currency}
          projects={projectWorkspace.projects}
          onClose={() => setSubscriptionEditor(null)}
          onSave={(subscription) => {
            saveSubscription(subscription);
            setSubscriptionEditor(null);
          }}
          onArchive={(id) => {
            archiveSubscription(id, true);
            setSubscriptionEditor(null);
          }}
        />
      )}
      {transactionEditor && (
        <TransactionEditor
          key={transactionEditor.id}
          transaction={transactionEditor}
          currency={workspace.currency}
          projects={projectWorkspace.projects}
          onClose={() => setTransactionEditor(null)}
          onSave={(transaction) => {
            saveTransaction(transaction);
            setTransactionEditor(null);
          }}
          onArchive={(id) => {
            archiveTransaction(id, true);
            setTransactionEditor(null);
          }}
        />
      )}
      </div>
    </section>
  );
}

function FinanceLoading() {
  return (
    <section className="flex min-w-0 flex-1 flex-col bg-bg">
      <div className="flex min-h-16 items-center gap-3 border-b border-border px-3 py-2 sm:px-5">
        <div className="h-8 w-8 rounded-lg bg-bg-muted" />
        <div className="space-y-1.5"><div className="h-3.5 w-20 rounded bg-bg-muted" /><div className="h-2.5 w-36 rounded bg-bg-muted/70" /></div>
      </div>
      <div className="grid flex-1 grid-cols-1 gap-3 bg-bg-secondary/35 p-3 sm:grid-cols-3 sm:p-5">
        {[0, 1, 2].map((item) => <div key={item} className="h-28 rounded-xl border border-border bg-bg" />)}
      </div>
    </section>
  );
}

function FinanceOverview({
  currency,
  incomeThisMonth,
  expensesThisMonth,
  recurringMonthly,
  upcomingSubscriptions,
  activeSubscriptions,
  activeTransactions,
  onOpenSubscription,
  onViewSubscriptions,
  onViewActivity,
}: {
  currency: string;
  incomeThisMonth: number;
  expensesThisMonth: number;
  recurringMonthly: number;
  upcomingSubscriptions: FinanceSubscription[];
  activeSubscriptions: FinanceSubscription[];
  activeTransactions: FinanceTransaction[];
  onOpenSubscription: (subscription: FinanceSubscription) => void;
  onViewSubscriptions: () => void;
  onViewActivity: () => void;
}) {
  const recordedNet = incomeThisMonth - expensesThisMonth;
  const recentTransactions = activeTransactions.slice(0, 4);
  const recordedCount = activeTransactions.length;
  const spendingRatio = incomeThisMonth > 0
    ? Math.min(1, expensesThisMonth / incomeThisMonth)
    : 0;
  const commitmentRatio = incomeThisMonth > 0
    ? Math.min(1, recurringMonthly / incomeThisMonth)
    : 0;
  const monthName = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date());

  return (
    <div className="finance-scroll flex-1 overflow-y-auto bg-bg-secondary">
      <div className="mx-auto w-full max-w-6xl px-3 py-3 sm:px-5 sm:py-5 lg:px-6">
        <section className="overflow-hidden border border-border bg-bg">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))]">
            <div className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-2xs font-semibold uppercase tracking-[0.1em] text-text-muted">Cash position</p>
                  <p className="mt-1 text-xs text-text-muted">{monthName}</p>
                </div>
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", recordedNet >= 0 ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/12 text-rose-700 dark:text-rose-300")}>
                  {recordedNet >= 0 ? <TrendingUpIcon className="h-3.5 w-3.5 stroke-[1.8]" /> : <TrendingDownIcon className="h-3.5 w-3.5 stroke-[1.8]" />}
                </span>
              </div>
              <p className={cn("mt-6 text-4xl font-semibold tracking-[-0.055em] tabular-nums sm:text-5xl", recordedNet >= 0 ? "text-text" : "text-rose-700 dark:text-rose-300")}>{formatMoney(recordedNet, currency)}</p>
              <p className="mt-2 max-w-sm text-xs leading-5 text-text-muted">Available after the income and spending you recorded this month.</p>
              <div className="mt-7 grid grid-cols-2 border-y border-border">
                <div className="py-3 pr-3">
                  <div className="flex items-center gap-1.5 text-2xs font-medium text-text-muted"><IncomeIcon className="h-3.5 w-3.5 stroke-[1.65] text-emerald-700 dark:text-emerald-300" /> In</div>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-text">{formatMoney(incomeThisMonth, currency)}</p>
                </div>
                <div className="border-l border-border py-3 pl-3">
                  <div className="flex items-center gap-1.5 text-2xs font-medium text-text-muted"><ExpenseIcon className="h-3.5 w-3.5 stroke-[1.65] text-rose-700 dark:text-rose-300" /> Out</div>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-text">{formatMoney(expensesThisMonth, currency)}</p>
                </div>
              </div>
            </div>
            <CashFlowChart transactions={activeTransactions} currency={currency} />
          </div>
        </section>

        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] gap-3">
          <section className="border border-border bg-bg p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-500/12 text-rose-700 dark:text-rose-300"><ExpenseIcon className="h-3.5 w-3.5 stroke-[1.65]" /></span>
              <div><h2 className="text-xs font-semibold text-text">Spend and retain</h2><p className="text-2xs text-text-muted">Of this month’s income</p></div>
            </div>
            <div className="mt-5 flex items-center gap-5">
              <SpendingDial ratio={spendingRatio} hasIncome={incomeThisMonth > 0} />
              <div className="min-w-0">
                <p className="text-lg font-semibold tracking-[-0.035em] tabular-nums text-text">{incomeThisMonth > 0 ? `${Math.round(spendingRatio * 100)}%` : "—"}</p>
                <p className="mt-1 text-xs leading-5 text-text-muted">{incomeThisMonth > 0 ? expensesThisMonth > incomeThisMonth ? "Spending is above recorded income." : `${formatMoney(Math.max(0, incomeThisMonth - expensesThisMonth), currency)} retained.` : "Record income to compare spending."}</p>
              </div>
            </div>
          </section>

          <section className="border border-border bg-bg p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-bg-muted text-text-muted"><SubscriptionIcon className="h-3.5 w-3.5 stroke-[1.65]" /></span>
              <div className="min-w-0 flex-1"><h2 className="text-xs font-semibold text-text">Recurring commitments</h2><p className="text-2xs text-text-muted">{activeSubscriptions.length ? `${activeSubscriptions.length} active subscriptions` : "No active subscriptions"}</p></div>
              <button type="button" onClick={onViewSubscriptions} className="motion-interactive text-2xs font-medium text-text-muted hover:text-text">Manage</button>
            </div>
            <div className="mt-5">
              <div className="flex items-end justify-between gap-3"><p className="text-xl font-semibold tracking-[-0.04em] tabular-nums text-text">{formatMoney(recurringMonthly, currency)}</p><p className="text-2xs tabular-nums text-text-muted">{incomeThisMonth > 0 ? `${Math.round(commitmentRatio * 100)}% of income` : "monthly"}</p></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-muted"><div className="h-full origin-left rounded-full bg-text-muted/70 transition-transform duration-200 ease-out" style={{ transform: `scaleX(${Math.min(1, Math.max(0, commitmentRatio))})` }} /></div>
            </div>
            <div className="mt-5 border-t border-border pt-3">
              {upcomingSubscriptions.length > 0 ? upcomingSubscriptions.slice(0, 3).map((subscription) => <button key={subscription.id} type="button" onClick={() => onOpenSubscription(subscription)} className="motion-interactive flex w-full items-center gap-2 py-1.5 text-left hover:text-text"><BrandMark name={subscription.name} className="h-6 w-6 rounded-md text-2xs" /><span className="min-w-0 flex-1 truncate text-xs text-text-muted">{subscription.name}</span><span className={cn("shrink-0 text-2xs tabular-nums", renewalLabel(subscription.nextBillingDate).tone === "soon" ? "text-amber-700 dark:text-amber-300" : "text-text-muted")}>{renewalLabel(subscription.nextBillingDate).text}</span></button>) : <p className="text-xs leading-5 text-text-muted">No renewal is due in the next 30 days.</p>}
            </div>
          </section>

          <section className="border border-border bg-bg p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-bg-muted text-text-muted"><RenewalIcon className="h-3.5 w-3.5 stroke-[1.65]" /></span>
              <div className="min-w-0 flex-1"><h2 className="text-xs font-semibold text-text">Recent activity</h2><p className="text-2xs text-text-muted">{recordedCount ? `${recordedCount} recorded item${recordedCount === 1 ? "" : "s"}` : "Nothing recorded yet"}</p></div>
              <button type="button" onClick={onViewActivity} className="motion-interactive text-2xs font-medium text-text-muted hover:text-text">View all</button>
            </div>
            <div className="mt-4 border-t border-border pt-2">
              {recentTransactions.length > 0 ? recentTransactions.map((transaction) => <button key={transaction.id} type="button" onClick={onViewActivity} className="motion-interactive flex w-full items-center gap-2 py-2 text-left hover:text-text"><span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", transaction.kind === "income" ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/12 text-rose-700 dark:text-rose-300")}>{transaction.kind === "income" ? <TrendingUpIcon className="h-3 w-3 stroke-[1.8]" /> : <TrendingDownIcon className="h-3 w-3 stroke-[1.8]" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs text-text">{transaction.title}</span><span className="block truncate text-2xs text-text-muted">{startOfDay(transaction.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {transaction.category}</span></span><span className={cn("shrink-0 text-xs font-semibold tabular-nums", transaction.kind === "income" ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300")}>{transaction.kind === "income" ? "+" : "−"}{formatMoney(transaction.amountCents, currency)}</span></button>) : <p className="py-4 text-center text-xs text-text-muted">Income and spending will appear here.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function CashFlowChart({
  transactions,
  currency,
}: {
  transactions: FinanceTransaction[];
  currency: string;
}) {
  const today = new Date();
  const series = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - 5 + index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const records = transactions.filter((transaction) => transaction.date.startsWith(key));
    return {
      label: new Intl.DateTimeFormat(undefined, { month: "short" }).format(date),
      income: sum(records.filter((transaction) => transaction.kind === "income")),
      expenses: sum(records.filter((transaction) => transaction.kind === "expense")),
    };
  });
  const maximum = Math.max(1, ...series.flatMap((item) => [item.income, item.expenses]));
  const hasData = transactions.length > 0;
  const chartHeight = 102;
  const chartFloor = 82;
  const chartWidth = 360;
  const columnWidth = chartWidth / series.length;

  return (
    <div className="flex min-w-0 flex-col justify-between border-t border-border bg-bg-secondary/45 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-2xs font-semibold uppercase tracking-[0.1em] text-text-muted">Cash flow</p><p className="mt-1 text-xs text-text-muted">Income and spending, six months</p></div>
        <span className="text-2xs tabular-nums text-text-muted">{hasData ? `${transactions.length} records` : "No records"}</span>
      </div>
      <div className="mt-5 min-h-38">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-38 w-full overflow-visible" role="img" aria-label="Six-month cash flow chart">
          {[22, 52, chartFloor].map((y) => <line key={y} x1="0" x2={chartWidth} y1={y} y2={y} className="stroke-border" strokeWidth="1" />)}
          {series.map((item, index) => {
            const incomeHeight = Math.max(item.income > 0 ? 3 : 0, (item.income / maximum) * 54);
            const expenseHeight = Math.max(item.expenses > 0 ? 3 : 0, (item.expenses / maximum) * 54);
            const origin = index * columnWidth + columnWidth / 2;
            return <g key={item.label}>
              <rect x={origin - 12} y={chartFloor - incomeHeight} width="9" height={incomeHeight} rx="2" className="fill-emerald-500" />
              <rect x={origin + 3} y={chartFloor - expenseHeight} width="9" height={expenseHeight} rx="2" className="fill-rose-400 dark:fill-rose-500" />
              <text x={origin} y="101" textAnchor="middle" className="fill-text-muted text-[10px]">{item.label}</text>
            </g>;
          })}
        </svg>
      </div>
      <div className="mt-2 flex items-center gap-4 text-2xs text-text-muted"><span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Income</span><span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-rose-400 dark:bg-rose-500" />Spending</span><span className="ml-auto tabular-nums">Peak {formatMoney(maximum, currency)}</span></div>
    </div>
  );
}

function SpendingDial({ ratio, hasIncome }: { ratio: number; hasIncome: boolean }) {
  const radius = 31;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative h-20 w-20 shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="40" cy="40" r={radius} fill="none" strokeWidth="7" className="stroke-bg-muted" />
        <circle cx="40" cy="40" r={radius} fill="none" strokeWidth="7" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ratio)} className="stroke-rose-500 transition-[stroke-dashoffset] duration-200 ease-out" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-2xs font-semibold tabular-nums text-text">{hasIncome ? `${Math.round(ratio * 100)}%` : "—"}</span>
    </div>
  );
}

function EmptySection({ icon: Icon, title, detail }: { icon: typeof FinanceIcon; title: string; detail: string }) {
  return (
    <div className="border-y border-dashed border-border bg-bg/50 px-4 py-8 text-center">
      <Icon className="mx-auto h-4.5 w-4.5 stroke-[1.6] text-text-muted" />
      <p className="mt-3 text-sm font-medium text-text">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-text-muted">{detail}</p>
    </div>
  );
}

function SubscriptionList({
  subscriptions,
  currency,
  projectNames,
  onOpen,
  onArchive,
  onCreate,
}: {
  subscriptions: FinanceSubscription[];
  currency: string;
  projectNames: Map<string, string>;
  onOpen: (subscription: FinanceSubscription) => void;
  onArchive: (id: string) => void;
  onCreate: () => void;
}) {
  const monthlyTotal = subscriptions.reduce((total, subscription) => total + monthlyCost(subscription), 0);
  return (
    <div className="flex-1 overflow-y-auto bg-bg-secondary">
      <div className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-5 sm:py-7 lg:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.015em] text-text">Subscriptions</h2>
            <p className="mt-1 text-sm text-text-muted">{subscriptions.length} active · about {formatMoney(monthlyTotal, currency)} each month</p>
          </div>
          <Button variant="primary" size="sm" onClick={onCreate} className="gap-1.5 shadow-none hover:shadow-none"><PlusIcon className="h-3.5 w-3.5 stroke-[1.8]" /> Add subscription</Button>
        </div>
        {subscriptions.length > 0 ? (
          <div className="border-y border-border">
            {subscriptions.map((subscription, index) => (
              <div key={subscription.id} className={cn("group flex items-center gap-3 px-1 py-3.5", index < subscriptions.length - 1 && "border-b border-border")}>
                <button type="button" onClick={() => onOpen(subscription)} className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                  <BrandMark name={subscription.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text">{subscription.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-text-muted">{subscription.category}{subscription.projectId && projectNames.get(subscription.projectId) ? ` · ${projectNames.get(subscription.projectId)}` : ""}</span>
                  </span>
                </button>
                <span className="hidden shrink-0 text-xs text-text-muted sm:block">{cadenceLabel(subscription)}</span>
                <span className="shrink-0 text-right"><span className="block text-sm font-medium tabular-nums text-text">{formatMoney(subscription.amountCents, currency)}</span><span className="mt-0.5 block text-xs text-text-muted">{renewalLabel(subscription.nextBillingDate).text}</span></span>
                <Button variant="ghost" size="xs" onClick={() => onArchive(subscription.id)} className="hidden text-text-muted hover:text-text sm:inline-flex">Archive</Button>
              </div>
            ))}
          </div>
        ) : <EmptySection icon={SubscriptionIcon} title="No subscriptions yet" detail="Track tools, platforms, and services before they renew." />}
      </div>
    </div>
  );
}

function TransactionList({
  transactions,
  currency,
  projectNames,
  onOpen,
  onArchive,
  onCreateIncome,
  onCreateExpense,
  kind,
}: {
  transactions: FinanceTransaction[];
  currency: string;
  projectNames: Map<string, string>;
  onOpen: (transaction: FinanceTransaction) => void;
  onArchive: (id: string) => void;
  onCreateIncome: () => void;
  onCreateExpense: () => void;
  kind?: FinanceTransaction["kind"];
}) {
  const title = kind === "income" ? "Income & clients" : kind === "expense" ? "Spending" : "Activity";
  const detail = kind === "income"
    ? "Every client payment, invoice, and other source of income"
    : kind === "expense"
    ? "Everything that has left your account"
    : "Money you have actually received or spent";
  const emptyTitle = kind === "income" ? "No income recorded yet" : kind === "expense" ? "No spending recorded yet" : "No money recorded yet";
  const emptyDetail = kind === "income"
    ? "Add each client payment or source so you can see where your money comes from."
    : kind === "expense"
    ? "Add expenses as they leave your account to keep your costs honest."
    : "Add income when you are paid, and expenses when they leave your account.";
  return (
    <div className="flex-1 overflow-y-auto bg-bg-secondary">
      <div className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-5 sm:py-7 lg:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-base font-semibold tracking-[-0.015em] text-text">{title}</h2><p className="mt-1 text-sm text-text-muted">{detail}</p></div>
          {kind === "income" ? <Button variant="primary" size="sm" onClick={onCreateIncome} className="gap-1.5 shadow-none hover:shadow-none"><IncomeIcon className="h-3.5 w-3.5 stroke-[1.7]" /> Add income</Button>
          : kind === "expense" ? <Button variant="primary" size="sm" onClick={onCreateExpense} className="gap-1.5 shadow-none hover:shadow-none"><ExpenseIcon className="h-3.5 w-3.5 stroke-[1.7]" /> Add expense</Button>
          : <div className="flex items-center gap-1.5"><Button variant="ghost" size="sm" onClick={onCreateExpense} className="gap-1.5"><ExpenseIcon className="h-3.5 w-3.5 stroke-[1.7]" /> Expense</Button><Button variant="primary" size="sm" onClick={onCreateIncome} className="gap-1.5 shadow-none hover:shadow-none"><IncomeIcon className="h-3.5 w-3.5 stroke-[1.7]" /> Income</Button></div>}
        </div>
        {transactions.length > 0 ? (
          <div className="border-y border-border">
            {transactions.map((transaction, index) => (
              <div key={transaction.id} className={cn("group flex items-center gap-3 px-1 py-3.5", index < transactions.length - 1 && "border-b border-border")}>
                <button type="button" onClick={() => onOpen(transaction)} className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", transaction.kind === "income" ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/12 text-rose-700 dark:text-rose-300")}>
                    {transaction.kind === "income" ? <TrendingUpIcon className="h-4 w-4 stroke-[1.7]" /> : <TrendingDownIcon className="h-4 w-4 stroke-[1.7]" />}
                  </span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-text">{transaction.title}</span><span className="mt-0.5 block truncate text-xs text-text-muted">{transaction.category}{transaction.projectId && projectNames.get(transaction.projectId) ? ` · ${projectNames.get(transaction.projectId)}` : ""}</span></span>
                </button>
                <span className="hidden shrink-0 text-xs text-text-muted sm:block">{startOfDay(transaction.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                <span className={cn("shrink-0 text-sm font-medium tabular-nums", transaction.kind === "income" ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300")}>{transaction.kind === "income" ? "+" : "−"}{formatMoney(transaction.amountCents, currency)}</span>
                <Button variant="ghost" size="xs" onClick={() => onArchive(transaction.id)} className="hidden text-text-muted hover:text-text sm:inline-flex">Archive</Button>
              </div>
            ))}
          </div>
        ) : <EmptySection icon={kind === "income" ? IncomeIcon : kind === "expense" ? ExpenseIcon : FinanceIcon} title={emptyTitle} detail={emptyDetail} />}
      </div>
    </div>
  );
}

function ArchiveView({
  subscriptions,
  transactions,
  currency,
  onRestoreSubscription,
  onRestoreTransaction,
}: {
  subscriptions: FinanceSubscription[];
  transactions: FinanceTransaction[];
  currency: string;
  onRestoreSubscription: (id: string) => void;
  onRestoreTransaction: (id: string) => void;
}) {
  const items = [
    ...subscriptions.map((subscription) => ({ type: "subscription" as const, item: subscription, date: subscription.updatedAt })),
    ...transactions.map((transaction) => ({ type: "transaction" as const, item: transaction, date: transaction.updatedAt })),
  ].sort((a, b) => b.date - a.date);
  return (
    <div className="flex-1 overflow-y-auto bg-bg-secondary">
      <div className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-5 sm:py-7 lg:px-8">
        <div className="mb-5"><h2 className="text-base font-semibold tracking-[-0.015em] text-text">Archive</h2><p className="mt-1 text-sm text-text-muted">Inactive records stay here until you restore them.</p></div>
        {items.length > 0 ? <div className="border-y border-border">
          {items.map(({ type, item }, index) => (
            <div key={`${type}-${item.id}`} className={cn("flex items-center gap-3 px-1 py-3.5", index < items.length - 1 && "border-b border-border")}>
              {type === "subscription" ? <BrandMark name={item.name} /> : <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-bg-muted text-text-muted"><ArchiveIcon className="h-4 w-4 stroke-[1.7]" /></span>}
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-text">{type === "subscription" ? item.name : item.title}</span><span className="mt-0.5 block text-xs text-text-muted">{type === "subscription" ? "Subscription" : item.kind === "income" ? "Income" : "Expense"}</span></span>
              <span className="text-sm tabular-nums text-text-muted">{formatMoney(item.amountCents, currency)}</span>
              <Button variant="ghost" size="xs" onClick={() => type === "subscription" ? onRestoreSubscription(item.id) : onRestoreTransaction(item.id)}>Restore</Button>
            </div>
          ))}
        </div> : <EmptySection icon={ArchiveIcon} title="Archive is empty" detail="Archived subscriptions and records will remain available here." />}
      </div>
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
}: {
  subscription: FinanceSubscription;
  currency: string;
  projects: { id: string; name: string }[];
  onClose: () => void;
  onSave: (subscription: FinanceSubscription) => void;
  onArchive: (id: string) => void;
}) {
  const [draft, setDraft] = useState(subscription);
  const isNew = !subscription.name && subscription.amountCents === 0;

  return (
    <aside className="workspace-detail-panel flex min-h-0 min-w-0 flex-1 flex-col bg-bg-secondary min-[1440px]:w-[23rem] min-[1440px]:flex-none min-[1440px]:border-l min-[1440px]:border-border" aria-label={isNew ? "Add subscription" : "Subscription details"}>
        <div className="flex shrink-0 items-start gap-3 border-b border-border bg-bg px-4 py-3.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-muted text-text-muted"><SubscriptionIcon className="h-4 w-4 stroke-[1.7]" /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-text">{isNew ? "Add subscription" : "Subscription details"}</h2><p className="mt-0.5 text-xs leading-5 text-text-muted">Keep the renewal and amount clear.</p></div><IconButton onClick={onClose} aria-label="Close subscription details" size="sm"><XIcon className="h-4 w-4 stroke-[1.7]" /></IconButton></div>
        <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
          <Field label="Platform or service"><Input autoFocus value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Figma" /></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Price"><MoneyInput valueCents={draft.amountCents} onChange={(amountCents) => setDraft((current) => ({ ...current, amountCents }))} currency={currency} /></Field><Field label="Billing"><Select value={draft.cadence} onValueChange={(cadence) => setDraft((current) => ({ ...current, cadence: cadence as SubscriptionCadence }))}><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="custom">Custom interval</option></Select></Field></div>
          {draft.cadence === "custom" && <Field label="Every how many days"><Input type="number" min="1" value={draft.customIntervalDays ?? 30} onChange={(event) => setDraft((current) => ({ ...current, customIntervalDays: Math.max(1, Number(event.target.value) || 1) }))} /></Field>}
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Next renewal"><Input type="date" value={draft.nextBillingDate} onChange={(event) => setDraft((current) => ({ ...current, nextBillingDate: event.target.value }))} /></Field><Field label="Category"><Input value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} placeholder="e.g. Software" /></Field></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Project link" optional><Select value={draft.projectId ?? ""} onValueChange={(projectId) => setDraft((current) => ({ ...current, projectId: projectId || undefined }))}><option value="">Not linked</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select></Field><Field label="Website" optional><Input value={draft.website ?? ""} onChange={(event) => setDraft((current) => ({ ...current, website: event.target.value }))} placeholder="figma.com" /></Field></div>
          <Field label="Notes" optional><textarea value={draft.notes ?? ""} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Plan, account, or renewal details" rows={3} className="min-h-20 w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm leading-5 text-text outline-none placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/15" /></Field>
        </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 border-t border-border bg-bg px-4 py-3 sm:px-5">{!isNew && <Button variant="ghost" size="sm" onClick={() => onArchive(draft.id)} className="mr-auto text-text-muted">Archive</Button>}<Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" disabled={!draft.name.trim() || draft.amountCents <= 0 || !draft.nextBillingDate} onClick={() => onSave(draft)}>{isNew ? "Add subscription" : "Save changes"}</Button></div>
    </aside>
  );
}

function TransactionEditor({
  transaction,
  currency,
  projects,
  onClose,
  onSave,
  onArchive,
}: {
  transaction: FinanceTransaction;
  currency: string;
  projects: { id: string; name: string }[];
  onClose: () => void;
  onSave: (transaction: FinanceTransaction) => void;
  onArchive: (id: string) => void;
}) {
  const [draft, setDraft] = useState(transaction);
  const isNew = !transaction.title && transaction.amountCents === 0;

  return (
    <aside className="workspace-detail-panel flex min-h-0 min-w-0 flex-1 flex-col bg-bg-secondary min-[1440px]:w-[23rem] min-[1440px]:flex-none min-[1440px]:border-l min-[1440px]:border-border" aria-label={isNew ? "Add record" : "Record details"}>
        <div className="flex shrink-0 items-start gap-3 border-b border-border bg-bg px-4 py-3.5"><span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", draft.kind === "income" ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/12 text-rose-700 dark:text-rose-300")}>
          {draft.kind === "income" ? <IncomeIcon className="h-4 w-4 stroke-[1.7]" /> : <ExpenseIcon className="h-4 w-4 stroke-[1.7]" />}
        </span><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-text">{isNew ? "Add record" : "Record details"}</h2><p className="mt-0.5 text-xs leading-5 text-text-muted">Record money when it is received or spent.</p></div><IconButton onClick={onClose} aria-label="Close record details" size="sm"><XIcon className="h-4 w-4 stroke-[1.7]" /></IconButton></div>
        <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex items-center rounded-lg border border-border bg-bg-secondary p-0.5" role="group" aria-label="Record type"><Button variant="ghost" size="sm" onClick={() => setDraft((current) => ({ ...current, kind: "income", category: current.category === "Software" ? "Client work" : current.category }))} aria-pressed={draft.kind === "income"} className={cn("flex-1 gap-1.5", draft.kind === "income" ? "bg-bg text-text hover:bg-bg" : "text-text-muted")}><IncomeIcon className="h-3.5 w-3.5 stroke-[1.7]" />Income</Button><Button variant="ghost" size="sm" onClick={() => setDraft((current) => ({ ...current, kind: "expense", category: current.category === "Client work" ? "Software" : current.category }))} aria-pressed={draft.kind === "expense"} className={cn("flex-1 gap-1.5", draft.kind === "expense" ? "bg-bg text-text hover:bg-bg" : "text-text-muted")}><ExpenseIcon className="h-3.5 w-3.5 stroke-[1.7]" />Expense</Button></div>
          <Field label={draft.kind === "income" ? "Income from" : "What did you pay for?"}><Input autoFocus value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder={draft.kind === "income" ? "e.g. Northstar Coffee invoice" : "e.g. Domain renewal"} /></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Amount"><MoneyInput valueCents={draft.amountCents} onChange={(amountCents) => setDraft((current) => ({ ...current, amountCents }))} currency={currency} /></Field><Field label="Date"><Input type="date" value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} /></Field></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Category"><Input value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} placeholder={draft.kind === "income" ? "Client work" : "Software"} /></Field><Field label="Project link" optional><Select value={draft.projectId ?? ""} onValueChange={(projectId) => setDraft((current) => ({ ...current, projectId: projectId || undefined }))}><option value="">Not linked</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select></Field></div>
          <Field label="Notes" optional><textarea value={draft.notes ?? ""} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Invoice, receipt, or context" rows={3} className="min-h-20 w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm leading-5 text-text outline-none placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/15" /></Field>
        </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 border-t border-border bg-bg px-4 py-3 sm:px-5">{!isNew && <Button variant="ghost" size="sm" onClick={() => onArchive(draft.id)} className="mr-auto text-text-muted">Archive</Button>}<Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" disabled={!draft.title.trim() || draft.amountCents <= 0 || !draft.date} onClick={() => onSave(draft)}>{isNew ? "Add record" : "Save changes"}</Button></div>
    </aside>
  );
}
