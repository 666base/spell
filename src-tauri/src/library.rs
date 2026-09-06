//! Spell keeps notes as ordinary files. Sidecar data uses human names:
//! `Spell Library` for app data (like a Photos Library) and `Attachments`
//! for pictures (like Mail). No `.scratch`, `.spell`, `.media`, or `assets`.

use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// User-visible library folder. One place, named like a product.
pub const LIBRARY_DIR: &str = "Spell Library";
pub const ATTACHMENTS_DIR: &str = "Attachments";
pub const SETTINGS_FILE: &str = "settings.json";
pub const BOARDS_FILE: &str = "Boards.json";
pub const MONEY_FILE: &str = "Money.json";
pub const TRASH_DIR: &str = ".trash";

/// Folders Spell never treats as notes. Includes the library plus leftover
/// developer-style names so they disappear from the sidebar after upgrade.
pub const EXCLUDED_DIR_NAMES: &[&str] = &[
    ".git",
    ".obsidian",
    ".scratch",
    ".spell",
    TRASH_DIR,
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

pub fn trash_dir(notes_folder: &Path) -> PathBuf {
    notes_folder.join(TRASH_DIR)
}

fn note_file(root: &Path, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || id.contains('\\') {
        return Err("Invalid note ID".to_string());
    }
    let relative = Path::new(id);
    for component in relative.components() {
        match component {
            Component::Normal(_) => {}
            _ => return Err("Invalid note ID".to_string()),
        }
    }
    let mut path = root.join(relative).into_os_string();
    path.push(".md");
    let path = PathBuf::from(path);
    if !path.starts_with(root) {
        return Err("Invalid note ID".to_string());
    }
    Ok(path)
}

fn unique_file_path(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let stem = file_name.strip_suffix(".md").unwrap_or(&file_name).to_string();
    let parent = path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));
    let mut n = 2;
    loop {
        let mut candidate = parent.join(format!("{stem}-{n}")).into_os_string();
        candidate.push(".md");
        let candidate = PathBuf::from(candidate);
        if !candidate.exists() {
            return candidate;
        }
        n += 1;
    }
}

/// Move a live note file into `.trash`, keeping its vault-relative path.
pub fn move_to_trash(notes_root: &Path, note_file_path: &Path) -> Result<PathBuf, String> {
    let relative = note_file_path
        .strip_prefix(notes_root)
        .map_err(|_| "Note is outside the vault".to_string())?;
    let dest = unique_file_path(trash_dir(notes_root).join(relative));
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::rename(note_file_path, &dest).map_err(|error| error.to_string())?;
    Ok(dest)
}

pub fn restore_from_trash(notes_root: &Path, id: &str) -> Result<PathBuf, String> {
    let src = note_file(&trash_dir(notes_root), id)?;
    if !src.exists() {
        return Err("That note is not in the trash".to_string());
    }
    let dest = unique_file_path(note_file(notes_root, id)?);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::rename(&src, &dest).map_err(|error| error.to_string())?;
    Ok(dest)
}

pub fn delete_from_trash(notes_root: &Path, id: &str) -> Result<(), String> {
    let src = note_file(&trash_dir(notes_root), id)?;
    if src.exists() {
        fs::remove_file(&src).map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn empty_trash(notes_root: &Path) -> Result<(), String> {
    let dir = trash_dir(notes_root);
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|error| error.to_string())?;
    }
    Ok(())
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

/// Copy notes, boards, money, and attachments from one vault into another.
/// Existing destination files that are newer are left alone. The source vault
/// is not deleted — offline notes stay on disk after switching to Spell Cloud.
pub fn merge_notes_vault(from: &Path, to: &Path) -> io::Result<usize> {
    if !from.is_dir() {
        return Ok(0);
    }
    fs::create_dir_all(to)?;
    let from_canon = from.canonicalize().unwrap_or_else(|_| from.to_path_buf());
    let to_canon = to.canonicalize().unwrap_or_else(|_| to.to_path_buf());
    if from_canon == to_canon {
        return Ok(0);
    }

    let mut copied = merge_markdown_tree(from, from, to, 0)?;
    copied += merge_named_dir(&from.join(LIBRARY_DIR), &to.join(LIBRARY_DIR))?;
    copied += merge_named_dir(&from.join(ATTACHMENTS_DIR), &to.join(ATTACHMENTS_DIR))?;
    Ok(copied)
}

fn merge_markdown_tree(root: &Path, directory: &Path, to: &Path, depth: usize) -> io::Result<usize> {
    if depth > 10 {
        return Ok(0);
    }
    let mut copied = 0;
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(error),
    };
    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if path.is_dir() {
            if is_excluded_dir_name(&name_str) {
                continue;
            }
            copied += merge_markdown_tree(root, &path, to, depth + 1)?;
            continue;
        }
        if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
            continue;
        }
        let relative = path.strip_prefix(root).unwrap_or(&path);
        copied += copy_file_if_newer(&path, &to.join(relative))?;
    }
    Ok(copied)
}

fn merge_named_dir(from: &Path, to: &Path) -> io::Result<usize> {
    if !from.is_dir() {
        return Ok(0);
    }
    copy_dir_if_newer(from, to)
}

fn copy_dir_if_newer(from: &Path, to: &Path) -> io::Result<usize> {
    fs::create_dir_all(to)?;
    let mut copied = 0;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let source = entry.path();
        let dest = to.join(entry.file_name());
        if source.is_dir() {
            copied += copy_dir_if_newer(&source, &dest)?;
        } else {
            copied += copy_file_if_newer(&source, &dest)?;
        }
    }
    Ok(copied)
}

fn copy_file_if_newer(from: &Path, to: &Path) -> io::Result<usize> {
    if !should_replace_file(from, to) {
        return Ok(0);
    }
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(from, to)?;
    Ok(1)
}

fn should_replace_file(from: &Path, to: &Path) -> bool {
    let Ok(source) = fs::metadata(from) else {
        return false;
    };
    let Ok(dest) = fs::metadata(to) else {
        return true;
    };
    match (source.modified(), dest.modified()) {
        (Ok(source_modified), Ok(dest_modified)) => source_modified > dest_modified,
        _ => true,
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
        if !dest.exists() && relocate(&source, &dest).is_ok() {
            continue;
        }
        merge_directory(&source, &dest);
        remove_if_empty(&source);
    }

    let nested = library_dir(notes_folder).join(ATTACHMENTS_DIR);
    if nested.exists() && nested != dest {
        moved = true;
        if !dest.exists() && relocate(&nested, &dest).is_ok() {
            return moved;
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
    fn merge_notes_vault_copies_markdown_and_library_without_deleting_source() {
        let from = temp_vault("merge-from");
        let to = temp_vault("merge-to");
        fs::create_dir_all(from.join("Projects")).unwrap();
        fs::write(from.join("Hello.md"), "# Hello\n").unwrap();
        fs::write(from.join("Projects").join("Task.md"), "# Task\n").unwrap();
        fs::create_dir_all(from.join(LIBRARY_DIR)).unwrap();
        fs::write(boards_path(&from), "{\"projects\":[1]}").unwrap();
        fs::create_dir_all(attachments_dir(&from)).unwrap();
        fs::write(attachments_dir(&from).join("pic.png"), b"img").unwrap();
        fs::create_dir_all(to.join("Projects")).unwrap();
        fs::write(to.join("Projects").join("Task.md"), "# Older\n").unwrap();
        fs::write(to.join("Keep.md"), "# Keep\n").unwrap();
        fs::write(from.join("Keep.md"), "# From\n").unwrap();
        let older = UNIX_EPOCH + std::time::Duration::from_secs(10);
        let newer = UNIX_EPOCH + std::time::Duration::from_secs(50);
        let _ = filetime_set(from.join("Hello.md"), newer);
        let _ = filetime_set(from.join("Projects").join("Task.md"), newer);
        let _ = filetime_set(from.join("Keep.md"), older);
        let _ = filetime_set(to.join("Projects").join("Task.md"), older);
        let _ = filetime_set(to.join("Keep.md"), newer);

        let copied = merge_notes_vault(&from, &to).unwrap();
        assert!(copied >= 3);
        assert_eq!(fs::read_to_string(to.join("Hello.md")).unwrap(), "# Hello\n");
        assert_eq!(
            fs::read_to_string(to.join("Projects").join("Task.md")).unwrap(),
            "# Task\n"
        );
        assert_eq!(fs::read_to_string(to.join("Keep.md")).unwrap(), "# Keep\n");
        assert!(boards_path(&to).exists());
        assert!(attachments_dir(&to).join("pic.png").exists());
        assert!(from.join("Hello.md").exists());

        let _ = fs::remove_dir_all(&from);
        let _ = fs::remove_dir_all(&to);
    }

    fn filetime_set(path: PathBuf, when: SystemTime) -> std::io::Result<()> {
        let file = fs::OpenOptions::new().write(true).open(path)?;
        file.set_times(fs::FileTimes::new().set_modified(when))
    }

    #[test]
    fn excluded_names_cover_library_and_legacy_folders() {
        assert!(is_excluded_dir_name("Attachments"));
        assert!(is_excluded_dir_name("Spell Library"));
        assert!(is_excluded_dir_name("assets"));
        assert!(is_excluded_dir_name(".spell"));
        assert!(is_excluded_dir_name(".scratch"));
        assert!(is_excluded_dir_name(".trash"));
        assert!(!is_excluded_dir_name("Projects"));
    }

    #[test]
    fn move_restore_and_empty_trash() {
        let vault = temp_vault("trash");
        let live = vault.join("Work");
        fs::create_dir_all(&live).unwrap();
        let note = live.join("alpha.md");
        fs::write(&note, "# Alpha\n").unwrap();

        let trashed = move_to_trash(&vault, &note).unwrap();
        assert!(!note.exists());
        assert_eq!(trashed, vault.join(".trash").join("Work").join("alpha.md"));
        assert_eq!(fs::read_to_string(&trashed).unwrap(), "# Alpha\n");

        let restored = restore_from_trash(&vault, "Work/alpha").unwrap();
        assert_eq!(restored, note);
        assert!(note.exists());
        assert!(!trashed.exists());

        let _ = move_to_trash(&vault, &note).unwrap();
        empty_trash(&vault).unwrap();
        assert!(!vault.join(".trash").exists());

        let _ = fs::remove_dir_all(&vault);
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
