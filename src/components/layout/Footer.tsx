import { useCallback, memo } from "react";
import { toast } from "sonner";
import { useGit } from "../../context/GitContext";
import { Button, IconButton } from "../ui";
import {
  GitBranchIcon,
  GitBranchDeletedIcon,
  GitCommitIcon,
  RefreshCwIcon,
  SpinnerIcon,
} from "../icons/velocity";
import { cn } from "../../lib/utils";

export const Footer = memo(function Footer() {
  const {
    status,
    isLoading,
    isSyncing,
    isCommitting,
    gitAvailable,
    gitEnabled,
    sync,
    initRepo,
    commit,
    lastError,
    clearError,
  } = useGit();

  const handleCommit = useCallback(async () => {
    if (isCommitting) return;
    try {
      const success = await commit("Quick commit from Spell");
      if (success) {
        toast.success("Changes committed");
      } else {
        toast.error("Failed to commit");
      }
    } catch {
      toast.error("Failed to commit");
    }
  }, [commit, isCommitting]);

  const handleSync = useCallback(async () => {
    if (isSyncing) return;
    const result = await sync();
    if (result.ok) {
      toast.success(result.message);
    } else {
      toast.error(result.error);
    }
  }, [sync, isSyncing]);

  const handleEnableGit = useCallback(async () => {
    const success = await initRepo();
    if (success) {
      toast.success("Git repository initialized");
    } else {
      toast.error("Failed to initialize Git");
    }
  }, [initRepo]);

  // Git status section
  const renderGitStatus = () => {
    if (!gitEnabled || !gitAvailable) {
      return null;
    }

    // Not a git repo - show init option
    if (status && !status.isRepo) {
      return (
        <Button
          onClick={handleEnableGit}
          variant="ghost"
          className="text-xs h-auto p-0 hover:bg-transparent"
        >
          Enable Git
        </Button>
      );
    }

    // Show spinner only when loading and no error to display
    if (isLoading && !lastError) {
      return <SpinnerIcon className="w-3 h-3 text-text-muted animate-spin" />;
    }

    const hasChanges = status ? status.changedCount > 0 : false;

    return (
      <div className="flex min-w-0 items-center gap-1.5">
        {status?.currentBranch ? (
          <span className="flex min-w-0 items-center gap-1 text-xs text-text-muted">
            <GitBranchIcon className="h-4.5 w-4.5 shrink-0 stroke-[1.5]" />
            <span className="truncate">{status.currentBranch}</span>
          </span>
        ) : status ? (
          <span className="flex items-center text-text-muted">
            <GitBranchDeletedIcon className="h-4.5 w-4.5 stroke-[1.5] opacity-50" />
          </span>
        ) : null}

        {hasChanges && !lastError && (
          <span className="shrink-0 text-xs text-text-muted/70">Files changed</span>
        )}

        {lastError && (
          <Button
            onClick={clearError}
            variant="link"
            aria-label={lastError}
            className="h-auto max-w-48 truncate p-0 text-xs text-red-500 hover:text-red-600 hover:no-underline"
          >
            {lastError}
          </Button>
        )}
      </div>
    );
  };

  // Determine what buttons to show
  const hasChanges = (status?.changedCount ?? 0) > 0;
  const showCommitButton =
    gitEnabled && gitAvailable && status?.isRepo && hasChanges;
  const behindCount = Math.max(status?.behindCount ?? 0, 0);
  const aheadCount = Math.max(status?.aheadCount ?? 0, 0);
  const syncCount = behindCount + aheadCount;
  const showSyncButton =
    gitEnabled && gitAvailable && status?.hasRemote && status?.hasUpstream;

  const syncLabel = isSyncing
    ? "Syncing..."
    : behindCount > 0 && aheadCount > 0
      ? `${behindCount} to pull, ${aheadCount} to push`
      : behindCount > 0
        ? `${behindCount} commit${behindCount === 1 ? "" : "s"} to pull`
        : aheadCount > 0
          ? `${aheadCount} commit${aheadCount === 1 ? "" : "s"} to push`
          : "Synced with remote";

  const hasGitFooterContent =
    showCommitButton || showSyncButton || renderGitStatus() !== null;

  if (!hasGitFooterContent) {
    return null;
  }

  return (
    <div className="shrink-0 border-t border-border">
      {/* Footer bar with git status and action buttons */}
      <div className="flex items-center justify-between px-3 py-2">
        {renderGitStatus()}
        <div className="flex items-center gap-px">
          {showSyncButton && (
            <IconButton
              onClick={handleSync}
              disabled={isSyncing}
              aria-label={syncLabel}
            >
              {isSyncing ? (
                <SpinnerIcon className="w-4.5 h-4.5 stroke-[1.5] animate-spin" />
              ) : (
                <span className="relative flex items-center">
                  <RefreshCwIcon
                    className={cn(
                      "w-4.5 h-4.5 stroke-[1.5]",
                      syncCount === 0 && "opacity-50",
                    )}
                  />
                  {syncCount > 0 && (
                    <span className="absolute -top-1.25 -right-1.25 min-w-3.5 h-3.5 flex items-center justify-center rounded-full bg-accent text-text-inverse text-[9px] font-bold leading-none px-0.5">
                      {syncCount}
                    </span>
                  )}
                </span>
              )}
            </IconButton>
          )}
          {showCommitButton && (
            <IconButton
              onClick={handleCommit}
              disabled={isCommitting}
              title="Quick commit"
            >
              {isCommitting ? (
                <SpinnerIcon className="w-4.5 h-4.5 stroke-[1.5] animate-spin" />
              ) : (
                <GitCommitIcon className="w-4.5 h-4.5 stroke-[1.5]" />
              )}
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );
});
