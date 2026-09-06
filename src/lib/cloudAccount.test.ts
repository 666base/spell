import { describe, expect, it } from "vitest";
import {
  cloudSyncPanel,
  cloudUserIdForVaultSwitch,
  nextCloudSignInAction,
  upsertCloudMutation,
} from "./cloudAccount";

describe("nextCloudSignInAction", () => {
  it("opens the cloud vault after sign-in even when a desktop folder is already set", () => {
    expect(
      nextCloudSignInAction({
        signedInUserId: "11111111-1111-1111-1111-111111111111",
        currentCloudUserId: null,
        notesFolder: "/home/me/Documents/Spell Library",
      }),
    ).toBe("activate");
  });

  it("opens the cloud vault when Android stored an empty offline folder path", () => {
    expect(
      nextCloudSignInAction({
        signedInUserId: "11111111-1111-1111-1111-111111111111",
        currentCloudUserId: null,
        notesFolder: "",
      }),
    ).toBe("activate");
  });

  it("resumes sync when this vault is already the signed-in account", () => {
    expect(
      nextCloudSignInAction({
        signedInUserId: "11111111-1111-1111-1111-111111111111",
        currentCloudUserId: "11111111-1111-1111-1111-111111111111",
        notesFolder: "/home/me/.local/share/spell/cloud-notes/11111111-1111-1111-1111-111111111111",
      }),
    ).toBe("resume");
  });
});

describe("cloudUserIdForVaultSwitch", () => {
  it("can switch using the just-signed-in user when session state is still empty", () => {
    expect(cloudUserIdForVaultSwitch(null, "user-1")).toBe("user-1");
  });

  it("prefers the live session when both ids are present", () => {
    expect(cloudUserIdForVaultSwitch("session-user", "pending-user")).toBe(
      "session-user",
    );
  });
});

describe("upsertCloudMutation", () => {
  it("keeps a mutation when sign-in has not set the active cloud user yet", () => {
    const pending = upsertCloudMutation(
      [],
      { path: "Hello", content: "# Hi", modifiedAt: 1, deleted: false },
    );
    expect(
      upsertCloudMutation(pending, {
        path: "Hello",
        content: "# Hello",
        modifiedAt: 2,
        deleted: false,
      }),
    ).toEqual([
      { path: "Hello", content: "# Hello", modifiedAt: 2, deleted: false },
    ]);
  });
});

describe("cloudSyncPanel", () => {
  const healthy = {
    syncEnabled: true,
    signedIn: true,
    online: true,
    isSyncing: false,
    pendingCount: 0,
    lastError: null,
    lastSyncedAt: 1_700_000_000_000,
  };

  it("does not treat a selected vault with a schema error as synced", () => {
    expect(
      cloudSyncPanel({
        ...healthy,
        lastError: "Could not find the table 'public.spell_notes' in the schema cache",
      }),
    ).toEqual({
      tone: "error",
      label: "Cloud notes aren't set up on this Spell Cloud project yet",
      showLastSync: false,
    });
  });

  it("keeps the error while a retry is in flight instead of flashing Syncing", () => {
    expect(
      cloudSyncPanel({
        ...healthy,
        isSyncing: true,
        lastError: "Cloud notes aren't set up on this Spell Cloud project yet",
      }),
    ).toEqual({
      tone: "busy",
      label: "Trying again…",
      showLastSync: false,
    });
  });

  it("shows last sync only after a successful pass", () => {
    expect(cloudSyncPanel(healthy)).toEqual({
      tone: "ok",
      label: "Synced",
      showLastSync: true,
    });
  });

  it("does not invent a last-sync time when the vault has never synced", () => {
    expect(cloudSyncPanel({ ...healthy, lastSyncedAt: null })).toEqual({
      tone: "ok",
      label: "Synced",
      showLastSync: false,
    });
  });
});
