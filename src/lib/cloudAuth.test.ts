import { describe, expect, it } from "vitest";
import {
  clearPasswordRecoveryPending,
  cloudAuthErrorMessage,
  isCloudPasswordRecovery,
  isPasswordRecoveryPending,
  markPasswordRecoveryPending,
  parseCloudAuthCallback,
} from "./cloudAuth";

describe("parseCloudAuthCallback", () => {
  it("reads a PKCE code from the Spell callback", () => {
    expect(
      parseCloudAuthCallback("spell://auth/callback?code=abc-123&next=/"),
    ).toEqual({ code: "abc-123" });
  });

  it("reads an error from the callback query", () => {
    expect(
      parseCloudAuthCallback(
        "spell://auth/callback?error=access_denied&error_description=User%20cancelled",
      ),
    ).toEqual({ error: "User cancelled" });
  });

  it("reads a confirmation email token so signup can finish in the app", () => {
    expect(
      parseCloudAuthCallback(
        "spell://auth/callback?token_hash=otp-token&type=signup",
      ),
    ).toEqual({
      tokenHash: "otp-token",
      otpType: "signup",
    });
  });

  it("reads a password-reset token so recovery can finish in the app", () => {
    expect(
      parseCloudAuthCallback(
        "spell://auth/callback?token_hash=otp-token&type=recovery",
      ),
    ).toEqual({
      tokenHash: "otp-token",
      otpType: "recovery",
    });
  });

  it("reads implicit tokens from the callback hash", () => {
    expect(
      parseCloudAuthCallback(
        "spell://auth/callback#access_token=aaa&refresh_token=bbb&type=signup",
      ),
    ).toEqual({
      otpType: "signup",
      accessToken: "aaa",
      refreshToken: "bbb",
    });
  });

  it("ignores unrelated URLs", () => {
    expect(parseCloudAuthCallback("https://example.com/?code=abc")).toBeNull();
    expect(parseCloudAuthCallback("not a url")).toBeNull();
    expect(parseCloudAuthCallback("spell://auth/callback")).toBeNull();
  });
});

describe("cloudAuthErrorMessage", () => {
  it("tells the user to confirm email instead of showing the API string", () => {
    expect(cloudAuthErrorMessage(new Error("Email not confirmed"))).toBe(
      "Confirm the email we sent, then sign in.",
    );
  });

  it("maps duplicate accounts to sign-in", () => {
    expect(cloudAuthErrorMessage(new Error("User already registered"))).toBe(
      "That email already has an account. Sign in instead.",
    );
  });

  it("maps an expired reset link", () => {
    expect(cloudAuthErrorMessage(new Error("otp_expired"))).toBe(
      "That reset link has expired. Request a new one.",
    );
  });

  it("maps a dead cloud host instead of Failed to fetch", () => {
    expect(cloudAuthErrorMessage(new TypeError("Failed to fetch"))).toBe(
      "Spell Cloud is unreachable. Sign in, new accounts, and password reset need the server.",
    );
  });
});

describe("password recovery pending", () => {
  it("treats type=recovery as a password reset, not a sign-in", () => {
    expect(isCloudPasswordRecovery("recovery")).toBe(true);
    expect(isCloudPasswordRecovery("signup")).toBe(false);
  });

  it("remembers that a reset link opened Spell", () => {
    clearPasswordRecoveryPending();
    expect(isPasswordRecoveryPending()).toBe(false);
    markPasswordRecoveryPending();
    expect(isPasswordRecoveryPending()).toBe(true);
    clearPasswordRecoveryPending();
    expect(isPasswordRecoveryPending()).toBe(false);
  });
});
