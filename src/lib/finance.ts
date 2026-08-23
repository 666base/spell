import type { FinanceSubscription, FinanceWorkspace } from "../types/note";

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
  return activeTransactions(workspace)
    .slice()
    .sort((left, right) => right.date.localeCompare(left.date) || right.updatedAt - left.updatedAt)
    .slice(0, limit);
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

export function dueLabel(nextBillingDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${nextBillingDate}T12:00:00`);
  due.setHours(0, 0, 0, 0);
  const days = Math.round((due.valueOf() - today.valueOf()) / 86_400_000);
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
