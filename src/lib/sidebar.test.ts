import { describe, expect, it } from "vitest";
import { libraryDisplayName } from "./sidebar";

describe("libraryDisplayName", () => {
  it("uses the vault folder name", () => {
    expect(libraryDisplayName("/home/me/Documents/Spell Library")).toBe("Spell Library");
    expect(libraryDisplayName("/home/me/Notes")).toBe("Notes");
  });

  it("does not put a cloud UUID in the sidebar brand", () => {
    expect(
      libraryDisplayName(
        "/home/me/.local/share/spell/cloud-notes/88a16271-cff4-4e2a-9b1d-aaaaaaaaaaaa",
      ),
    ).toBe("Library");
  });
});
