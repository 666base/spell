import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { toast } from "sonner";
import { isAndroid } from "../../lib/platform";
import {
  androidCanInstallPackages,
  checkForAppUpdate,
  formatAssetSize,
  installAndroidApk,
  installAppUpdate,
  listenAppUpdateProgress,
  requestAndroidInstallPermission,
  restartAppAfterUpdate,
  type AppUpdateInfo,
  type AppUpdateProgress,
} from "../../services/appUpdate";
import { Button } from "../ui";
import { DownloadIcon, RefreshCwIcon, SpinnerIcon } from "../icons/velocity";

function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function AppUpdateSection() {
  const [info, setInfo] = useState<AppUpdateInfo | null>(null);
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);
  const [needsInstallPermission, setNeedsInstallPermission] = useState(false);
  const [progress, setProgress] = useState<AppUpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUpdate = async (manual: boolean) => {
    setIsChecking(true);
    setError(null);
    try {
      const next = await checkForAppUpdate();
      setInfo(next);
      if (manual && !next.available) {
        toast.success("You're on the latest version");
      }
    } catch (caught) {
      const message = errorMessage(caught, "Couldn't check for updates");
      setError(message);
      if (manual) toast.error(message);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    getVersion()
      .then(setInstalledVersion)
      .catch(() => {});
    void loadUpdate(false);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listenAppUpdateProgress(setProgress)
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => {
      unlisten?.();
    };
  }, []);

  const handleInstall = async () => {
    if (isInstalling) return;

    if (isAndroid && !androidCanInstallPackages()) {
      setNeedsInstallPermission(true);
      requestAndroidInstallPermission();
      toast.message("Allow Spell to install updates, then tap Install again");
      return;
    }

    setIsInstalling(true);
    setError(null);
    setProgress({ percent: 0, downloaded: 0, total: info?.assetSize ?? 0 });
    try {
      const outcome = await installAppUpdate();
      if (outcome.status === "ready" && outcome.path) {
        if (!installAndroidApk(outcome.path)) {
          throw new Error("Couldn't open the Android installer");
        }
        toast.success("Confirm the install when Android asks");
        setNeedsInstallPermission(false);
        return;
      }
      if (outcome.status === "opened_installer") {
        toast.success("The downloaded package is open in your installer");
        return;
      }
      if (outcome.restartRequired) {
        setRestartRequired(true);
        setInfo((current) =>
          current
            ? { ...current, available: false, currentVersion: current.latestVersion }
            : current,
        );
        toast.success("Update installed. Restart Spell to finish.");
        return;
      }
      toast.success("Update installed");
    } catch (caught) {
      const message = errorMessage(caught, "Couldn't install the update");
      setError(message);
      toast.error(message);
    } finally {
      setIsInstalling(false);
      setProgress(null);
    }
  };

  const handleRestart = async () => {
    try {
      await restartAppAfterUpdate();
    } catch (caught) {
      toast.error(errorMessage(caught, "Couldn't restart Spell"));
    }
  };

  const sizeLabel = formatAssetSize(info?.assetSize);
  const notes = info?.notes?.trim();

  return (
    <section className="pb-2">
      <h2 className="text-xl font-medium mb-0.5">App updates</h2>
      <p className="text-sm text-text-muted mb-4">
        {isAndroid
          ? "Download the latest APK from GitHub and install it on this phone"
          : "Download the latest Linux package from GitHub and install it on this computer"}
      </p>

      <div className="rounded-[10px] border border-border p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-text font-medium">Installed</span>
          <span className="text-sm text-text-muted">
            {info?.currentVersion || installedVersion
              ? `Spell ${info?.currentVersion || installedVersion}`
              : isChecking
                ? "Checking…"
                : "Unknown"}
          </span>
        </div>

        {info?.available && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-text font-medium">Available</span>
            <span className="text-sm text-text-muted">
              Spell {info.latestVersion}
              {sizeLabel ? ` · ${sizeLabel}` : ""}
            </span>
          </div>
        )}

        {info && !info.available && !isChecking && !error && !restartRequired && (
          <p className="text-sm text-text-muted">
            {info.latestVersion !== info.currentVersion
              ? `Spell ${info.latestVersion} is out, but this release doesn't include a ${isAndroid ? "APK" : ".deb"} yet.`
              : "You're on the latest version."}
          </p>
        )}

        {restartRequired && (
          <p className="text-sm text-text-muted">
            The new version is installed. Restart Spell to start using it.
          </p>
        )}

        {needsInstallPermission && (
          <p className="text-sm text-text-muted">
            Android needs permission to install this update. Enable it for Spell, then tap Install
            again.
          </p>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        {isInstalling && progress && (
          <div className="space-y-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-bg-muted">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-150"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="text-xs text-text-muted">
              Downloading{progress.total > 0 ? ` ${progress.percent}%` : "…"}
            </p>
          </div>
        )}

        {notes && info?.available && (
          <p className="text-sm text-text-muted whitespace-pre-wrap max-h-32 overflow-auto">
            {notes}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {info?.available && (
            <Button
              onClick={() => void handleInstall()}
              variant="primary"
              size="md"
              disabled={isInstalling || isChecking}
            >
              {isInstalling ? (
                <>
                  <SpinnerIcon className="w-3.25 h-3.25 mr-2 animate-spin" />
                  Updating…
                </>
              ) : (
                <>
                  <DownloadIcon className="w-4 h-4 stroke-[1.7] mr-1.5" />
                  {isAndroid ? "Install update" : "Download & install"}
                </>
              )}
            </Button>
          )}
          {restartRequired && (
            <Button onClick={() => void handleRestart()} variant="primary" size="md">
              Restart Spell
            </Button>
          )}
          <Button
            onClick={() => void loadUpdate(true)}
            variant="outline"
            size="md"
            disabled={isChecking || isInstalling}
          >
            {isChecking ? (
              <>
                <SpinnerIcon className="w-3.25 h-3.25 mr-2 animate-spin" />
                Checking…
              </>
            ) : (
              <>
                <RefreshCwIcon className="w-4 h-4 stroke-[1.7] mr-1.5" />
                Check for updates
              </>
            )}
          </Button>
        </div>
      </div>
    </section>
  );
}
