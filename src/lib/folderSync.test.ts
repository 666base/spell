import { describe, expect, it } from "vitest";
import {
  activeSyncDestination,
  detectFolderSyncKind,
  folderSyncOption,
  githubRepoLabel,
  isGitHubRemote,
  parseFolderSyncKind,
} from "./folderSync";

describe("detectFolderSyncKind", () => {
  it("recognizes GitHub, Google Drive, Dropbox, OneDrive, iCloud, and Nextcloud folders", () => {
    expect(detectFolderSyncKind("/home/me/github/spell-notes")).toBe("github");
    expect(detectFolderSyncKind("/home/me/Google Drive/Spell")).toBe("drive");
    expect(detectFolderSyncKind("C:\\Users\\me\\GoogleDrive\\Notes")).toBe("drive");
    expect(detectFolderSyncKind("/home/me/Dropbox/Spell")).toBe("dropbox");
    expect(detectFolderSyncKind("C:\\Users\\me\\Dropbox\\Notes")).toBe("dropbox");
    expect(detectFolderSyncKind("/home/me/OneDrive/Spell")).toBe("onedrive");
    expect(detectFolderSyncKind("/Users/me/Library/Mobile Documents/com~apple~CloudDocs")).toBe(
      "icloud",
    );
    expect(detectFolderSyncKind("/home/me/Nextcloud/Notes")).toBe("nextcloud");
  });

  it("treats an ordinary folder as this computer", () => {
    expect(detectFolderSyncKind("/home/me/Documents/notes")).toBe("folder");
    expect(detectFolderSyncKind(null)).toBe("folder");
  });
});

describe("activeSyncDestination", () => {
  it("prefers Spell Cloud over a Drive path while cloud sync is on", () => {
    expect(activeSyncDestination(true, "/home/me/Google Drive/Spell")).toBe("cloud");
    expect(activeSyncDestination(false, "/home/me/Dropbox/Spell")).toBe("dropbox");
  });

  it("treats a GitHub remote as GitHub even when the folder path is ordinary", () => {
    expect(
      activeSyncDestination(false, "/home/me/Documents/notes", {
        remoteUrl: "https://github.com/me/spell-notes.git",
      }),
    ).toBe("github");
  });

  it("keeps an explicit GitHub choice before a remote is added", () => {
    expect(
      activeSyncDestination(false, "/home/me/Documents/notes", {
        preferredKind: "github",
      }),
    ).toBe("github");
  });
});

describe("github remotes", () => {
  it("recognizes HTTPS and SSH GitHub URLs", () => {
    expect(isGitHubRemote("https://github.com/me/notes.git")).toBe(true);
    expect(isGitHubRemote("git@github.com:me/notes.git")).toBe(true);
    expect(isGitHubRemote("https://gitlab.com/me/notes.git")).toBe(false);
  });

  it("shows user/repo for a GitHub URL", () => {
    expect(githubRepoLabel("https://github.com/me/spell-notes.git")).toBe("me/spell-notes");
    expect(githubRepoLabel("git@github.com:me/spell-notes.git")).toBe("me/spell-notes");
  });
});

describe("folderSyncOption", () => {
  it("returns the Dropbox copy for the folder picker", () => {
    expect(folderSyncOption("dropbox").dialogTitle).toBe("Choose Dropbox folder");
  });

  it("parses a saved GitHub kind", () => {
    expect(parseFolderSyncKind("github")).toBe("github");
    expect(parseFolderSyncKind("nope")).toBeNull();
  });
});
