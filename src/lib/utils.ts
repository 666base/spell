import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Clean title - remove markdown syntax and invisible characters
 */
export function cleanTitle(title: string | undefined): string {
  if (!title) return "Untitled";
  const cleaned = title
    // Remove heading markers (##, ###, etc.)
    .replace(/^#+\s+/, "")
    // Remove bold (**text** or __text__)
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    // Remove italic (*text* or _text_)
    .replace(/(\*|_)(.*?)\1/g, "$2")
    // Remove strikethrough (~~text~~)
    .replace(/~~(.*?)~~/g, "$1")
    // Remove inline code (`code`)
    .replace(/`([^`]+)`/g, "$1")
    // Remove images ![alt](url) - must come before links to avoid leaving "!"
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    // Remove links [text](url) - keep only text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove non-breaking spaces and other invisible characters
    .replace(/&nbsp;/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\u200B/g, "")
    .trim();
  return cleaned || "Untitled";
}

/** Apple Notes-style edited timestamp shown under the note toolbar. */
export function formatEditedAt(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);

  if (date >= startOfToday) return `Today at ${time}`;
  if (date >= startOfYesterday) return `Yesterday at ${time}`;
  const datePart = date.toLocaleDateString([], {
    day: "numeric",
    month: "long",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
  return `${datePart} at ${time}`;
}
