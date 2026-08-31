import { describe, expect, it } from "vitest";
import {
  cloudErrorText,
  cloudSyncErrorMessage,
  isCloudSessionExpired,
  resolveCloudAuthSession,
} from "./cloudSyncError";

describe("cloudErrorText", () => {
  it("reads Error.message", () => {
    expect(cloudErrorText(new Error("JWT expired"))).toBe("JWT expired");
  });

  it("reads a Postgrest-shaped object that is not an Error instance", () => {
    expect(
      cloudErrorText({ message: "JWT expired", code: "PGRST301" }),
    ).toBe("JWT expired");
  });

  it("does not stringify objects as [object Object]", () => {
    expect(cloudErrorText({ message: "could not find the function" })).not.toBe(
      "[object Object]",
    );
  });

  it("falls back for empty values", () => {
    expect(cloudErrorText(null)).toBe("");
    expect(cloudErrorText("")).toBe("");
  });
});

describe("isCloudSessionExpired", () => {
  it("treats invalid refresh tokens as a signed-out session", () => {
    expect(
      isCloudSessionExpired(new Error("Invalid Refresh Token: Refresh Token Not Found")),
    ).toBe(true);
  });

  it("treats JWT expiry as a signed-out session", () => {
    expect(isCloudSessionExpired({ message: "JWT expired" })).toBe(true);
  });

  it("does not treat a missing RPC as a signed-out session", () => {
    expect(
      isCloudSessionExpired(
        new Error("Could not find the function public.spell_sync_note"),
      ),
    ).toBe(false);
  });

  it("does not treat a network failure as a signed-out session", () => {
    expect(isCloudSessionExpired(new TypeError("Failed to fetch"))).toBe(false);
  });
});

describe("cloudSyncErrorMessage", () => {
  it("asks the user to sign in again when the session is dead", () => {
    expect(
      cloudSyncErrorMessage(
        new Error("Invalid Refresh Token: Refresh Token Not Found"),
      ),
    ).toBe("Sign in to Spell Cloud again");
  });

  it("maps a missing spell_sync_note RPC", () => {
    expect(
      cloudSyncErrorMessage({
        message: "Could not find the function public.spell_sync_note in the schema cache",
        code: "PGRST202",
      }),
    ).toBe("Cloud notes aren't set up on this Spell Cloud project yet");
  });

  it("maps network failures", () => {
    expect(cloudSyncErrorMessage(new TypeError("Failed to fetch"))).toBe(
      "Couldn't reach Spell Cloud. Check your connection.",
    );
  });

  it("keeps an unknown Error message", () => {
    expect(cloudSyncErrorMessage(new Error("disk full"))).toBe("disk full");
  });

  it("does not show [object Object] when the payload has no message", () => {
    expect(cloudSyncErrorMessage({ code: "XX" })).toBe(
      "Couldn't sync with Spell Cloud",
    );
  });
});

describe("resolveCloudAuthSession", () => {
  it("returns the session when auth has no error", async () => {
    const session = { user: { id: "u1" } };
    await expect(
      resolveCloudAuthSession(
        { data: { session }, error: null },
        async () => {
          throw new Error("should not sign out");
        },
      ),
    ).resolves.toBe(session);
  });

  it("returns null and signs out locally when the refresh token is dead", async () => {
    let signedOut = false;
    await expect(
      resolveCloudAuthSession(
        {
          data: { session: null },
          error: new Error("Invalid Refresh Token: Refresh Token Not Found"),
        },
        async () => {
          signedOut = true;
        },
      ),
    ).resolves.toBeNull();
    expect(signedOut).toBe(true);
  });

  it("rethrows unexpected auth errors without signing out", async () => {
    let signedOut = false;
    await expect(
      resolveCloudAuthSession(
        { data: { session: null }, error: new Error("storage unavailable") },
        async () => {
          signedOut = true;
        },
      ),
    ).rejects.toThrow("storage unavailable");
    expect(signedOut).toBe(false);
  });

  it("does not clear a session when refresh failed because the network is down", async () => {
    let signedOut = false;
    await expect(
      resolveCloudAuthSession(
        { data: { session: null }, error: new TypeError("Failed to fetch") },
        async () => {
          signedOut = true;
        },
      ),
    ).rejects.toThrow("Failed to fetch");
    expect(signedOut).toBe(false);
  });
});
