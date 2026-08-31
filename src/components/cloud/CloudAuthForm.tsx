import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  CLOUD_AUTH_ERROR_EVENT,
  CLOUD_PASSWORD_RECOVERY_EVENT,
  clearPasswordRecoveryPending,
  cloudAuthErrorMessage,
  isPasswordRecoveryPending,
} from "../../lib/cloudAuth";
import {
  createCloudAccount,
  getCloudSession,
  isSpellCloudReachable,
  requestCloudPasswordReset,
  resendCloudConfirmationEmail,
  signInToCloud,
  updateCloudPassword,
} from "../../services/supabase";
import { Button, Input } from "../ui";
import { cn } from "../../lib/utils";

type AuthMode = "sign-in" | "create" | "forgot" | "reset";

interface CloudAuthFormProps {
  onSignedIn: (userId: string) => Promise<void>;
  onCancel?: () => void;
  className?: string;
}

export function CloudAuthForm({
  onSignedIn,
  onCancel,
  className,
}: CloudAuthFormProps) {
  const [mode, setMode] = useState<AuthMode>(() =>
    isPasswordRecoveryPending() ? "reset" : "sign-in",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [awaitingEmail, setAwaitingEmail] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const showAuthError = (error: unknown) => {
    const message = cloudAuthErrorMessage(error);
    setFormError(message);
    toast.error(message, { duration: Infinity });
  };

  useEffect(() => {
    const showReset = () => {
      setMode("reset");
      setAwaitingEmail(false);
      setResetSent(false);
      setPassword("");
      setConfirmPassword("");
      setPasswordError(null);
      setFormError(null);
    };
    const onAuthError = (event: Event) => {
      showAuthError((event as CustomEvent<string>).detail);
    };
    if (isPasswordRecoveryPending()) showReset();
    window.addEventListener(CLOUD_PASSWORD_RECOVERY_EVENT, showReset);
    window.addEventListener(CLOUD_AUTH_ERROR_EVENT, onAuthError);
    return () => {
      window.removeEventListener(CLOUD_PASSWORD_RECOVERY_EVENT, showReset);
      window.removeEventListener(CLOUD_AUTH_ERROR_EVENT, onAuthError);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void isSpellCloudReachable().then((reachable) => {
      if (!cancelled && !reachable) {
        setFormError(
          "Spell Cloud is unreachable. Sign in, new accounts, and password reset need the server.",
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setPasswordError(null);
    setFormError(null);
    setAwaitingEmail(false);
    setResetSent(false);
    setConfirmPassword("");
    if (next !== "reset") setPassword("");
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedEmail = email.trim();
    setPasswordError(null);
    setFormError(null);

    if (mode === "forgot") {
      if (!trimmedEmail) return;
      setIsSubmitting(true);
      try {
        await requestCloudPasswordReset(trimmedEmail);
        setResetSent(true);
        toast.success("Check your email for a reset link.", {
          duration: Infinity,
          description: "If an account exists, the message is on its way.",
        });
      } catch (error) {
        showAuthError(error);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (mode === "reset") {
      if (password !== confirmPassword) {
        setPasswordError("Passwords do not match.");
        return;
      }
      setIsSubmitting(true);
      try {
        await updateCloudPassword(password);
        clearPasswordRecoveryPending();
        const session = await getCloudSession();
        if (!session) throw new Error("Sign in did not create a session");
        await onSignedIn(session.user.id);
      } catch (error) {
        showAuthError(error);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (mode === "create" && password !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    try {
      if (mode === "create") {
        const session = await createCloudAccount(trimmedEmail, password);
        if (!session) {
          setAwaitingEmail(true);
          toast.success("Check your email to confirm this account.", {
            duration: Infinity,
            description: "Open the message, then return to Spell.",
          });
          return;
        }
        await onSignedIn(session.user.id);
      } else {
        const session = await signInToCloud(trimmedEmail, password);
        await onSignedIn(session.user.id);
      }
    } catch (error) {
      console.error("Cloud setup error:", error);
      showAuthError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (isResending || !email.trim()) return;
    setIsResending(true);
    try {
      await resendCloudConfirmationEmail(email.trim());
      toast.success("Confirmation email sent again.", { duration: 8000 });
    } catch (error) {
      showAuthError(error);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <form
      className={cn("flex flex-col gap-3", className)}
      onSubmit={handleSubmit}
      aria-busy={isSubmitting}
    >
      {formError && (
        <p id="cloud-auth-error" className="text-sm leading-5 text-red-500" role="alert">
          {formError}
        </p>
      )}
      {mode === "reset" ? (
        <>
          <p className="text-sm text-text">Choose a new password</p>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text">New password</span>
            <Input
              id="cloud-password-new"
              name="new-password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setPasswordError(null);
              }}
              minLength={8}
              required
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text">Confirm password</span>
            <Input
              id="cloud-password-new-confirm"
              name="new-password-confirm"
              type="password"
              autoComplete="new-password"
              placeholder="Repeat password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setPasswordError(null);
              }}
              minLength={8}
              required
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? "cloud-password-error" : undefined}
            />
            {passwordError && (
              <p id="cloud-password-error" className="text-xs text-red-500" role="alert">
                {passwordError}
              </p>
            )}
          </label>
          <Button type="submit" variant="primary" size="xl" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save password"}
          </Button>
        </>
      ) : mode === "forgot" || resetSent ? (
        resetSent ? (
          <div className="rounded-lg border border-border bg-bg-muted/50 p-3" role="status">
            <p className="text-sm text-text">Check {email.trim()}</p>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              Open the reset link, then return here to choose a new password.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setResetSent(false);
                  setMode("forgot");
                }}
                disabled={isSubmitting}
              >
                Send again
              </Button>
              <Button type="button" variant="link" size="sm" onClick={() => switchMode("sign-in")}>
                Sign in
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-text">Reset your password</p>
            <p className="text-xs leading-5 text-text-muted">
              Spell will send a reset link to this email.
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-text">Email</span>
              <Input
                id="cloud-email-reset"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoFocus
              />
            </label>
            <Button type="submit" variant="primary" size="xl" disabled={isSubmitting}>
              {isSubmitting ? "Sending…" : "Send reset link"}
            </Button>
            <Button type="button" variant="link" size="md" onClick={() => switchMode("sign-in")}>
              Back to sign in
            </Button>
          </>
        )
      ) : awaitingEmail ? (
        <div className="rounded-lg border border-border bg-bg-muted/50 p-3" role="status">
          <p className="text-sm text-text">Check {email.trim()}</p>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            Open the confirmation email, then come back and sign in.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResend}
              disabled={isResending}
            >
              {isResending ? "Sending…" : "Resend email"}
            </Button>
            <Button type="button" variant="link" size="sm" onClick={() => switchMode("sign-in")}>
              Sign in
            </Button>
          </div>
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text">Email</span>
            <Input
              id="cloud-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text">Password</span>
            <Input
              id="cloud-password"
              name={mode === "create" ? "new-password" : "current-password"}
              type="password"
              autoComplete={mode === "create" ? "new-password" : "current-password"}
              placeholder={mode === "create" ? "At least 8 characters" : "Password"}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setPasswordError(null);
              }}
              minLength={8}
              required
            />
          </label>
          {mode === "create" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-text">Confirm password</span>
              <Input
                id="cloud-password-confirm"
                name="new-password-confirm"
                type="password"
                autoComplete="new-password"
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setPasswordError(null);
                }}
                minLength={8}
                required
                aria-invalid={passwordError ? true : undefined}
                aria-describedby={passwordError ? "cloud-password-error" : undefined}
              />
              {passwordError && (
                <p id="cloud-password-error" className="text-xs text-red-500" role="alert">
                  {passwordError}
                </p>
              )}
            </label>
          )}
          <Button type="submit" variant="primary" size="xl" disabled={isSubmitting}>
            {isSubmitting
              ? mode === "create"
                ? "Creating account…"
                : "Signing in…"
              : mode === "create"
                ? "Create account"
                : "Sign in"}
          </Button>
          {mode === "sign-in" && (
            <Button type="button" variant="link" size="md" onClick={() => switchMode("forgot")}>
              Forgot password?
            </Button>
          )}
        </>
      )}
      {mode !== "forgot" && mode !== "reset" && !resetSent && (
        <Button
          type="button"
          variant="link"
          size="md"
          onClick={() => switchMode(mode === "create" ? "sign-in" : "create")}
        >
          {mode === "create" ? "I already have an account" : "Create an account"}
        </Button>
      )}
      {onCancel && mode !== "reset" && (
        <Button type="button" variant="link" size="sm" onClick={onCancel}>
          Back
        </Button>
      )}
    </form>
  );
}
