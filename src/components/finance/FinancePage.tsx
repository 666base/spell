import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
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
  AMOUNT_FILTERS,
  TRANSACTION_PAGE_SIZE,
  cadenceLabel,
  categoryLabel,
  currentMonthKey,
  dueLabel,
  dueSubscriptions,
  filterTransactions,
  formatMoney,
  formatPercentChange,
  formatSignedMoney,
  isoDate,
  knownCategories,
  monthExpenses,
  monthIncome,
  monthNet,
  monthTitle,
  monthlyCost,
  pagerItems,
  parseCaptureLine,
  parseMoney,
  percentChange,
  postedInMonth,
  selectableMonths,
  shiftMonth,
  sortTransactions,
  spendingByCategory,
  uniqueCategories,
  type AmountFilter,
  type TransactionSortKey,
} from "../../lib/finance";
import { useKanbanWorkspace } from "../../context/KanbanWorkspaceContext";
import { cn } from "../../lib/utils";
import type { NotesScope } from "../../lib/notesScope";
import { NoteTitlebar } from "../layout/NoteTitlebar";
import {
  AnchoredPopover,
  AppPopover,
  Input,
  SegmentedControl,
  Select,
  SpellDateField,
} from "../ui";
import { ChevronDownIcon, MoreIcon, PlusIcon, SearchIcon } from "../icons/velocity";
import { CHECK_DRAW_MS, CheckmarkIcon } from "../ui/StateIcon";
import { CashFlowCard, CategoryCard, HeatmapCard, RecurringCard } from "./FinanceCharts";

const menuItemClass = "spell-menu-item cursor-pointer";

interface FinancePageProps {
  scope: NotesScope;
  sidebarVisible?: boolean;
  foldersVisible?: boolean;
  focusMode?: boolean;
  onToggleSidebar?: () => void;
  onNewNote?: () => void;
  showWindowControls?: boolean;
  hideTitleBar?: boolean;
}

export function FinancePage({
  scope,
  sidebarVisible = true,
  foldersVisible,
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
  const [month, setMonth] = useState(() => (
    scope.type === "moneyMonth" ? scope.month : currentMonthKey()
  ));
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [amountFilter, setAmountFilter] = useState<AmountFilter>("all");
  const [dayFilter, setDayFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<TransactionSortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const previousMonth = shiftMonth(month, -1);
  const projects = projectWorkspace.projects;
  const projectName = useCallback((projectId?: string) => {
    if (!projectId) return "";
    return projects.find((project) => project.id === projectId)?.name ?? "";
  }, [projects]);

  const posted = useMemo(() => postedInMonth(workspace, month), [month, workspace]);
  const dues = useMemo(
    () => (month === currentMonthKey() ? dueSubscriptions(workspace, month) : []),
    [month, workspace],
  );
  const subscriptions = useMemo(
    () => workspace.subscriptions.filter((subscription) => !subscription.archived)
      .sort((left, right) => left.nextBillingDate.localeCompare(right.nextBillingDate)),
    [workspace.subscriptions],
  );
  const net = monthNet(workspace, month);
  const income = monthIncome(workspace, month);
  const expenses = monthExpenses(workspace, month);
  const previousNet = monthNet(workspace, previousMonth);
  const previousIncome = monthIncome(workspace, previousMonth);
  const previousExpenses = monthExpenses(workspace, previousMonth);
  const monthlyBurn = useMemo(
    () => subscriptions.reduce((total, subscription) => total + monthlyCost(subscription), 0),
    [subscriptions],
  );
  const months = useMemo(() => selectableMonths(workspace, month), [month, workspace]);
  const dueIds = useMemo(() => new Set(dues.map((subscription) => subscription.id)), [dues]);
  const categories = useMemo(() => uniqueCategories(workspace), [workspace]);
  const categoryNames = useMemo(() => ({
    income: knownCategories(workspace, "income"),
    expense: knownCategories(workspace, "expense"),
  }), [workspace]);
  const filtered = useMemo(
    () => sortTransactions(
      filterTransactions(posted, categoryFilter, amountFilter, dayFilter, query),
      sortKey,
      sortDir,
    ),
    [amountFilter, categoryFilter, dayFilter, posted, query, sortDir, sortKey],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / TRANSACTION_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = filtered.slice(
    (currentPage - 1) * TRANSACTION_PAGE_SIZE,
    currentPage * TRANSACTION_PAGE_SIZE,
  );
  const categorySpend = useMemo(() => spendingByCategory(workspace, month), [month, workspace]);
  const showTable = posted.length > 0
    || query.trim() !== ""
    || categoryFilter !== "all"
    || amountFilter !== "all"
    || dayFilter !== null;

  const selectMonth = useCallback((next: string) => {
    setMonth(next);
    setDayFilter(null);
    setPage(1);
  }, []);
  const toggleCategory = useCallback((name: string) => {
    setCategoryFilter((current) => current === name ? "all" : name);
    setPage(1);
  }, []);
  const toggleAmount = useCallback((next: AmountFilter) => {
    setAmountFilter((current) => current === next ? "all" : next);
    setPage(1);
  }, []);
  const toggleDay = useCallback((date: string) => {
    setMonth(date.slice(0, 7));
    setDayFilter((current) => current === date ? null : date);
    setPage(1);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [amountFilter, categoryFilter, dayFilter, month, query]);

  const toggleSort = useCallback((key: TransactionSortKey) => {
    setSortKey((current) => {
      if (current === key) {
        setSortDir((direction) => direction === "asc" ? "desc" : "asc");
        return current;
      }
      setSortDir(key === "title" || key === "category" ? "asc" : "desc");
      return key;
    });
  }, []);

  useEffect(() => {
    const onMonth = (event: Event) => {
      const next = (event as CustomEvent<string>).detail;
      if (next) selectMonth(next);
    };
    window.addEventListener("create-new-month", onMonth);
    return () => window.removeEventListener("create-new-month", onMonth);
  }, [selectMonth]);

  const pageTitle = "Money";

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
    const draft = {
      ...createFinanceTransaction("expense"),
      title: parsed.title,
      amountCents: parsed.amountCents ?? 0,
      date: month === currentMonthKey() ? isoDate() : dayFilter ?? `${month}-01`,
    };
    if (parsed.amountCents && parsed.amountCents > 0) saveTransaction(draft);
    else openTransactionEditor(draft);
  }, [dayFilter, month, openTransactionEditor, saveTransaction]);

  useEffect(() => {
    const onRecord = () => {
      openTransactionEditor({
        ...createFinanceTransaction("expense"),
        date: dayFilter ?? (month === currentMonthKey() ? isoDate() : `${month}-01`),
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
  }, [dayFilter, month, openSubscriptionEditor, openTransactionEditor]);

  const titlebar = (
    <NoteTitlebar
      sidebarVisible={sidebarVisible}
      foldersVisible={foldersVisible}
      focusMode={focusMode}
      onToggleSidebar={onToggleSidebar}
      onNewNote={onNewNote}
      showWindowControls={showWindowControls}
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

  const content = (
    <>
      <div className="money-toolbar">
        <Select
          aria-label="Month"
          value={month}
          onValueChange={selectMonth}
          className="money-filter"
        >
          {months.map((value) => (
            <option key={value} value={value}>{monthTitle(value)}</option>
          ))}
        </Select>
        <button
          type="button"
          className="money-toolbar-add"
          onClick={() => window.dispatchEvent(new CustomEvent("create-money-record"))}
        >
          Add transaction
        </button>
      </div>
      <MoneyKpis
        currency={workspace.currency}
        net={net}
        income={income}
        expenses={expenses}
        subscriptions={monthlyBurn}
        netChange={percentChange(net, previousNet)}
        incomeChange={percentChange(income, previousIncome)}
        expensesChange={percentChange(expenses, previousExpenses)}
        amountFilter={amountFilter}
        onSelectAmount={toggleAmount}
        onOpenSubscriptions={() => {
          if (subscriptions.length === 0) {
            openSubscriptionEditor(createFinanceSubscription());
            return;
          }
          document.getElementById("money-subscriptions")?.scrollIntoView({ block: "nearest" });
        }}
      />
      <div className="money-insights">
        <CashFlowCard
          workspace={workspace}
          month={month}
          currency={workspace.currency}
          onSelectCategory={toggleCategory}
        />
        <CategoryCard
          slices={categorySpend}
          currency={workspace.currency}
          total={expenses}
          change={percentChange(expenses, previousExpenses)}
          selected={categoryFilter}
          onSelect={toggleCategory}
        />
        <RecurringCard
          workspace={workspace}
          currency={workspace.currency}
          burn={monthlyBurn}
          onSelect={(id) => {
            const subscription = subscriptions.find((item) => item.id === id);
            if (subscription) openSubscriptionEditor(subscription);
          }}
          onAdd={() => openSubscriptionEditor(createFinanceSubscription())}
        />
        <HeatmapCard
          workspace={workspace}
          currency={workspace.currency}
          selectedDay={dayFilter}
          onSelectDay={toggleDay}
        />
      </div>
      {subscriptions.length > 0 && (
      <MoneyGroup title="Subscriptions" id="money-subscriptions">
        {subscriptions.map((subscription) => (
          dueIds.has(subscription.id) ? (
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
          ) : (
            <SubscriptionRow
              key={subscription.id}
              subscription={subscription}
              currency={workspace.currency}
              onOpen={() => openSubscriptionEditor(subscription)}
              onDuplicate={() => duplicateSubscription(subscription.id)}
              onArchive={() => archiveSubscription(subscription.id, true)}
              onDelete={() => deleteSubscription(subscription.id)}
            />
          )
        ))}
      </MoneyGroup>
      )}
      {showTable && (
      <MoneyGroup table>
        <TransactionToolbar
          count={filtered.length}
          query={query}
          categories={categories}
          category={categoryFilter}
          amount={amountFilter}
          day={dayFilter}
          onQuery={(value) => {
            setQuery(value);
            setPage(1);
          }}
          onCategory={(value) => {
            setCategoryFilter(value);
            setPage(1);
          }}
          onAmount={(value) => {
            setAmountFilter(value);
            setPage(1);
          }}
          onClearDay={() => setDayFilter(null)}
        />
        {filtered.length === 0 ? (
          <p className="money-table-empty">No matching records</p>
        ) : (
          <>
            <div className="money-table-head">
              <SortButton label="Transaction" active={sortKey === "title"} direction={sortDir} onClick={() => toggleSort("title")} />
              <SortButton label="Category" active={sortKey === "category"} direction={sortDir} onClick={() => toggleSort("category")} />
              <SortButton label="Date" active={sortKey === "date"} direction={sortDir} onClick={() => toggleSort("date")} />
              <SortButton label="Amount" active={sortKey === "amount"} direction={sortDir} onClick={() => toggleSort("amount")} />
              <span className="money-table-actions-head">Actions</span>
            </div>
            {paged.map((transaction) => (
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
            {pageCount > 1 && (
              <Pager page={currentPage} pageCount={pageCount} onPage={setPage} />
            )}
          </>
        )}
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
          <div className="mobile-money is-dashboard">
            {content}
            <div className="mobile-money-capture">{capture}</div>
          </div>
        ) : (
          <div className="money-page is-dashboard">
            <div className="money-page-inner is-wide">
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
            categories={categoryNames.expense}
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
            categories={categoryNames}
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

function MoneyKpis({
  currency,
  net,
  income,
  expenses,
  subscriptions,
  netChange,
  incomeChange,
  expensesChange,
  amountFilter,
  onSelectAmount,
  onOpenSubscriptions,
}: {
  currency: string;
  net: number;
  income: number;
  expenses: number;
  subscriptions: number;
  netChange: number | null;
  incomeChange: number | null;
  expensesChange: number | null;
  amountFilter: AmountFilter;
  onSelectAmount: (value: AmountFilter) => void;
  onOpenSubscriptions: () => void;
}) {
  return (
    <section className="money-kpis" aria-label="This month">
      <KpiCard label="Net" value={formatSignedMoney(net, currency)} change={netChange} />
      <KpiCard
        label="Income"
        value={formatMoney(income, currency)}
        change={incomeChange}
        pressed={amountFilter === "income"}
        onClick={() => onSelectAmount("income")}
      />
      <KpiCard
        label="Expenses"
        value={formatMoney(expenses, currency)}
        change={expensesChange}
        invertChange
        pressed={amountFilter === "expense"}
        onClick={() => onSelectAmount("expense")}
      />
      <KpiCard
        label="Subscriptions"
        value={formatMoney(subscriptions, currency)}
        onClick={onOpenSubscriptions}
      />
    </section>
  );
}

function KpiCard({
  label,
  value,
  change,
  invertChange = false,
  pressed = false,
  onClick,
}: {
  label: string;
  value: string;
  change?: number | null;
  invertChange?: boolean;
  pressed?: boolean;
  onClick?: () => void;
}) {
  const tone = change == null || change === 0
    ? "flat"
    : (invertChange ? change < 0 : change > 0) ? "up" : "down";
  const inner = (
    <>
      <p className="money-kpi-label">{label}</p>
      <p className="money-kpi-value">{value}</p>
      {change != null && (
        <p className={cn("money-kpi-delta", `is-${tone}`)}>
          {formatPercentChange(change)}
        </p>
      )}
    </>
  );
  if (!onClick) return <article className="money-kpi">{inner}</article>;
  return (
    <button
      type="button"
      className={cn("money-kpi", pressed && "is-pressed")}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {inner}
    </button>
  );
}

function TransactionToolbar({
  count,
  query,
  categories,
  category,
  amount,
  day,
  onQuery,
  onCategory,
  onAmount,
  onClearDay,
}: {
  count: number;
  query: string;
  categories: string[];
  category: string;
  amount: AmountFilter;
  day: string | null;
  onQuery: (value: string) => void;
  onCategory: (value: string) => void;
  onAmount: (value: AmountFilter) => void;
  onClearDay: () => void;
}) {
  return (
    <div className="money-table-toolbar">
      <div className="money-table-count">
        <p className="money-kpi-label">Total results</p>
        <p className="money-table-count-value">
          {count} {count === 1 ? "transaction" : "transactions"}
          {day ? ` · ${day}` : ""}
        </p>
      </div>
      <div className="money-table-filters">
        <label className="money-table-search">
          <SearchIcon className="money-table-search-icon" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search transactions"
          />
        </label>
        {day && (
          <button type="button" className="money-pager-btn" onClick={onClearDay}>
            Clear day
          </button>
        )}
        <Select
          aria-label="All categories"
          value={category}
          onValueChange={onCategory}
          className="money-filter"
        >
          <option value="all">All categories</option>
          {categories.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </Select>
        <Select
          aria-label="All amounts"
          value={amount}
          onValueChange={(value) => onAmount(value as AmountFilter)}
          className="money-filter"
        >
          {AMOUNT_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
      </div>
    </div>
  );
}

function SortButton({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn("money-table-sort", active && "is-active")}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
      {active ? (direction === "asc" ? " ↑" : " ↓") : ""}
    </button>
  );
}

function Pager({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}) {
  return (
    <nav className="money-pager" aria-label="Transactions">
      <button type="button" className="money-pager-btn" disabled={page === 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      {pagerItems(page, pageCount).map((item, index) => (
        item === "gap" ? (
          <span key={`gap-${index}`} className="money-pager-gap">…</span>
        ) : (
          <button
            key={item}
            type="button"
            className={cn("money-pager-btn", item === page && "is-current")}
            aria-current={item === page ? "page" : undefined}
            onClick={() => onPage(item)}
          >
            {item}
          </button>
        )
      ))}
      <button type="button" className="money-pager-btn" disabled={page === pageCount} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </nav>
  );
}

function MoneyGroup({ title, table = false, id, children }: { title?: string; table?: boolean; id?: string; children: ReactNode }) {
  return (
    <section className="money-group" id={id}>
      {title && <h2 className="money-group-title">{title}</h2>}
      <div className={cn("money-group-card", table && "money-table")}>{children}</div>
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
          <CheckmarkIcon checked={checked} className="size-3.5" />
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
  const category = categoryLabel(transaction.category);
  const meta = [dateLabel, category !== "Uncategorized" ? category : "", projectName].filter(Boolean).join(" · ");

  return (
    <RowMenu
      items={[
        { label: "Duplicate", onSelect: onDuplicate },
        { label: "Delete", onSelect: onDelete, danger: true },
      ]}
    >
      <div className="money-row money-table-row">
        <button type="button" className="money-table-hit" onClick={onOpen} aria-label={transaction.title} />
        <span className="money-row-main">
          <span className="money-row-title">{transaction.title}</span>
          <span className="money-row-meta">{meta}</span>
        </span>
        <span className="money-table-category">{category}</span>
        <span className="money-table-date">{dateLabel}</span>
        <span className={cn("money-row-amount", transaction.kind === "income" && "is-income")}>
          {amount}
        </span>
        <RowActions
          items={[
            { label: "Duplicate", onSelect: onDuplicate },
            { label: "Delete", onSelect: onDelete, danger: true },
          ]}
        />
      </div>
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

function RowActions({
  items,
}: {
  items: { label: string; onSelect: () => void; danger?: boolean }[];
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="money-row-actions" aria-label="Actions">
          <MoreIcon className="size-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="spell-menu z-50 min-w-40" align="end" sideOffset={6}>
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.label}
              className={cn(menuItemClass, item.danger && "spell-menu-item-danger")}
              onSelect={item.onSelect}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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

function CategoryField({
  value,
  categories,
  onChange,
  placeholder,
}: {
  value: string;
  categories: readonly string[];
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const listId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const names = useMemo(
    () => [...new Set(categories.map((name) => name.trim()).filter(Boolean))],
    [categories],
  );
  const query = value.trim();
  const needle = query.toLowerCase();
  const matches = names.filter((name) => name.toLowerCase().includes(needle));
  const exact = names.some((name) => name.toLowerCase() === needle);
  const canCreate = query.length > 0 && !exact;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  const choose = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  return (
    <div ref={anchorRef} className="relative">
      <Input
        value={value}
        role="combobox"
        aria-label="Category"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        className="h-9 pr-9"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
      />
      <ChevronDownIcon
        className={cn(
          "spell-select-chevron pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 stroke-[1.7] text-text-muted",
          open && "rotate-180",
        )}
        aria-hidden="true"
      />
      <AnchoredPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        align="start"
        origin="top left"
        className="spell-menu max-h-56 min-w-56 overflow-y-auto p-1"
      >
        <ul id={listId} role="listbox" aria-label="Categories">
          {matches.map((name) => (
            <li key={name}>
              <button
                type="button"
                role="option"
                aria-selected={name === value}
                className="spell-menu-item spell-select-option w-full"
                onClick={() => choose(name)}
              >
                <span className="min-w-0 flex-1 truncate">{name}</span>
                <CheckmarkIcon checked={name === value} className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {canCreate && (
            <li>
              <button
                type="button"
                className="spell-menu-item spell-select-option w-full"
                onClick={() => choose(query)}
              >
                Create “{query}”
              </button>
            </li>
          )}
          {matches.length === 0 && !canCreate && (
            <li className="px-2 py-1.5 text-[13px] text-text-muted">
              Type to create a category
            </li>
          )}
        </ul>
      </AnchoredPopover>
    </div>
  );
}

function MoneyInput({ valueCents, onChange, currency }: { valueCents: number; onChange: (amountCents: number) => void; currency: string }) {
  const [value, setValue] = useState(valueCents ? String(valueCents / 100) : "");
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    setValue(valueCents ? String(valueCents / 100) : "");
  }, [valueCents]);

  return (
    <div className="relative">
      <Input
        type="text"
        inputMode="decimal"
        value={value}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          setValue(valueCents ? String(valueCents / 100) : "");
        }}
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
  categories,
  projects,
  onClose,
  onSave,
  onArchive,
  onDelete,
}: {
  subscription: FinanceSubscription;
  currency: string;
  categories: readonly string[];
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
          <CategoryField
            value={draft.category}
            categories={categories}
            placeholder="What for"
            onChange={(category) => setDraft((current) => ({ ...current, category }))}
          />
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
  categories,
  projects,
  onClose,
  onSave,
  onDelete,
}: {
  transaction: FinanceTransaction;
  currency: string;
  categories: { income: readonly string[]; expense: readonly string[] };
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
      <div className="mb-3">
        <SegmentedControl
          ariaLabel="Record type"
          value={draft.kind}
          options={[
            { value: "income", label: "Income" },
            { value: "expense", label: "Expense" },
          ]}
          onChange={(kind) => setDraft((current) => ({ ...current, kind }))}
        />
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
          <CategoryField
            value={draft.category}
            categories={categories[draft.kind]}
            placeholder={draft.kind === "income" ? "Where from" : "What for"}
            onChange={(category) => setDraft((current) => ({ ...current, category }))}
          />
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
