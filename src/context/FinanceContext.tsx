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
  FinanceSubscription,
  FinanceTransaction,
  FinanceWorkspace,
} from "../types/note";
import { advanceNextBillingDate, isoDate, isMonthKey } from "../lib/finance";

interface FinanceContextValue {
  workspace: FinanceWorkspace;
  isLoading: boolean;
  setCurrency: (currency: string) => void;
  addMonth: (month: string) => void;
  saveSubscription: (subscription: FinanceSubscription) => void;
  saveTransaction: (transaction: FinanceTransaction) => void;
  duplicateSubscription: (id: string) => void;
  duplicateTransaction: (id: string) => void;
  archiveSubscription: (id: string, archived: boolean) => void;
  deleteSubscription: (id: string) => void;
  deleteTransaction: (id: string) => void;
  confirmSubscription: (id: string) => void;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

function defaultCurrency() {
  return "EUR";
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createFinanceTransaction(kind: FinanceTransaction["kind"]): FinanceTransaction {
  const now = Date.now();
  return {
    id: makeId(),
    kind,
    title: "",
    amountCents: 0,
    date: isoDate(),
    category: "",
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function createFinanceSubscription(): FinanceSubscription {
  const now = Date.now();
  return {
    id: makeId(),
    name: "",
    amountCents: 0,
    cadence: "monthly",
    nextBillingDate: isoDate(),
    category: "",
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}

function initialWorkspace(): FinanceWorkspace {
  return { version: 1, currency: defaultCurrency(), subscriptions: [], transactions: [], months: [] };
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizeSubscription(value: unknown): FinanceSubscription | null {
  if (!value || typeof value !== "object") return null;
  const subscription = value as Partial<FinanceSubscription>;
  if (
    typeof subscription.id !== "string" ||
    typeof subscription.name !== "string" ||
    !isAmount(subscription.amountCents) ||
    !isDate(subscription.nextBillingDate) ||
    !["monthly", "yearly", "custom"].includes(subscription.cadence ?? "")
  ) return null;

  return {
    id: subscription.id,
    name: subscription.name.trim() || "Untitled subscription",
    amountCents: Math.round(subscription.amountCents),
    cadence: subscription.cadence as FinanceSubscription["cadence"],
    customIntervalDays: subscription.cadence === "custom" && Number.isFinite(subscription.customIntervalDays)
      ? Math.max(1, Math.round(subscription.customIntervalDays ?? 30))
      : undefined,
    nextBillingDate: subscription.nextBillingDate,
    category: typeof subscription.category === "string" ? subscription.category.trim() : "",
    website: typeof subscription.website === "string" ? subscription.website.trim() : "",
    projectId: typeof subscription.projectId === "string" ? subscription.projectId : undefined,
    notes: typeof subscription.notes === "string" ? subscription.notes : "",
    archived: Boolean(subscription.archived),
    createdAt: Number.isFinite(subscription.createdAt) ? subscription.createdAt! : Date.now(),
    updatedAt: Number.isFinite(subscription.updatedAt) ? subscription.updatedAt! : Date.now(),
  };
}

function normalizeTransaction(value: unknown): FinanceTransaction | null {
  if (!value || typeof value !== "object") return null;
  const transaction = value as Partial<FinanceTransaction>;
  if (
    typeof transaction.id !== "string" ||
    typeof transaction.title !== "string" ||
    !isAmount(transaction.amountCents) ||
    !isDate(transaction.date) ||
    (transaction.kind !== "income" && transaction.kind !== "expense")
  ) return null;

  return {
    id: transaction.id,
    title: transaction.title.trim() || "Untitled record",
    kind: transaction.kind,
    amountCents: Math.round(transaction.amountCents),
    date: transaction.date,
    category: typeof transaction.category === "string" ? transaction.category.trim() : "",
    projectId: typeof transaction.projectId === "string" ? transaction.projectId : undefined,
    subscriptionId: typeof transaction.subscriptionId === "string" ? transaction.subscriptionId : undefined,
    notes: typeof transaction.notes === "string" ? transaction.notes : "",
    archived: Boolean(transaction.archived),
    createdAt: Number.isFinite(transaction.createdAt) ? transaction.createdAt! : Date.now(),
    updatedAt: Number.isFinite(transaction.updatedAt) ? transaction.updatedAt! : Date.now(),
  };
}

export function normalizeFinanceWorkspace(value: FinanceWorkspace | undefined): FinanceWorkspace {
  if (!value || value.version !== 1) return initialWorkspace();
  return {
    version: 1,
    currency: defaultCurrency(),
    subscriptions: Array.isArray(value.subscriptions)
      ? value.subscriptions.map(normalizeSubscription).filter((item): item is FinanceSubscription => Boolean(item))
      : [],
    transactions: Array.isArray(value.transactions)
      ? value.transactions.map(normalizeTransaction).filter((item): item is FinanceTransaction => Boolean(item))
      : [],
    months: Array.isArray(value.months)
      ? [...new Set(value.months.filter((month): month is string => typeof month === "string" && isMonthKey(month)))]
      : [],
  };
}

function readLocalWorkspace(storageKey: string) {
  try {
    const saved = window.localStorage.getItem(storageKey);
    return saved ? normalizeFinanceWorkspace(JSON.parse(saved) as FinanceWorkspace) : undefined;
  } catch {
    return undefined;
  }
}

function writeLocalWorkspace(storageKey: string, workspace: FinanceWorkspace) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(workspace));
  } catch {
    // The workspace stays usable in this session if local storage is unavailable.
  }
}

export function FinanceProvider({ children }: { children: ReactNode }) {
  const { notesFolder } = useNotesData();
  const [workspace, setWorkspace] = useState<FinanceWorkspace>(initialWorkspace);
  const [isLoading, setIsLoading] = useState(true);
  const workspaceRef = useRef(workspace);
  const persistQueue = useRef(Promise.resolve());
  const storageKey = useMemo(() => `spell:finance-workspace:${notesFolder ?? "default"}`, [notesFolder]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    notesService.getFinanceData()
      .then((data) => {
        if (!cancelled) {
          const nextWorkspace = normalizeFinanceWorkspace(data);
          workspaceRef.current = nextWorkspace;
          setWorkspace(nextWorkspace);
        }
      })
      .catch((error) => {
        console.warn("Using local finance workspace storage:", error);
        if (!cancelled) {
          const nextWorkspace = readLocalWorkspace(storageKey) ?? initialWorkspace();
          workspaceRef.current = nextWorkspace;
          setWorkspace(nextWorkspace);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [storageKey]);

  const persist = useCallback((nextWorkspace: FinanceWorkspace) => {
    workspaceRef.current = nextWorkspace;
    setWorkspace(nextWorkspace);
    persistQueue.current = persistQueue.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await notesService.updateFinanceData(nextWorkspace);
          window.localStorage.removeItem(storageKey);
        } catch (error) {
          console.warn("Using local finance workspace storage:", error);
          writeLocalWorkspace(storageKey, nextWorkspace);
        }
      })
      .catch(() => writeLocalWorkspace(storageKey, nextWorkspace));
  }, [storageKey]);

  const setCurrency = useCallback((currency: string) => {
    const nextCurrency = currency.toUpperCase();
    const currentWorkspace = workspaceRef.current;
    if (!/^[A-Z]{3}$/.test(nextCurrency) || currentWorkspace.currency === nextCurrency) return;
    persist({ ...currentWorkspace, currency: nextCurrency });
  }, [persist]);

  const addMonth = useCallback((month: string) => {
    if (!isMonthKey(month)) return;
    const currentWorkspace = workspaceRef.current;
    const months = currentWorkspace.months ?? [];
    if (months.includes(month)) return;
    persist({
      ...currentWorkspace,
      months: [...months, month].sort((left, right) => right.localeCompare(left)),
    });
  }, [persist]);

  const saveSubscription = useCallback((subscription: FinanceSubscription) => {
    const currentWorkspace = workspaceRef.current;
    const saved = { ...subscription, name: subscription.name.trim(), updatedAt: Date.now() };
    persist({
      ...currentWorkspace,
      subscriptions: currentWorkspace.subscriptions.some((item) => item.id === saved.id)
        ? currentWorkspace.subscriptions.map((item) => item.id === saved.id ? saved : item)
        : [...currentWorkspace.subscriptions, saved],
    });
  }, [persist]);

  const saveTransaction = useCallback((transaction: FinanceTransaction) => {
    const currentWorkspace = workspaceRef.current;
    const saved = { ...transaction, title: transaction.title.trim(), updatedAt: Date.now() };
    persist({
      ...currentWorkspace,
      transactions: currentWorkspace.transactions.some((item) => item.id === saved.id)
        ? currentWorkspace.transactions.map((item) => item.id === saved.id ? saved : item)
        : [...currentWorkspace.transactions, saved],
    });
  }, [persist]);

  const duplicateSubscription = useCallback((id: string) => {
    const currentWorkspace = workspaceRef.current;
    const source = currentWorkspace.subscriptions.find((item) => item.id === id);
    if (!source) return;
    const now = Date.now();
    persist({
      ...currentWorkspace,
      subscriptions: [{ ...source, id: makeId(), archived: false, createdAt: now, updatedAt: now }, ...currentWorkspace.subscriptions],
    });
  }, [persist]);

  const duplicateTransaction = useCallback((id: string) => {
    const currentWorkspace = workspaceRef.current;
    const source = currentWorkspace.transactions.find((item) => item.id === id);
    if (!source) return;
    const now = Date.now();
    persist({
      ...currentWorkspace,
      transactions: [{ ...source, id: makeId(), archived: false, createdAt: now, updatedAt: now }, ...currentWorkspace.transactions],
    });
  }, [persist]);

  const archiveSubscription = useCallback((id: string, archived: boolean) => {
    const currentWorkspace = workspaceRef.current;
    persist({
      ...currentWorkspace,
      subscriptions: currentWorkspace.subscriptions.map((item) => item.id === id ? { ...item, archived, updatedAt: Date.now() } : item),
    });
  }, [persist]);

  const deleteSubscription = useCallback((id: string) => {
    const currentWorkspace = workspaceRef.current;
    persist({
      ...currentWorkspace,
      subscriptions: currentWorkspace.subscriptions.filter((item) => item.id !== id),
    });
  }, [persist]);

  const deleteTransaction = useCallback((id: string) => {
    const currentWorkspace = workspaceRef.current;
    persist({
      ...currentWorkspace,
      transactions: currentWorkspace.transactions.filter((item) => item.id !== id),
    });
  }, [persist]);

  const confirmSubscription = useCallback((id: string) => {
    const currentWorkspace = workspaceRef.current;
    const subscription = currentWorkspace.subscriptions.find((item) => item.id === id && !item.archived);
    if (!subscription) return;
    const now = Date.now();
    const charge: FinanceTransaction = {
      id: makeId(),
      kind: "expense",
      title: subscription.name,
      amountCents: subscription.amountCents,
      date: isoDate(),
      category: subscription.category,
      projectId: subscription.projectId,
      subscriptionId: subscription.id,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    persist({
      ...currentWorkspace,
      transactions: [...currentWorkspace.transactions, charge],
      subscriptions: currentWorkspace.subscriptions.map((item) =>
        item.id === id
          ? { ...item, nextBillingDate: advanceNextBillingDate(item), updatedAt: now }
          : item
      ),
    });
  }, [persist]);

  const value = useMemo(() => ({
    workspace,
    isLoading,
    setCurrency,
    addMonth,
    saveSubscription,
    saveTransaction,
    duplicateSubscription,
    duplicateTransaction,
    archiveSubscription,
    deleteSubscription,
    deleteTransaction,
    confirmSubscription,
  }), [
    addMonth,
    archiveSubscription,
    confirmSubscription,
    deleteSubscription,
    deleteTransaction,
    duplicateSubscription,
    duplicateTransaction,
    isLoading,
    saveSubscription,
    saveTransaction,
    setCurrency,
    workspace,
  ]);

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context) throw new Error("useFinance must be used inside FinanceProvider");
  return context;
}
