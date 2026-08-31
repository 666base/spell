import { open } from "@tauri-apps/plugin-dialog";

export async function pickNotesToImport(kind: "files" | "folder"): Promise<string[] | null> {
  if (kind === "folder") {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Import folder",
    });
    if (typeof selected !== "string" || !selected) return null;
    return [selected];
  }

  const selected = await open({
    multiple: true,
    directory: false,
    title: "Import notes",
    filters: [{ name: "Notes", extensions: ["md", "markdown", "txt", "csv"] }],
  });
  if (!selected) return null;
  return Array.isArray(selected) ? selected : [selected];
}
