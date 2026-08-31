export type FolderSyncKind =
  | "github"
  | "drive"
  | "dropbox"
  | "onedrive"
  | "icloud"
  | "nextcloud"
  | "folder";

export type SyncDestination = "cloud" | FolderSyncKind;

export type FolderSyncOption = {
  id: FolderSyncKind;
  label: string;
  description: string;
  dialogTitle: string;
  hint: string;
  matchers: string[];
};

export const FOLDER_SYNC_OPTIONS: FolderSyncOption[] = [
  {
    id: "github",
    label: "GitHub",
    description: "A Git repository. Spell commits and pushes to GitHub.",
    dialogTitle: "Choose GitHub repository folder",
    hint: "Pick the local folder for this GitHub repo.",
    matchers: ["/github/", "\\github\\"],
  },
  {
    id: "drive",
    label: "Google Drive",
    description: "Files in a Drive folder. Drive keeps them in sync.",
    dialogTitle: "Choose Google Drive folder",
    hint: "Pick the folder Google Drive already syncs on this computer.",
    matchers: [
      "google drive",
      "googledrive",
      "/insync/",
      "\\insync\\",
      ".shortcut-targets-by-id",
    ],
  },
  {
    id: "dropbox",
    label: "Dropbox",
    description: "Files in a Dropbox folder. Dropbox keeps them in sync.",
    dialogTitle: "Choose Dropbox folder",
    hint: "Pick the folder Dropbox already syncs on this computer.",
    matchers: ["/dropbox/", "\\dropbox\\"],
  },
  {
    id: "onedrive",
    label: "OneDrive",
    description: "Files in a OneDrive folder. OneDrive keeps them in sync.",
    dialogTitle: "Choose OneDrive folder",
    hint: "Pick the folder OneDrive already syncs on this computer.",
    matchers: ["/onedrive/", "\\onedrive\\", "one drive"],
  },
  {
    id: "icloud",
    label: "iCloud Drive",
    description: "Files in an iCloud folder. iCloud keeps them in sync.",
    dialogTitle: "Choose iCloud Drive folder",
    hint: "Pick the folder iCloud already syncs on this computer.",
    matchers: ["icloud drive", "/icloud/", "\\icloud\\", "mobile documents"],
  },
  {
    id: "nextcloud",
    label: "Nextcloud",
    description: "Files in a Nextcloud or ownCloud folder.",
    dialogTitle: "Choose Nextcloud folder",
    hint: "Pick the folder Nextcloud or ownCloud already syncs on this computer.",
    matchers: ["/nextcloud/", "\\nextcloud\\", "/owncloud/", "\\owncloud\\"],
  },
  {
    id: "folder",
    label: "This computer",
    description: "A local folder, or any other sync app.",
    dialogTitle: "Choose notes folder",
    hint: "Pick any folder. If it lives inside a sync app, that app keeps the files.",
    matchers: [],
  },
];

export const ONBOARDING_FOLDER_SYNC_IDS: FolderSyncKind[] = [
  "github",
  "drive",
  "dropbox",
  "onedrive",
];

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

export function detectFolderSyncKind(path: string | null | undefined): FolderSyncKind {
  if (!path) return "folder";
  const lower = normalizePath(path);
  const padded = `/${lower.replace(/^\/+/, "")}/`;
  for (const option of FOLDER_SYNC_OPTIONS) {
    if (option.id === "folder") continue;
    if (
      option.matchers.some((matcher) => {
        const needle = matcher.replace(/\\/g, "/").toLowerCase();
        return lower.includes(needle) || padded.includes(needle);
      })
    ) {
      return option.id;
    }
  }
  return "folder";
}

export function folderSyncOption(id: FolderSyncKind): FolderSyncOption {
  return (
    FOLDER_SYNC_OPTIONS.find((option) => option.id === id) ??
    FOLDER_SYNC_OPTIONS[FOLDER_SYNC_OPTIONS.length - 1]
  );
}

export function parseFolderSyncKind(
  value: string | null | undefined,
): FolderSyncKind | null {
  if (!value) return null;
  return FOLDER_SYNC_OPTIONS.some((option) => option.id === value)
    ? (value as FolderSyncKind)
    : null;
}

export function isGitHubRemote(url: string | null | undefined): boolean {
  if (!url) return false;
  return /github\.com[:/]/i.test(url);
}

export function githubRepoLabel(url: string | null | undefined): string {
  if (!url) return "GitHub";
  const sshMatch = url.match(/:([^/]+\/[^/]+?)(?:\.git)?$/);
  const httpsMatch = url.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/i);
  return sshMatch?.[1] || httpsMatch?.[1] || url;
}

export function activeSyncDestination(
  cloudEnabled: boolean,
  path: string | null | undefined,
  options: {
    preferredKind?: FolderSyncKind | null;
    remoteUrl?: string | null;
  } = {},
): SyncDestination {
  if (cloudEnabled) return "cloud";
  if (options.preferredKind) return options.preferredKind;
  if (isGitHubRemote(options.remoteUrl)) return "github";
  return detectFolderSyncKind(path);
}
