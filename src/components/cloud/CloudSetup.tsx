import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useNotes } from "../../context/NotesContext";
import * as notesService from "../../services/notes";
import {
  createCloudAccount,
  signInToCloud,
} from "../../services/supabase";
import { setActiveCloudUser } from "../../services/cloudSync";
import { Button, Input } from "../ui";

interface CloudSetupProps {
  onBack: () => void;
}

export default function CloudSetup({ onBack }: CloudSetupProps) {
  const { syncNotesFolder } = useNotes();
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const finishSetup = async (userId: string) => {
    setActiveCloudUser(userId);
    const path = await notesService.setCloudNotesFolder(userId);
    await syncNotesFolder(path);
    window.dispatchEvent(new CustomEvent("spell-cloud-session-ready"));
  };

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
        await finishSetup(session.user.id);
      } else {
        const session = await signInToCloud(email.trim(), password);
        await finishSetup(session.user.id);
      }
    } catch (error: any) {
      console.error("Cloud setup error:", error);
      toast.error(error?.message || String(error) || "Cloud sign in failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="w-72 p-6 flex flex-col gap-3" onSubmit={handleSubmit}>
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
      <Button type="button" variant="link" size="sm" onClick={onBack}>
        Back
      </Button>
    </form>
  );
}
