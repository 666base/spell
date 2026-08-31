import { describe, expect, it } from "vitest";
import {
  frontendBundleHasSpellCloud,
  hasSpellCloudCredentials,
} from "./spellCloudConfig";

describe("hasSpellCloudCredentials", () => {
  it("is false when the URL or key is missing", () => {
    expect(hasSpellCloudCredentials(undefined, "key")).toBe(false);
    expect(hasSpellCloudCredentials("https://example.supabase.co", "")).toBe(
      false,
    );
    expect(hasSpellCloudCredentials("  ", "key")).toBe(false);
  });

  it("is true when both URL and key are present", () => {
    expect(
      hasSpellCloudCredentials("https://example.supabase.co", "sb_publishable_x"),
    ).toBe(true);
  });
});

describe("frontendBundleHasSpellCloud", () => {
  it("does not treat a CSP wildcard as a configured project", () => {
    expect(
      frontendBundleHasSpellCloud(
        "connect-src https://*.supabase.co wss://*.supabase.co",
      ),
    ).toBe(false);
  });

  it("requires both a project URL and a key", () => {
    expect(
      frontendBundleHasSpellCloud("https://abcdefghijklmnop.supabase.co"),
    ).toBe(false);
    expect(
      frontendBundleHasSpellCloud(
        'url:"https://abcdefghijklmnop.supabase.co",key:"sb_publishable_abc_def"',
      ),
    ).toBe(true);
    expect(
      frontendBundleHasSpellCloud(
        'url:"https://abcdefghijklmnop.supabase.co",key:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.signature"',
      ),
    ).toBe(true);
  });
});
