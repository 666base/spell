import { useNotes } from "../../context/NotesContext";
import { activateCloudVault } from "../../services/cloudSync";
import { CloudAuthForm } from "./CloudAuthForm";

interface CloudSetupProps {
  onBack: () => void;
}

export default function CloudSetup({ onBack }: CloudSetupProps) {
  const { syncNotesFolder } = useNotes();

  return (
    <CloudAuthForm
      className="w-72 p-6"
      onCancel={onBack}
      onSignedIn={async (userId) => {
        await activateCloudVault(userId, syncNotesFolder);
      }}
    />
  );
}
