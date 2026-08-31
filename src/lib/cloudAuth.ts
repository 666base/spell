export const CLOUD_AUTH_CALLBACK_URL = "spell://auth/callback";
export const CLOUD_PASSWORD_RECOVERY_KEY = "spell-cloud-password-recovery";
export const CLOUD_PASSWORD_RECOVERY_EVENT = "spell-cloud-password-recovery";
export const CLOUD_AUTH_ERROR_EVENT = "spell-cloud-auth-error";

export type CloudAuthCallback = {
  code?: string;
  error?: string;
  tokenHash?: string;
  otpType?: string;
  accessToken?: string;
  refreshToken?: string;
};

export function parseCloudAuthCallback(url: string): CloudAuthCallback | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "spell:") return null;

  const params = new URLSearchParams(parsed.search);
  if (parsed.hash.length > 1) {
    const hashParams = new URLSearchParams(parsed.hash.slice(1));
    hashParams.forEach((value, key) => {
      if (!params.has(key)) params.set(key, value);
    });
  }

  const error = params.get("error_description") || params.get("error");
  const code = params.get("code");
  const tokenHash = params.get("token_hash") || params.get("token");
  const otpType = params.get("type") ?? undefined;
  const accessToken = params.get("access_token") ?? undefined;
  const refreshToken = params.get("refresh_token") ?? undefined;

  if (!code && !error && !tokenHash && !accessToken) return null;
  const callback: CloudAuthCallback = {};
  if (code) callback.code = code;
  if (error) callback.error = error;
  if (tokenHash) callback.tokenHash = tokenHash;
  if (otpType) callback.otpType = otpType;
  if (accessToken) callback.accessToken = accessToken;
  if (refreshToken) callback.refreshToken = refreshToken;
  return callback;
}

export function isCloudPasswordRecovery(otpType: string | undefined): boolean {
  return otpType === "recovery";
}

export function markPasswordRecoveryPending(): void {
  try {
    sessionStorage.setItem(CLOUD_PASSWORD_RECOVERY_KEY, "1");
  } catch {
    // sessionStorage is unavailable in some WebView private modes.
  }
}

export function isPasswordRecoveryPending(): boolean {
  try {
    return sessionStorage.getItem(CLOUD_PASSWORD_RECOVERY_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearPasswordRecoveryPending(): void {
  try {
    sessionStorage.removeItem(CLOUD_PASSWORD_RECOVERY_KEY);
  } catch {
    // ignore
  }
}

export function cloudAuthErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("email not confirmed")) {
    return "Confirm the email we sent, then sign in.";
  }
  if (lower.includes("invalid login")) {
    return "That email or password is not right.";
  }
  if (
    lower.includes("already registered") ||
    lower.includes("already been registered") ||
    lower.includes("user already exists")
  ) {
    return "That email already has an account. Sign in instead.";
  }
  if (lower.includes("password should be") || lower.includes("password is known to be")) {
    return "Use a password with at least 8 characters.";
  }
  if (lower.includes("invalid format") || lower.includes("unable to validate email")) {
    return "That email address does not look valid.";
  }
  if (lower.includes("rate limit") || lower.includes("over_email_send_rate_limit")) {
    return "Wait a minute, then request another email.";
  }
  if (lower.includes("same password") || lower.includes("should be different")) {
    return "Choose a password you have not used before.";
  }
  if (lower.includes("expired") || lower.includes("otp_expired") || lower.includes("token has expired")) {
    return "That reset link has expired. Request a new one.";
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed") ||
    lower.includes("err_name_not_resolved") ||
    lower.includes("err_internet_disconnected") ||
    lower.includes("could not resolve") ||
    lower.includes("not configured")
  ) {
    return "Spell Cloud is unreachable. Sign in, new accounts, and password reset need the server.";
  }
  return message.trim() || "Cloud sign in failed";
}
