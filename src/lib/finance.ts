import type { FinanceSubscription, FinanceTransactionKind, FinanceWorkspace } from "../types/note";

export function isoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function currentMonthKey(date = new Date()) {
  return isoDate(date).slice(0, 7);
}

export function monthKey(value: Date | string = new Date()) {
  if (typeof value === "string") return value.slice(0, 7);
  return currentMonthKey(value);
}

export function monthTitle(month: string) {
  const date = new Date(`${month}-01T12:00:00`);
  if (Number.isNaN(date.valueOf())) return month;
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function formatMoney(amountCents: number, currency: string) {
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

export function formatSignedMoney(amountCents: number, currency: string) {
  const formatted = formatMoney(Math.abs(amountCents), currency);
  if (amountCents > 0) return `+${formatted}`;
  if (amountCents < 0) return `−${formatted}`;
  return formatted;
}

export function parseMoney(value: string) {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : 0;
}

export function parseCaptureLine(input: string): { title: string; amountCents: number | null } {
  const trimmed = input.trim();
  if (!trimmed) return { title: "", amountCents: null };
  const match = trimmed.match(/^(.*?)(?:\s+)([+-]?\d+(?:[.,]\d{1,2})?)$/);
  if (!match) return { title: trimmed, amountCents: null };
  const title = match[1].trim();
  const amountCents = parseMoney(match[2]);
  if (!title || amountCents <= 0) return { title: trimmed, amountCents: null };
  return { title, amountCents };
}

export function activeTransactions(workspace: FinanceWorkspace) {
  return workspace.transactions.filter((transaction) => !transaction.archived);
}

export function activeSubscriptions(workspace: FinanceWorkspace) {
  return workspace.subscriptions.filter((subscription) => !subscription.archived);
}

export function monthlyCost(subscription: FinanceSubscription) {
  if (subscription.cadence === "monthly") return subscription.amountCents;
  if (subscription.cadence === "yearly") return Math.round(subscription.amountCents / 12);
  return Math.round(subscription.amountCents / Math.max(1, subscription.customIntervalDays ?? 30) * 30.4375);
}

export function postedInMonth(workspace: FinanceWorkspace, month: string) {
  return activeTransactions(workspace)
    .filter((transaction) => transaction.date.startsWith(month))
    .sort((left, right) => right.date.localeCompare(left.date) || right.updatedAt - left.updatedAt);
}

export function monthNet(workspace: FinanceWorkspace, month: string) {
  return postedInMonth(workspace, month).reduce((total, transaction) => {
    return total + (transaction.kind === "income" ? transaction.amountCents : -transaction.amountCents);
  }, 0);
}

export function monthListSubtitle(workspace: FinanceWorkspace, month: string) {
  if (postedInMonth(workspace, month).length === 0) return "Empty";
  return formatSignedMoney(monthNet(workspace, month), workspace.currency);
}

export function subscriptionsSubtitle(workspace: FinanceWorkspace) {
  const subscriptions = activeSubscriptions(workspace);
  if (subscriptions.length === 0) return "None";
  const monthly = subscriptions.reduce((total, subscription) => total + monthlyCost(subscription), 0);
  return `${subscriptions.length} · ${formatMoney(monthly, workspace.currency)} / mo`;
}

function lastDayOfMonth(month: string) {
  const date = new Date(`${month}-01T12:00:00`);
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  return isoDate(date);
}

export function hasPostedCharge(workspace: FinanceWorkspace, subscription: FinanceSubscription, month: string) {
  return postedInMonth(workspace, month).some((transaction) => {
    if (transaction.kind !== "expense") return false;
    if (transaction.subscriptionId === subscription.id) return true;
    return (
      !transaction.subscriptionId &&
      transaction.title === subscription.name &&
      transaction.amountCents === subscription.amountCents
    );
  });
}

export function dueSubscriptions(workspace: FinanceWorkspace, month: string) {
  const lastDay = lastDayOfMonth(month);
  return activeSubscriptions(workspace)
    .filter((subscription) => subscription.nextBillingDate <= lastDay)
    .filter((subscription) => !hasPostedCharge(workspace, subscription, month))
    .sort((left, right) => left.nextBillingDate.localeCompare(right.nextBillingDate));
}

export function isMonthKey(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function historyMonths(workspace: FinanceWorkspace) {
  const current = currentMonthKey();
  const months = new Set<string>();
  for (const month of workspace.months ?? []) {
    if (isMonthKey(month) && month !== current) months.add(month);
  }
  for (const transaction of activeTransactions(workspace)) {
    const month = monthKey(transaction.date);
    if (month && month !== current) months.add(month);
  }
  return [...months].sort((left, right) => right.localeCompare(left));
}

export function monthIncome(workspace: FinanceWorkspace, month: string) {
  return postedInMonth(workspace, month)
    .filter((transaction) => transaction.kind === "income")
    .reduce((total, transaction) => total + transaction.amountCents, 0);
}

export function monthExpenses(workspace: FinanceWorkspace, month: string) {
  return postedInMonth(workspace, month)
    .filter((transaction) => transaction.kind === "expense")
    .reduce((total, transaction) => total + transaction.amountCents, 0);
}

export function recentTransactions(workspace: FinanceWorkspace, limit = 8) {
  return listedTransactions(workspace).slice(0, limit);
}

export function listedTransactions(workspace: FinanceWorkspace) {
  return activeTransactions(workspace)
    .slice()
    .sort((left, right) => right.date.localeCompare(left.date) || right.updatedAt - left.updatedAt);
}

export function shiftMonth(month: string, delta: number) {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(year, (monthIndex || 1) - 1 + delta, 1);
  return currentMonthKey(date);
}

export function percentChange(current: number, previous: number) {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function formatPercentChange(value: number | null) {
  if (value === null) return "—";
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded)}%`;
}

export const CHART_COLORS = [
  "var(--status-blue-fg)",
  "var(--status-green-fg)",
  "var(--status-orange-fg)",
  "var(--status-purple-fg)",
  "var(--status-pink-fg)",
  "var(--status-yellow-fg)",
  "var(--status-brown-fg)",
  "var(--status-red-fg)",
];

export const SANKEY_SAVED_ID = "saved";
export const SANKEY_BALANCE_ID = "balance";
export const SANKEY_HEIGHT = 240;
export const SANKEY_NODE_WIDTH = 10;

export type SankeySide = "source" | "target";

export interface SankeyNode {
  id: string;
  name: string;
  side: SankeySide;
  amountCents: number;
  color: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  amountCents: number;
}

export interface CashFlowSankey {
  nodes: SankeyNode[];
  links: SankeyLink[];
  income: number;
  expenses: number;
}

export function incomeBySource(workspace: FinanceWorkspace, month: string) {
  const totals = new Map<string, number>();
  for (const transaction of postedInMonth(workspace, month)) {
    if (transaction.kind !== "income") continue;
    const category = categoryLabel(transaction.category);
    const name = category === "Uncategorized"
      ? (transaction.title.trim() || "Income")
      : category;
    totals.set(name, (totals.get(name) ?? 0) + transaction.amountCents);
  }
  return [...totals.entries()]
    .map(([name, amountCents]) => ({ name, amountCents }))
    .sort((left, right) => right.amountCents - left.amountCents || left.name.localeCompare(right.name));
}

export function collapseNamedTotals(
  items: { name: string; amountCents: number }[],
  limit: number,
) {
  if (items.length <= limit) return items;
  const head = items.slice(0, Math.max(1, limit - 1));
  const rest = items.slice(head.length).reduce((total, item) => total + item.amountCents, 0);
  const otherAt = head.findIndex((item) => item.name === "Other");
  if (otherAt >= 0) {
    return head.map((item, index) => (
      index === otherAt ? { ...item, amountCents: item.amountCents + rest } : item
    ));
  }
  return [...head, { name: "Other", amountCents: rest }];
}

export function cashFlowSankey(
  workspace: FinanceWorkspace,
  month: string,
  sourceLimit = 4,
  sinkLimit = 5,
): CashFlowSankey {
  const income = monthIncome(workspace, month);
  const expenses = monthExpenses(workspace, month);
  if (income <= 0 && expenses <= 0) {
    return { nodes: [], links: [], income, expenses };
  }

  const sources: SankeyNode[] = collapseNamedTotals(incomeBySource(workspace, month), sourceLimit)
    .map((item, index) => ({
      id: `source:${item.name}`,
      name: item.name,
      side: "source" as const,
      amountCents: item.amountCents,
      color: CHART_COLORS[index % CHART_COLORS.length],
    }));
  const sinks: SankeyNode[] = collapseNamedTotals(spendingByCategory(workspace, month), sinkLimit)
    .map((item) => ({
      id: `target:${item.name}`,
      name: item.name,
      side: "target" as const,
      amountCents: item.amountCents,
      color: "var(--color-bg-emphasis)",
    }));

  if (income > expenses) {
    sinks.push({
      id: SANKEY_SAVED_ID,
      name: "Saved",
      side: "target",
      amountCents: income - expenses,
      color: "var(--color-bg-emphasis)",
    });
  } else if (expenses > income) {
    sources.push({
      id: SANKEY_BALANCE_ID,
      name: "Balance",
      side: "source",
      amountCents: expenses - income,
      color: CHART_COLORS[sources.length % CHART_COLORS.length],
    });
  }

  return {
    nodes: [...sources, ...sinks],
    links: allocateSankeyLinks(sources, sinks),
    income,
    expenses,
  };
}

function allocateSankeyLinks(sources: SankeyNode[], sinks: SankeyNode[]): SankeyLink[] {
  const sinkTotal = sinks.reduce((total, sink) => total + sink.amountCents, 0);
  if (sinkTotal <= 0 || sources.length === 0 || sinks.length === 0) return [];
  const links: SankeyLink[] = [];
  for (const source of sources) {
    let used = 0;
    sinks.forEach((sink, index) => {
      const amountCents = index === sinks.length - 1
        ? Math.max(0, source.amountCents - used)
        : Math.round(source.amountCents * (sink.amountCents / sinkTotal));
      used += amountCents;
      if (amountCents > 0) {
        links.push({ source: source.id, target: sink.id, amountCents });
      }
    });
  }
  return links;
}

export interface LaidSankeyNode extends SankeyNode {
  x: number;
  y: number;
  width: number;
  height: number;
  share: number;
}

export interface LaidSankeyLink extends SankeyLink {
  color: string;
  d: string;
}

export function layoutSankey(
  chart: CashFlowSankey,
  width: number,
  height = SANKEY_HEIGHT,
) {
  const sources = chart.nodes.filter((node) => node.side === "source");
  const sinks = chart.nodes.filter((node) => node.side === "target");
  const labelCol = Math.min(128, Math.max(72, width * 0.16));
  const gap = 12;
  const usable = Math.max(48, height - gap * Math.max(0, Math.max(sources.length, sinks.length) - 1));
  const peak = Math.max(
    1,
    sources.reduce((total, node) => total + node.amountCents, 0),
    sinks.reduce((total, node) => total + node.amountCents, 0),
  );
  const sinkTotal = sinks.reduce((total, node) => total + node.amountCents, 0);

  const stack = (items: SankeyNode[], x: number): LaidSankeyNode[] => {
    const heights = items.map((item) => Math.max(18, (item.amountCents / peak) * usable));
    const sum = heights.reduce((total, value) => total + value, 0);
    const scale = sum > usable ? usable / sum : 1;
    let y = 0;
    return items.map((item, index) => {
      const nodeHeight = heights[index] * scale;
      const node = {
        ...item,
        x,
        y,
        width: SANKEY_NODE_WIDTH,
        height: nodeHeight,
        share: sinkTotal > 0 && item.side === "target" ? item.amountCents / sinkTotal : 0,
      };
      y += nodeHeight + gap;
      return node;
    });
  };

  const leftX = labelCol;
  const rightX = Math.max(leftX + 48, width - labelCol - SANKEY_NODE_WIDTH);
  const laidSources = stack(sources, leftX);
  const laidSinks = stack(sinks, rightX);
  const byId = new Map([...laidSources, ...laidSinks].map((node) => [node.id, node]));
  const sourceOffset = new Map(laidSources.map((node) => [node.id, 0]));
  const sinkOffset = new Map(laidSinks.map((node) => [node.id, 0]));
  const links: LaidSankeyLink[] = [];

  for (const source of laidSources) {
    const outgoing = chart.links.filter((link) => link.source === source.id);
    for (const link of outgoing) {
      const target = byId.get(link.target);
      if (!target) continue;
      const thickness = source.amountCents > 0
        ? source.height * (link.amountCents / source.amountCents)
        : 0;
      const y0 = source.y + (sourceOffset.get(source.id) ?? 0);
      const y1 = target.y + (sinkOffset.get(target.id) ?? 0);
      sourceOffset.set(source.id, (sourceOffset.get(source.id) ?? 0) + thickness);
      sinkOffset.set(target.id, (sinkOffset.get(target.id) ?? 0) + thickness);
      const x0 = source.x + source.width;
      const x1 = target.x;
      const mid = (x0 + x1) / 2;
      links.push({
        ...link,
        color: source.color,
        d: [
          `M${x0},${y0}`,
          `C${mid},${y0} ${mid},${y1} ${x1},${y1}`,
          `L${x1},${y1 + thickness}`,
          `C${mid},${y1 + thickness} ${mid},${y0 + thickness} ${x0},${y0 + thickness}`,
          "Z",
        ].join(" "),
      });
    }
  }

  return { nodes: [...laidSources, ...laidSinks], links, labelCol };
}

export function formatShare(amountCents: number, total: number) {
  if (total <= 0 || amountCents <= 0) return "0%";
  return `${Math.round((amountCents / total) * 100)}%`;
}

export interface ScatterPoint {
  id: string;
  name: string;
  category: string;
  x: number;
  y: number;
  z: number;
}

export function daysUntil(date: string, from = new Date()) {
  const today = new Date(from);
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${date}T12:00:00`);
  due.setHours(0, 0, 0, 0);
  if (Number.isNaN(due.valueOf())) return 0;
  return Math.round((due.valueOf() - today.valueOf()) / 86_400_000);
}

export function recurringScatter(workspace: FinanceWorkspace, today = new Date()): ScatterPoint[] {
  return activeSubscriptions(workspace).map((subscription) => ({
    id: subscription.id,
    name: subscription.name,
    category: categoryLabel(subscription.category),
    x: daysUntil(subscription.nextBillingDate, today),
    y: monthlyCost(subscription),
    z: subscription.amountCents,
  }));
}

export function layoutScatter(
  points: ScatterPoint[],
  width: number,
  height: number,
) {
  const pad = { left: 44, right: 18, top: 14, bottom: 28 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const zs = points.map((point) => point.z);
  const xMin = Math.min(-7, ...xs, 0);
  const xMax = Math.max(30, ...xs, 1);
  const yMax = Math.max(1, ...ys) * 1.15;
  const zMax = Math.max(1, ...zs);
  const innerW = Math.max(1, width - pad.left - pad.right);
  const innerH = Math.max(1, height - pad.top - pad.bottom);
  const xAt = (value: number) => pad.left + ((value - xMin) / (xMax - xMin)) * innerW;
  const yAt = (value: number) => pad.top + innerH - (value / yMax) * innerH;
  const rAt = (value: number) => 6 + (value / zMax) * 14;
  const xTicks = [xMin, 0, xMax].filter((value, index, all) => all.indexOf(value) === index);
  const yTicks = [0, yMax / 2, yMax];
  return {
    pad,
    xMin,
    xMax,
    yMax,
    xTicks: xTicks.map((value) => ({ value, x: xAt(value) })),
    yTicks: yTicks.map((value) => ({ value, y: yAt(value) })),
    points: points.map((point) => ({
      ...point,
      cx: xAt(point.x),
      cy: yAt(point.y),
      r: rAt(point.z),
    })),
  };
}

export function heatmapWeekLabels(weeks = 12) {
  return Array.from({ length: weeks }, (_, index) => ({
    index,
    label: index % 2 === 0 ? `W${index + 1}` : "",
  }));
}

export function heatmapSummary(
  workspace: FinanceWorkspace,
  weeks = 12,
  today = new Date(),
) {
  const current = spendingHeatmap(workspace, weeks, today);
  const priorFrom = new Date(today);
  priorFrom.setDate(priorFrom.getDate() - weeks * 7);
  const previous = spendingHeatmap(workspace, weeks, priorFrom);
  const total = current.reduce((sum, cell) => sum + cell.amountCents, 0);
  const previousTotal = previous.reduce((sum, cell) => sum + cell.amountCents, 0);
  return { cells: current, total, change: percentChange(total, previousTotal) };
}

export type TransactionSortKey = "title" | "category" | "date" | "amount";

export function matchesQuery(
  transaction: ReturnType<typeof listedTransactions>[number],
  query: string,
) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    transaction.title.toLowerCase().includes(needle)
    || categoryLabel(transaction.category).toLowerCase().includes(needle)
    || (transaction.notes ?? "").toLowerCase().includes(needle)
  );
}

export function sortTransactions(
  transactions: ReturnType<typeof listedTransactions>,
  key: TransactionSortKey,
  direction: "asc" | "desc",
) {
  const dir = direction === "asc" ? 1 : -1;
  return transactions.slice().sort((left, right) => {
    const cmp = key === "title"
      ? left.title.localeCompare(right.title)
      : key === "category"
        ? categoryLabel(left.category).localeCompare(categoryLabel(right.category))
        : key === "amount"
          ? left.amountCents - right.amountCents
          : left.date.localeCompare(right.date) || left.updatedAt - right.updatedAt;
    return cmp * dir || right.updatedAt - left.updatedAt;
  });
}

export function pagerItems(page: number, pageCount: number): Array<number | "gap"> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const shown = new Set([1, pageCount, page, page - 1, page + 1]);
  if (page <= 3) [2, 3, 4, 5].forEach((value) => shown.add(value));
  if (page >= pageCount - 2) {
    [pageCount - 1, pageCount - 2, pageCount - 3, pageCount - 4].forEach((value) => shown.add(value));
  }
  const nums = [...shown].filter((value) => value >= 1 && value <= pageCount).sort((left, right) => left - right);
  const items: Array<number | "gap"> = [];
  for (const value of nums) {
    const last = items[items.length - 1];
    if (typeof last === "number" && value - last > 1) items.push("gap");
    items.push(value);
  }
  return items;
}

export function categoryLabel(category: string) {
  const trimmed = category.trim();
  return trimmed || "Uncategorized";
}

export function spendingByCategory(workspace: FinanceWorkspace, month: string) {
  const totals = new Map<string, number>();
  for (const transaction of postedInMonth(workspace, month)) {
    if (transaction.kind !== "expense") continue;
    const name = categoryLabel(transaction.category);
    totals.set(name, (totals.get(name) ?? 0) + transaction.amountCents);
  }
  return [...totals.entries()]
    .map(([name, amountCents]) => ({ name, amountCents }))
    .sort((left, right) => right.amountCents - left.amountCents || left.name.localeCompare(right.name));
}

export function uniqueCategories(workspace: FinanceWorkspace) {
  const names = new Set<string>();
  for (const transaction of activeTransactions(workspace)) {
    names.add(categoryLabel(transaction.category));
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

export function knownCategories(workspace: FinanceWorkspace, kind?: FinanceTransactionKind) {
  const names = new Set<string>();
  const add = (value: string) => {
    const name = value.trim();
    if (name) names.add(name);
  };
  for (const transaction of activeTransactions(workspace)) {
    if (kind && transaction.kind !== kind) continue;
    add(transaction.category);
  }
  if (kind !== "income") {
    for (const subscription of activeSubscriptions(workspace)) {
      add(subscription.category);
    }
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

export const TRANSACTION_PAGE_SIZE = 10;

export function selectableMonths(workspace: FinanceWorkspace, selected = currentMonthKey()) {
  const months = new Set<string>([currentMonthKey(), selected, ...historyMonths(workspace)]);
  for (let index = 0; index < 6; index += 1) {
    months.add(shiftMonth(selected, -index));
  }
  return [...months].sort((left, right) => right.localeCompare(left));
}

export type AmountFilter = "all" | "income" | "expense" | "under50" | "mid" | "over500";

export const AMOUNT_FILTERS: { value: AmountFilter; label: string }[] = [
  { value: "all", label: "All amounts" },
  { value: "income", label: "Income only" },
  { value: "expense", label: "Expenses only" },
  { value: "under50", label: "Under 50" },
  { value: "mid", label: "50 – 500" },
  { value: "over500", label: "Over 500" },
];

export function matchesAmountFilter(amountCents: number, kind: "income" | "expense", filter: AmountFilter) {
  if (filter === "all") return true;
  if (filter === "income") return kind === "income";
  if (filter === "expense") return kind === "expense";
  if (filter === "under50") return amountCents < 5_000;
  if (filter === "mid") return amountCents >= 5_000 && amountCents <= 50_000;
  return amountCents > 50_000;
}

export function filterTransactions(
  transactions: ReturnType<typeof listedTransactions>,
  category: string,
  amount: AmountFilter,
  day?: string | null,
  query = "",
) {
  return transactions.filter((transaction) => {
    if (day && transaction.date !== day) return false;
    if (category !== "all" && categoryLabel(transaction.category) !== category) return false;
    if (!matchesAmountFilter(transaction.amountCents, transaction.kind, amount)) return false;
    return matchesQuery(transaction, query);
  });
}

function startOfWeekMonday(date: Date) {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  const day = next.getDay();
  next.setDate(next.getDate() + (day === 0 ? -6 : 1 - day));
  return next;
}

export function spendingHeatmap(workspace: FinanceWorkspace, weeks = 12, today = new Date()) {
  const totals = new Map<string, number>();
  for (const transaction of activeTransactions(workspace)) {
    if (transaction.kind !== "expense") continue;
    totals.set(transaction.date, (totals.get(transaction.date) ?? 0) + transaction.amountCents);
  }
  const weekStart = startOfWeekMonday(today);
  weekStart.setDate(weekStart.getDate() - (weeks - 1) * 7);
  return Array.from({ length: weeks * 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const key = isoDate(date);
    return { date: key, amountCents: totals.get(key) ?? 0 };
  });
}

export function overviewSubtitle(workspace: FinanceWorkspace) {
  return monthListSubtitle(workspace, currentMonthKey());
}

export type MoneyListItem =
  | { id: "overview"; kind: "overview"; title: string; subtitle: string }
  | { id: "subscriptions"; kind: "subscriptions"; title: string; subtitle: string }
  | { id: string; kind: "month"; month: string; title: string; subtitle: string };

export function moneyListItems(workspace: FinanceWorkspace): MoneyListItem[] {
  const current = currentMonthKey();
  return [
    {
      id: "overview",
      kind: "overview",
      title: "Overview",
      subtitle: overviewSubtitle(workspace),
    },
    {
      id: `month:${current}`,
      kind: "month",
      month: current,
      title: "This month",
      subtitle: monthListSubtitle(workspace, current),
    },
    {
      id: "subscriptions",
      kind: "subscriptions",
      title: "Subscriptions",
      subtitle: subscriptionsSubtitle(workspace),
    },
    ...historyMonths(workspace).map((month) => ({
      id: `month:${month}`,
      kind: "month" as const,
      month,
      title: monthTitle(month),
      subtitle: monthListSubtitle(workspace, month),
    })),
  ];
}

function stepBillingDate(date: string, subscription: FinanceSubscription) {
  const next = new Date(`${date}T12:00:00`);
  if (subscription.cadence === "yearly") {
    next.setFullYear(next.getFullYear() + 1);
  } else if (subscription.cadence === "custom") {
    next.setDate(next.getDate() + Math.max(1, subscription.customIntervalDays ?? 30));
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return isoDate(next);
}

export function advanceNextBillingDate(subscription: FinanceSubscription, from = new Date()) {
  const today = isoDate(from);
  let next = subscription.nextBillingDate;
  let guard = 0;
  while (next <= today && guard < 120) {
    next = stepBillingDate(next, subscription);
    guard += 1;
  }
  if (next <= today) next = stepBillingDate(subscription.nextBillingDate, subscription);
  return next;
}

export function dueLabel(nextBillingDate: string, from = new Date()) {
  const days = daysUntil(nextBillingDate, from);
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, tone: "overdue" as const };
  if (days === 0) return { text: "Due today", tone: "soon" as const };
  if (days === 1) return { text: "Tomorrow", tone: "soon" as const };
  return { text: `In ${days} days`, tone: days <= 7 ? "soon" as const : "normal" as const };
}

export function cadenceLabel(cadence: FinanceSubscription["cadence"]) {
  if (cadence === "yearly") return "Yearly";
  if (cadence === "custom") return "Custom";
  return "Monthly";
}
