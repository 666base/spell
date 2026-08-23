import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { createCloudAccount, signInToCloud } from "../../services/supabase";
import { Button, Input } from "../ui";
import { cn } from "../../lib/utils";

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
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      if (mode === "create") {
        const session = await createCloudAccount(email.trim(), password);
        if (!session) {
          toast.success("Check your email, then return here and sign in.");
          setMode("sign-in");
          return;
        }
        await onSignedIn(session.user.id);
      } else {
        const session = await signInToCloud(email.trim(), password);
        await onSignedIn(session.user.id);
      }
    } catch (error) {
      console.error("Cloud setup error:", error);
      toast.error(
        error instanceof Error ? error.message : "Cloud sign in failed",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className={cn("flex flex-col gap-3", className)} onSubmit={handleSubmit}>
      <Input
        type="email"
        autoComplete="email"
        placeholder="Email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        autoFocus
      />
      <Input
        type="password"
        autoComplete={mode === "create" ? "new-password" : "current-password"}
        placeholder="Password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        minLength={8}
        required
      />
      <Button type="submit" variant="primary" size="xl" disabled={isSubmitting}>
        {isSubmitting
          ? "Connecting..."
          : mode === "create"
            ? "Create account"
            : "Sign in"}
      </Button>
      <Button
        type="button"
        variant="link"
        size="md"
        onClick={() => setMode(mode === "create" ? "sign-in" : "create")}
      >
        {mode === "create" ? "I already have an account" : "Create an account"}
      </Button>
      {onCancel && (
        <Button type="button" variant="link" size="sm" onClick={onCancel}>
          Back
        </Button>
      )}
    </form>
  );
}
