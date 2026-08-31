//! Spell keeps notes as ordinary files. Sidecar data uses human names:
//! `Spell Library` for app data (like a Photos Library) and `Attachments`
//! for pictures (like Mail). No `.scratch`, `.spell`, `.media`, or `assets`.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// User-visible library folder. One place, named like a product.
pub const LIBRARY_DIR: &str = "Spell Library";
pub const ATTACHMENTS_DIR: &str = "Attachments";
pub const SETTINGS_FILE: &str = "settings.json";
pub const BOARDS_FILE: &str = "Boards.json";
pub const MONEY_FILE: &str = "Money.json";

/// Folders Spell never treats as notes. Includes the library plus leftover
/// developer-style names so they disappear from the sidebar after upgrade.
pub const EXCLUDED_DIR_NAMES: &[&str] = &[
    ".git",
    ".obsidian",
    ".scratch",
    ".spell",
    ".trash",
    ".vaultsync",
    ".media",
    ".assets",
    "assets",
    ATTACHMENTS_DIR,
    LIBRARY_DIR,
];

const LEGACY_ATTACHMENT_DIRS: &[&str] = &["assets", ".assets", ".media"];

pub fn library_dir(notes_folder: &Path) -> PathBuf {
    notes_folder.join(LIBRARY_DIR)
}

pub fn attachments_dir(notes_folder: &Path) -> PathBuf {
    notes_folder.join(ATTACHMENTS_DIR)
}

pub fn settings_path(notes_folder: &Path) -> PathBuf {
    library_dir(notes_folder).join(SETTINGS_FILE)
}

pub fn boards_path(notes_folder: &Path) -> PathBuf {
    library_dir(notes_folder).join(BOARDS_FILE)
}

pub fn money_path(notes_folder: &Path) -> PathBuf {
    library_dir(notes_folder).join(MONEY_FILE)
}

pub fn attachments_relative_path(file_name: &str) -> String {
    format!("{ATTACHMENTS_DIR}/{file_name}")
}

pub fn is_excluded_dir_name(name: &str) -> bool {
    EXCLUDED_DIR_NAMES.contains(&name)
}

pub fn ensure_library_dir(notes_folder: &Path) -> io::Result<PathBuf> {
    let dir = library_dir(notes_folder);
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn ensure_attachments_dir(notes_folder: &Path) -> io::Result<PathBuf> {
    let dir = attachments_dir(notes_folder);
    fs::create_dir_all(&dir)?;
    #[cfg(target_os = "android")]
    {
        let nomedia = dir.join(".nomedia");
        if !nomedia.exists() {
            let _ = fs::write(&nomedia, b"");
        }
    }
    Ok(dir)
}

/// Confirm the notes folder can be written without leaving a permanent file.
pub fn verify_writable(notes_folder: &Path) -> Result<(), String> {
    fs::create_dir_all(notes_folder)
        .map_err(|_| "Spell couldn’t write to this folder.".to_string())?;

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let write_test = notes_folder.join(format!(".tmp-write-{nonce}"));
    fs::write(&write_test, b"ok").map_err(|_| "This folder isn’t writable.".to_string())?;
    let _ = fs::remove_file(&write_test);
    Ok(())
}

/// Move leftover developer folders into Spell Library. Safe to call on every open.
pub fn migrate_legacy_library(notes_folder: &Path) {
    migrate_named_files(notes_folder, ".scratch", &[(SETTINGS_FILE, SETTINGS_FILE)]);
    migrate_named_files(
        notes_folder,
        ".spell",
        &[("kanban.json", BOARDS_FILE), ("finance.json", MONEY_FILE)],
    );
    if migrate_attachment_dirs(notes_folder) {
        rewrite_markdown_tree(notes_folder, 0);
    }
}

pub fn rewrite_legacy_attachment_links(content: &str) -> String {
    const REPLACEMENTS: &[(&str, &str)] = &[
        ("(assets/", "(Attachments/"),
        ("(.assets/", "(Attachments/"),
        ("(.media/", "(Attachments/"),
        ("(<assets/", "(<Attachments/"),
        ("(Spell Library/Attachments/", "(Attachments/"),
        ("(<Spell Library/Attachments/", "(<Attachments/"),
        ("src=\"assets/", "src=\"Attachments/"),
        ("src='assets/", "src='Attachments/"),
        ("src=\"Spell Library/Attachments/", "src=\"Attachments/"),
        ("src='Spell Library/Attachments/", "src='Attachments/"),
    ];
    let mut rewritten = content.to_string();
    for (from, to) in REPLACEMENTS {
        if rewritten.contains(from) {
            rewritten = rewritten.replace(from, to);
        }
    }
    rewritten
}

fn migrate_named_files(notes_folder: &Path, legacy_dir_name: &str, renames: &[(&str, &str)]) {
    let legacy_dir = notes_folder.join(legacy_dir_name);
    if !legacy_dir.exists() {
        return;
    }

    let dest_dir = library_dir(notes_folder);
    let Ok(entries) = fs::read_dir(&legacy_dir) else {
        return;
    };

    for entry in entries.flatten() {
        let source = entry.path();
        let Some(file_name) = entry.file_name().to_str().map(ToString::to_string) else {
            continue;
        };
        if file_name.starts_with('.') {
            let _ = fs::remove_file(&source);
            continue;
        }

        let dest_name = renames
            .iter()
            .find(|(from, _)| *from == file_name)
            .map(|(_, to)| (*to).to_string())
            .unwrap_or(file_name);
        let dest = dest_dir.join(dest_name);
        let _ = relocate(&source, &dest);
    }

    remove_if_empty(&legacy_dir);
}

fn migrate_attachment_dirs(notes_folder: &Path) -> bool {
    let dest = attachments_dir(notes_folder);
    let mut moved = false;
    for name in LEGACY_ATTACHMENT_DIRS {
        let source = notes_folder.join(name);
        if !source.exists() {
            continue;
        }
        moved = true;
        if !dest.exists() {
            if relocate(&source, &dest).is_ok() {
                continue;
            }
        }
        merge_directory(&source, &dest);
        remove_if_empty(&source);
    }

    let nested = library_dir(notes_folder).join(ATTACHMENTS_DIR);
    if nested.exists() && nested != dest {
        moved = true;
        if !dest.exists() {
            if relocate(&nested, &dest).is_ok() {
                return moved;
            }
        }
        merge_directory(&nested, &dest);
        remove_if_empty(&nested);
    }

    moved
}

fn relocate(source: &Path, dest: &Path) -> io::Result<()> {
    if dest.exists() {
        if source.is_file() {
            let _ = fs::remove_file(source);
        }
        return Ok(());
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    match fs::rename(source, dest) {
        Ok(()) => Ok(()),
        Err(_) => {
            if source.is_dir() {
                copy_dir(source, dest)?;
                fs::remove_dir_all(source)
            } else {
                fs::copy(source, dest)?;
                fs::remove_file(source)
            }
        }
    }
}

fn merge_directory(source: &Path, dest: &Path) {
    let Ok(entries) = fs::read_dir(source) else {
        return;
    };
    let _ = fs::create_dir_all(dest);
    for entry in entries.flatten() {
        let _ = relocate(&entry.path(), &dest.join(entry.file_name()));
    }
}

fn copy_dir(source: &Path, dest: &Path) -> io::Result<()> {
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let target = dest.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

fn remove_if_empty(path: &Path) {
    if let Ok(mut entries) = fs::read_dir(path) {
        if entries.next().is_none() {
            let _ = fs::remove_dir(path);
        }
    }
}

fn rewrite_markdown_tree(directory: &Path, depth: usize) {
    if depth > 10 {
        return;
    }
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if path.is_dir() {
            if is_excluded_dir_name(&name_str) {
                continue;
            }
            rewrite_markdown_tree(&path, depth + 1);
            continue;
        }
        if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
            continue;
        }
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let rewritten = rewrite_legacy_attachment_links(&content);
        if rewritten != content {
            let _ = fs::write(&path, rewritten);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_vault(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "spell-library-{}-{}",
            name,
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn relative_attachment_path_is_human_readable() {
        assert_eq!(
            attachments_relative_path("photo.png"),
            "Attachments/photo.png"
        );
    }

    #[test]
    fn migrates_legacy_developer_folders() {
        let vault = temp_vault("migrate");
        fs::create_dir_all(vault.join(".scratch")).unwrap();
        fs::write(vault.join(".scratch").join("settings.json"), "{}").unwrap();
        fs::create_dir_all(vault.join(".spell")).unwrap();
        fs::write(vault.join(".spell").join("kanban.json"), "{\"ok\":true}").unwrap();
        fs::write(vault.join(".spell").join("finance.json"), "{\"ok\":true}").unwrap();
        fs::create_dir_all(vault.join("assets")).unwrap();
        fs::write(vault.join("assets").join("shot.png"), b"img").unwrap();
        fs::create_dir_all(vault.join(".media")).unwrap();
        fs::write(vault.join(".media").join("clip.jpg"), b"img").unwrap();
        fs::write(vault.join("note.md"), "![Shot](assets/shot.png)\n").unwrap();

        migrate_legacy_library(&vault);

        assert!(settings_path(&vault).exists());
        assert!(boards_path(&vault).exists());
        assert!(money_path(&vault).exists());
        assert!(attachments_dir(&vault).join("shot.png").exists());
        assert!(attachments_dir(&vault).join("clip.jpg").exists());
        assert!(!vault.join(".scratch").exists());
        assert!(!vault.join(".spell").exists());
        assert!(!vault.join("assets").exists());
        assert!(!vault.join(".media").exists());
        assert_eq!(
            fs::read_to_string(vault.join("note.md")).unwrap(),
            "![Shot](Attachments/shot.png)\n"
        );

        let _ = fs::remove_dir_all(&vault);
    }

    #[test]
    fn excluded_names_cover_library_and_legacy_folders() {
        assert!(is_excluded_dir_name("Attachments"));
        assert!(is_excluded_dir_name("Spell Library"));
        assert!(is_excluded_dir_name("assets"));
        assert!(is_excluded_dir_name(".spell"));
        assert!(is_excluded_dir_name(".scratch"));
        assert!(!is_excluded_dir_name("Projects"));
    }

    #[test]
    fn rewrites_legacy_image_links() {
        let markdown = "![Photo](assets/shot.png)";
        assert_eq!(
            rewrite_legacy_attachment_links(markdown),
            "![Photo](Attachments/shot.png)"
        );
    }
}
