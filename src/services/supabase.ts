import type { EmailOtpType, Session, SupabaseClient } from "@supabase/supabase-js";
import {
  CLOUD_AUTH_CALLBACK_URL,
  CLOUD_AUTH_ERROR_EVENT,
  CLOUD_PASSWORD_RECOVERY_EVENT,
  isCloudPasswordRecovery,
  markPasswordRecoveryPending,
  parseCloudAuthCallback,
} from "../lib/cloudAuth";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = (
  import.meta.env.VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();

let clientPromise: Promise<SupabaseClient> | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseKey);
}

export function getSupabaseUrl(): string | undefined {
  return supabaseUrl;
}

export async function isSpellCloudReachable(): Promise<boolean> {
  if (!supabaseUrl) return false;
  try {
    const headers: Record<string, string> = {};
    if (supabaseKey) headers.apikey = supabaseKey;
    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/auth/v1/health`,
      { headers },
    );
    return response.ok;
  } catch {
    return false;
  }
}

export function getSupabase(): Promise<SupabaseClient> {
  if (!supabaseUrl || !supabaseKey) {
    return Promise.reject(new Error("Spell cloud is not configured"));
  }

  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(supabaseUrl, supabaseKey, {
        auth: {
          flowType: "pkce",
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      }),
    );
  }

  return clientPromise;
}

export async function getCloudSession(): Promise<Session | null> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signInToCloud(
  email: string,
  password: string,
): Promise<Session> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  if (!data.session) throw new Error("Sign in did not create a session");
  return data.session;
}

export async function createCloudAccount(
  email: string,
  password: string,
): Promise<Session | null> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: CLOUD_AUTH_CALLBACK_URL },
  });
  if (error) throw error;
  return data.session;
}

export async function resendCloudConfirmationEmail(email: string): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: CLOUD_AUTH_CALLBACK_URL },
  });
  if (error) throw error;
}

export async function requestCloudPasswordReset(email: string): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: CLOUD_AUTH_CALLBACK_URL,
  });
  if (error) throw error;
}

export async function updateCloudPassword(password: string): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOutOfCloud(): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

let authListenerStarted = false;
let handlingAuthUrl: Promise<Session | null> | null = null;

function emitAuthSession(session: Session): void {
  window.dispatchEvent(
    new CustomEvent("spell-cloud-session-ready", { detail: session }),
  );
}

function emitPasswordRecovery(session?: Session): void {
  markPasswordRecoveryPending();
  window.dispatchEvent(
    new CustomEvent(CLOUD_PASSWORD_RECOVERY_EVENT, { detail: session }),
  );
}

function otpTypeFromCallback(type: string | undefined): EmailOtpType {
  if (
    type === "signup" ||
    type === "invite" ||
    type === "magiclink" ||
    type === "recovery" ||
    type === "email_change" ||
    type === "email"
  ) {
    return type;
  }
  return "email";
}

export async function handleCloudAuthUrl(url: string): Promise<Session | null> {
  const callback = parseCloudAuthCallback(url);
  if (!callback) return null;
  if (callback.error) {
    throw new Error(callback.error);
  }

  const supabase = await getSupabase();
  let session: Session | null = null;

  if (callback.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(
      callback.code,
    );
    if (error) throw error;
    session = data.session;
  } else if (callback.tokenHash) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: callback.tokenHash,
      type: otpTypeFromCallback(callback.otpType),
    });
    if (error) throw error;
    session = data.session;
  } else if (callback.accessToken && callback.refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: callback.accessToken,
      refresh_token: callback.refreshToken,
    });
    if (error) throw error;
    session = data.session;
  } else {
    return null;
  }

  if (!session) {
    throw new Error("Sign in did not create a session");
  }
  if (isCloudPasswordRecovery(callback.otpType)) {
    emitPasswordRecovery(session);
  } else {
    emitAuthSession(session);
  }
  return session;
}

async function consumeCloudAuthUrl(url: string): Promise<Session | null> {
  if (handlingAuthUrl) return handlingAuthUrl;
  handlingAuthUrl = handleCloudAuthUrl(url).finally(() => {
    handlingAuthUrl = null;
  });
  return handlingAuthUrl;
}

export function startCloudAuthListener(): () => void {
  if (authListenerStarted) return () => {};
  authListenerStarted = true;

  const onUrl = (url: string) => {
    void consumeCloudAuthUrl(url).catch((error) => {
      console.error("Cloud auth callback failed:", error);
      window.dispatchEvent(
        new CustomEvent(CLOUD_AUTH_ERROR_EVENT, {
          detail: error instanceof Error ? error.message : String(error),
        }),
      );
    });
  };

  const onCustomUrl = (event: Event) => {
    const url = (event as CustomEvent<string>).detail;
    if (typeof url === "string") onUrl(url);
  };
  window.addEventListener("spell-auth-url", onCustomUrl);

  void getSupabase()
    .then((supabase) => {
      supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") {
          emitPasswordRecovery();
        }
      });
    })
    .catch(() => {});

  void import("@tauri-apps/plugin-deep-link")
    .then(async ({ getCurrent, onOpenUrl }) => {
      const current = await getCurrent();
      current?.forEach(onUrl);
      await onOpenUrl((urls) => {
        urls.forEach(onUrl);
      });
    })
    .catch(() => {
      // Deep links are only available in the packaged desktop/Android app.
    });

  return () => {};
}
