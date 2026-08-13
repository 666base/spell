export interface NoteMetadata {
  id: string;
  title: string;
  preview: string;
  modified: number;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  path: string;
  modified: number;
}

export interface ThemeSettings {
  mode: "light" | "dark" | "system";
}

export type FontFamily = "system-sans" | "serif" | "monospace";
export type TextDirection = "auto" | "ltr" | "rtl";
export type EditorWidth = "narrow" | "normal" | "wide" | "full" | "custom";

export interface EditorFontSettings {
  baseFontFamily?: FontFamily;
  baseFontSize?: number; // in px, default 16
  boldWeight?: number; // 600, 700, 800 for headings and bold text
  lineHeight?: number; // default 1.6
}

// Customizable theme color keys (maps to CSS --color-* variables)
export type ThemeColorKey =
  | "bg"
  | "bg-secondary"
  | "bg-muted"
  | "bg-emphasis"
  | "text"
  | "text-muted"
  | "border"
  | "accent"
  | "selection";

// Partial map of color overrides (hex strings)
export type CustomColors = Partial<Record<ThemeColorKey, string>>;

export type KanbanPriority = "high" | "medium" | "low";

export interface KanbanTodo {
  id: string;
  title: string;
  completed: boolean;
}

export interface KanbanCard {
  id: string;
  title: string;
  client?: string;
  dueDate?: string;
  priority: KanbanPriority;
  description?: string;
  todos?: KanbanTodo[];
  createdAt: number;
  updatedAt: number;
}

export interface KanbanColumn {
  id: string;
  title: string;
  cardIds: string[];
}

export interface KanbanBoard {
  version: 1;
  columns: KanbanColumn[];
  cards: KanbanCard[];
}

export interface KanbanProject {
  id: string;
  name: string;
  client?: string;
  createdAt: number;
  updatedAt: number;
  board: KanbanBoard;
}

export interface KanbanWorkspace {
  version: 2;
  activeProjectId: string;
  projects: KanbanProject[];
}

export type FinanceTransactionKind = "income" | "expense";
export type SubscriptionCadence = "monthly" | "yearly" | "custom";

export interface FinanceTransaction {
  id: string;
  kind: FinanceTransactionKind;
  title: string;
  amountCents: number;
  date: string;
  category: string;
  projectId?: string;
  notes?: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface FinanceSubscription {
  id: string;
  name: string;
  amountCents: number;
  cadence: SubscriptionCadence;
  customIntervalDays?: number;
  nextBillingDate: string;
  category: string;
  website?: string;
  projectId?: string;
  notes?: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface FinanceWorkspace {
  version: 1;
  currency: string;
  subscriptions: FinanceSubscription[];
  transactions: FinanceTransaction[];
}

// Per-folder settings (stored in .scratch/settings.json)
export interface Settings {
  theme: ThemeSettings;
  editorFont?: EditorFontSettings;
  gitEnabled?: boolean;
  foldersEnabled?: boolean;
  pinnedNoteIds?: string[];
  bookmarkedNoteIds?: string[];
  textDirection?: TextDirection;
  editorWidth?: EditorWidth;
  customEditorWidthPx?: number;
  sidebarWidthPx?: number;
  defaultNoteName?: string;
  interfaceZoom?: number;
  ollamaModel?: string;
  ignoredPatterns?: string[];
  customColorsLight?: CustomColors;
  customColorsDark?: CustomColors;
  /** Legacy single-board storage. Migrated to kanbanWorkspace on first save. */
  kanbanBoard?: KanbanBoard;
  kanbanWorkspace?: KanbanWorkspace;
  financeWorkspace?: FinanceWorkspace;
}

export interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
  notes: NoteMetadata[];
}
