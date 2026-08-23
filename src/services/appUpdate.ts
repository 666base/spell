import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface AppUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  available: boolean;
  notes: string;
  assetName: string | null;
  assetSize: number | null;
  htmlUrl: string;
  platform: "linux-deb" | "android-apk" | string;
}

export interface AppInstallOutcome {
  status: "installed" | "opened_installer" | "ready" | string;
  path: string | null;
  restartRequired: boolean;
}

export interface AppUpdateProgress {
  percent: number;
  downloaded: number;
  total: number;
}

interface AndroidInstaller {
  canInstall: () => boolean;
  requestInstallPermission: () => void;
  installApk: (path: string) => void;
}

function androidInstaller(): AndroidInstaller | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as Window & { SpellUpdate?: AndroidInstaller }).SpellUpdate;
  if (
    !candidate ||
    typeof candidate.canInstall !== "function" ||
    typeof candidate.requestInstallPermission !== "function" ||
    typeof candidate.installApk !== "function"
  ) {
    return null;
  }
  return candidate;
}

export function checkForAppUpdate(): Promise<AppUpdateInfo> {
  return invoke("check_for_app_update");
}

export function installAppUpdate(): Promise<AppInstallOutcome> {
  return invoke("install_app_update");
}

export function restartAppAfterUpdate(): Promise<void> {
  return invoke("restart_app_after_update");
}

export function listenAppUpdateProgress(
  onProgress: (progress: AppUpdateProgress) => void,
): Promise<UnlistenFn> {
  return listen<AppUpdateProgress>("app-update-progress", (event) => {
    onProgress(event.payload);
  });
}

export function androidCanInstallPackages(): boolean {
  return androidInstaller()?.canInstall() ?? true;
}

export function requestAndroidInstallPermission(): boolean {
  const installer = androidInstaller();
  if (!installer) return false;
  installer.requestInstallPermission();
  return true;
}

export function installAndroidApk(path: string): boolean {
  const installer = androidInstaller();
  if (!installer) return false;
  installer.installApk(path);
  return true;
}

export function formatAssetSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  const megabytes = bytes / (1024 * 1024);
  if (megabytes < 10) return `${megabytes.toFixed(1)} MB`;
  return `${Math.round(megabytes)} MB`;
}
