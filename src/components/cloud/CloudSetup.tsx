import { useCallback, useEffect, useRef, useState } from "react";
import { useNotes } from "../../context/NotesContext";
import { activateCloudVault } from "../../services/cloudSync";
import { getCloudSession } from "../../services/supabase";
import { isPasswordRecoveryPending } from "../../lib/cloudAuth";
import { CloudAuthForm } from "./CloudAuthForm";

interface CloudSetupProps {
  onBack: () => void;
}

export default function CloudSetup({ onBack }: CloudSetupProps) {
  const { syncNotesFolder } = useNotes();
  const [isOpeningVault, setIsOpeningVault] = useState(false);
  const openingRef = useRef(false);

  const handleSignedIn = useCallback(
    async (userId: string) => {
      if (openingRef.current) return;
      openingRef.current = true;
      setIsOpeningVault(true);
      try {
        await activateCloudVault(userId, syncNotesFolder);
      } catch (error) {
        openingRef.current = false;
        setIsOpeningVault(false);
        throw error;
      }
    },
    [syncNotesFolder],
  );

  useEffect(() => {
    let cancelled = false;
    const openIfSignedIn = async () => {
      try {
        const session = await getCloudSession();
        if (!session || cancelled || isPasswordRecoveryPending()) return;
        await handleSignedIn(session.user.id);
      } catch (error) {
        console.error("Failed to resume cloud session:", error);
      }
    };
    void openIfSignedIn();
    window.addEventListener("spell-cloud-session-ready", openIfSignedIn);
    return () => {
      cancelled = true;
      window.removeEventListener("spell-cloud-session-ready", openIfSignedIn);
    };
  }, [handleSignedIn]);

  if (isOpeningVault) {
    return (
      <p className="w-72 p-6 text-sm text-text-muted">Opening your cloud vault…</p>
    );
  }

  return (
    <CloudAuthForm
      className="w-72 p-6"
      onCancel={onBack}
      onSignedIn={handleSignedIn}
    />
  );
}
