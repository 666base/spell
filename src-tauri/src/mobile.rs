use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

const EXCLUDED_DIRECTORIES: &[&str] = &[".git", ".obsidian", ".scratch", ".trash"];
const MAX_NOTE_DEPTH: usize = 10;

#[derive(Debug, Clone, Serialize)]
struct NoteMetadata {
    id: String,
    title: String,
    preview: String,
    modified: i64,
}

#[derive(Debug, Clone, Serialize)]
struct Note {
    id: String,
    title: String,
    content: String,
    path: String,
    modified: i64,
}

#[derive(Debug, Clone, Serialize)]
struct SearchResult {
    id: String,
    title: String,
    preview: String,
    modified: i64,
    score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct AppConfig {
    notes_folder: Option<String>,
    cloud_user_id: Option<String>,
}

struct AppState {
    config: Mutex<AppConfig>,
}

fn default_settings() -> Value {
    json!({
        "theme": { "mode": "system" },
        "gitEnabled": false,
        "foldersEnabled": true
    })
}

fn modified_seconds(path: &Path) -> i64 {
    fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory)
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("config.json"))
}

fn load_config(app: &AppHandle) -> AppConfig {
    let Ok(path) = config_path(app) else {
        return AppConfig::default();
    };

    fs::read_to_string(path)
        .ok()
        .and_then(|contents| serde_json::from_str(&contents).ok())
        .unwrap_or_default()
}

fn write_atomic(path: &Path, contents: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Cannot determine parent directory")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let temporary = parent.join(format!(
        ".{}.{}.tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("spell"),
        nonce
    ));
    fs::write(&temporary, contents).map_err(|error| error.to_string())?;
    fs::rename(&temporary, path).map_err(|error| error.to_string())
}

fn save_config(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let contents = serde_json::to_vec_pretty(config).map_err(|error| error.to_string())?;
    write_atomic(&path, &contents)
}

fn settings_path(vault: &Path) -> PathBuf {
    vault.join(".scratch").join("settings.json")
}

fn load_settings(vault: &Path) -> Value {
    let path = settings_path(vault);
    let mut settings = fs::read_to_string(path)
        .ok()
        .and_then(|contents| serde_json::from_str::<Value>(&contents).ok())
        .filter(Value::is_object)
        .unwrap_or_else(default_settings);

    if settings.get("theme").and_then(Value::as_object).is_none() {
        settings["theme"] = json!({ "mode": "system" });
    }
    if settings.get("gitEnabled").is_none() {
        settings["gitEnabled"] = Value::Bool(false);
    }
    settings
}

fn save_settings(vault: &Path, settings: &Value) -> Result<(), String> {
    if !settings.is_object() {
        return Err("Invalid settings payload".to_string());
    }
    let contents = serde_json::to_vec_pretty(settings).map_err(|error| error.to_string())?;
    write_atomic(&settings_path(vault), &contents)
}

fn validate_relative_path(path: &str, label: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(format!("{} cannot be empty", label));
    }
    if trimmed.contains('\\') {
        return Err(format!("Invalid {}", label));
    }

    let relative = Path::new(trimmed);
    for component in relative.components() {
        if !matches!(component, Component::Normal(_)) {
            return Err(format!("Invalid {}", label));
        }
    }
    Ok(relative.to_path_buf())
}

fn vault_path_from_config(state: &State<AppState>) -> Result<PathBuf, String> {
    state
        .config
        .lock()
        .map_err(|_| "Spell storage is unavailable".to_string())?
        .notes_folder
        .as_ref()
        .map(PathBuf::from)
        .ok_or("Notes folder not set".to_string())
}

fn note_path(vault: &Path, id: &str) -> Result<PathBuf, String> {
    let relative = validate_relative_path(id, "note ID")?;
    let mut path = vault.join(relative).into_os_string();
    path.push(".md");
    let path = PathBuf::from(path);
    if !path.starts_with(vault) {
        return Err("Invalid note ID".to_string());
    }
    Ok(path)
}

fn folder_path(vault: &Path, relative: &str) -> Result<PathBuf, String> {
    let path = vault.join(validate_relative_path(relative, "folder path")?);
    if !path.starts_with(vault) {
        return Err("Invalid folder path".to_string());
    }
    Ok(path)
}

fn relative_note_id(vault: &Path, path: &Path) -> Option<String> {
    let relative = path
        .strip_prefix(vault)
        .ok()?
        .to_string_lossy()
        .replace('\\', "/");
    relative.strip_suffix(".md").map(ToString::to_string)
}

fn extract_title(content: &str) -> String {
    content
        .lines()
        .find_map(|line| line.trim_start().strip_prefix("# "))
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .or_else(|| content.lines().map(str::trim).find(|line| !line.is_empty()))
        .unwrap_or("Untitled")
        .chars()
        .take(120)
        .collect()
}

fn preview(content: &str) -> String {
    content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(180)
        .collect()
}

fn collect_notes(vault: &Path, directory: &Path, depth: usize, notes: &mut Vec<NoteMetadata>) {
    if depth > MAX_NOTE_DEPTH {
        return;
    }
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            let name = entry.file_name();
            if !EXCLUDED_DIRECTORIES
                .iter()
                .any(|excluded| name == *excluded)
            {
                collect_notes(vault, &path, depth + 1, notes);
            }
            continue;
        }
        if !file_type.is_file()
            || path.extension().and_then(|extension| extension.to_str()) != Some("md")
        {
            continue;
        }
        let (Some(id), Ok(content)) = (relative_note_id(vault, &path), fs::read_to_string(&path))
        else {
            continue;
        };
        notes.push(NoteMetadata {
            id,
            title: extract_title(&content),
            preview: preview(&content),
            modified: modified_seconds(&path),
        });
    }
}

fn note_from_path(id: String, path: PathBuf) -> Result<Note, String> {
    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    Ok(Note {
        id,
        title: extract_title(&content),
        content,
        path: path.to_string_lossy().into_owned(),
        modified: modified_seconds(&path),
    })
}

fn ensure_vault(app: &AppHandle, state: &State<AppState>, path: PathBuf) -> Result<String, String> {
    fs::create_dir_all(path.join("assets")).map_err(|error| error.to_string())?;
    fs::create_dir_all(path.join(".scratch")).map_err(|error| error.to_string())?;
    let write_test = path.join(".scratch").join(".spell-write-test");
    fs::write(&write_test, b"ok")
        .map_err(|error| format!("Notes folder is not writable: {}", error))?;
    let _ = fs::remove_file(write_test);

    let normalized = path.to_string_lossy().into_owned();
    let config = {
        let mut config = state
            .config
            .lock()
            .map_err(|_| "Spell storage is unavailable".to_string())?;
        config.notes_folder = Some(normalized.clone());
        config.clone()
    };
    save_config(app, &config)?;
    Ok(normalized)
}

fn create_unique_note(vault: &Path, target_folder: Option<String>) -> Result<Note, String> {
    let folder = match target_folder {
        Some(folder) if !folder.trim().is_empty() => folder_path(vault, &folder)?,
        _ => vault.to_path_buf(),
    };
    fs::create_dir_all(&folder).map_err(|error| error.to_string())?;

    let prefix = folder
        .strip_prefix(vault)
        .ok()
        .filter(|path| !path.as_os_str().is_empty())
        .map(|path| format!("{}/", path.to_string_lossy().replace('\\', "/")))
        .unwrap_or_default();

    let mut number = 1;
    loop {
        let name = if number == 1 {
            "Untitled".to_string()
        } else {
            format!("Untitled-{}", number)
        };
        let id = format!("{}{}", prefix, name);
        let path = note_path(vault, &id)?;
        if !path.exists() {
            write_atomic(&path, b"")?;
            return note_from_path(id, path);
        }
        number += 1;
    }
}

#[tauri::command]
fn get_notes_folder(state: State<AppState>) -> Option<String> {
    state.config.lock().ok()?.notes_folder.clone()
}

#[tauri::command]
fn set_notes_folder(app: AppHandle, _path: String, state: State<AppState>) -> Result<(), String> {
    let vault = app_data_dir(&app)?.join("offline-notes");
    ensure_vault(&app, &state, vault)?;
    let config = {
        let mut config = state
            .config
            .lock()
            .map_err(|_| "Spell storage is unavailable".to_string())?;
        config.cloud_user_id = None;
        config.clone()
    };
    save_config(&app, &config)
}

#[tauri::command]
fn get_cloud_user_id(state: State<AppState>) -> Option<String> {
    state.config.lock().ok()?.cloud_user_id.clone()
}

#[tauri::command]
fn set_cloud_notes_folder(
    app: AppHandle,
    user_id: String,
    state: State<AppState>,
) -> Result<String, String> {
    let is_valid_user_id = user_id.len() == 36
        && user_id
            .chars()
            .all(|character| character.is_ascii_hexdigit() || character == '-');
    if !is_valid_user_id {
        return Err("Invalid cloud account ID".to_string());
    }

    let vault = app_data_dir(&app)?.join("cloud-notes").join(&user_id);
    let normalized = ensure_vault(&app, &state, vault)?;
    let config = {
        let mut config = state
            .config
            .lock()
            .map_err(|_| "Spell storage is unavailable".to_string())?;
        config.cloud_user_id = Some(user_id);
        config.clone()
    };
    save_config(&app, &config)?;
    Ok(normalized)
}

#[tauri::command]
fn disconnect_cloud(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let config = {
        let mut config = state
            .config
            .lock()
            .map_err(|_| "Spell storage is unavailable".to_string())?;
        config.cloud_user_id = None;
        config.clone()
    };
    save_config(&app, &config)
}

#[tauri::command]
fn apply_cloud_note(
    id: String,
    content: String,
    modified: i64,
    state: State<AppState>,
) -> Result<(), String> {
    if modified < 0 {
        return Err("Invalid cloud note timestamp".to_string());
    }
    let vault = vault_path_from_config(&state)?;
    let path = note_path(&vault, &id)?;
    write_atomic(&path, content.as_bytes())?;
    let file = fs::OpenOptions::new()
        .write(true)
        .open(&path)
        .map_err(|error| error.to_string())?;
    let timestamp = UNIX_EPOCH + Duration::from_secs(modified as u64);
    file.set_times(fs::FileTimes::new().set_modified(timestamp))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_notes(state: State<AppState>) -> Result<Vec<NoteMetadata>, String> {
    let vault = vault_path_from_config(&state)?;
    let mut notes = Vec::new();
    collect_notes(&vault, &vault, 0, &mut notes);
    notes.sort_by_key(|note| std::cmp::Reverse(note.modified));
    Ok(notes)
}

#[tauri::command]
fn read_note(id: String, state: State<AppState>) -> Result<Note, String> {
    let vault = vault_path_from_config(&state)?;
    let path = note_path(&vault, &id)?;
    if !path.is_file() {
        return Err("Note not found".to_string());
    }
    note_from_path(id, path)
}

#[tauri::command]
fn save_note(id: Option<String>, content: String, state: State<AppState>) -> Result<Note, String> {
    let vault = vault_path_from_config(&state)?;
    let (id, path) = match id {
        Some(id) => {
            let path = note_path(&vault, &id)?;
            (id, path)
        }
        None => {
            let title = extract_title(&content);
            let mut suffix = 1;
            loop {
                let candidate = if suffix == 1 {
                    title.clone()
                } else {
                    format!("{}-{}", title, suffix)
                };
                let candidate =
                    candidate.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "-");
                let path = note_path(&vault, &candidate)?;
                if !path.exists() {
                    break (candidate, path);
                }
                suffix += 1;
            }
        }
    };
    write_atomic(&path, content.as_bytes())?;
    note_from_path(id, path)
}

#[tauri::command]
fn delete_note(id: String, state: State<AppState>) -> Result<(), String> {
    let vault = vault_path_from_config(&state)?;
    let path = note_path(&vault, &id)?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn create_note(target_folder: Option<String>, state: State<AppState>) -> Result<Note, String> {
    let vault = vault_path_from_config(&state)?;
    create_unique_note(&vault, target_folder)
}

#[tauri::command]
fn list_folders(state: State<AppState>) -> Result<Vec<String>, String> {
    let vault = vault_path_from_config(&state)?;
    let mut folders = Vec::new();
    collect_folders(&vault, &vault, 0, &mut folders);
    folders.sort();
    Ok(folders)
}

fn collect_folders(vault: &Path, directory: &Path, depth: usize, folders: &mut Vec<String>) {
    if depth >= MAX_NOTE_DEPTH {
        return;
    }
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() || file_type.is_symlink() {
            continue;
        }
        let name = entry.file_name();
        if EXCLUDED_DIRECTORIES
            .iter()
            .any(|excluded| name == *excluded)
        {
            continue;
        }
        if let Ok(relative) = path.strip_prefix(vault) {
            folders.push(relative.to_string_lossy().replace('\\', "/"));
        }
        collect_folders(vault, &path, depth + 1, folders);
    }
}

#[tauri::command]
fn create_folder(path: String, state: State<AppState>) -> Result<(), String> {
    let vault = vault_path_from_config(&state)?;
    fs::create_dir_all(folder_path(&vault, &path)?).map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_folder(path: String, state: State<AppState>) -> Result<(), String> {
    let vault = vault_path_from_config(&state)?;
    let target = folder_path(&vault, &path)?;
    if !target.is_dir() {
        return Err("Path is not a directory".to_string());
    }
    fs::remove_dir_all(target).map_err(|error| error.to_string())
}

#[tauri::command]
fn rename_folder(old_path: String, new_name: String, state: State<AppState>) -> Result<(), String> {
    let vault = vault_path_from_config(&state)?;
    let old_target = folder_path(&vault, &old_path)?;
    if !old_target.is_dir() {
        return Err("Path is not a directory".to_string());
    }
    let sanitized_name = new_name
        .replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "-")
        .trim()
        .to_string();
    if sanitized_name.is_empty() {
        return Err("Folder name cannot be empty".to_string());
    }
    let new_target = old_target
        .parent()
        .ok_or("Cannot determine parent directory")?
        .join(sanitized_name);
    if new_target.exists() {
        return Err("A folder with that name already exists".to_string());
    }
    fs::rename(old_target, new_target).map_err(|error| error.to_string())
}

#[tauri::command]
fn move_note(id: String, target_folder: String, state: State<AppState>) -> Result<String, String> {
    let vault = vault_path_from_config(&state)?;
    let source = note_path(&vault, &id)?;
    if !source.is_file() {
        return Err("Note not found".to_string());
    }
    let target = if target_folder.trim().is_empty() {
        vault.clone()
    } else {
        folder_path(&vault, &target_folder)?
    };
    fs::create_dir_all(&target).map_err(|error| error.to_string())?;
    let filename = source.file_name().ok_or("Invalid note path")?;
    let destination = target.join(filename);
    if destination.exists() && destination != source {
        return Err("A note with that name already exists in the destination".to_string());
    }
    fs::rename(source, &destination).map_err(|error| error.to_string())?;
    relative_note_id(&vault, &destination).ok_or("Failed to determine new note ID".to_string())
}

#[tauri::command]
fn move_folder(path: String, target_parent: String, state: State<AppState>) -> Result<(), String> {
    let vault = vault_path_from_config(&state)?;
    let source = folder_path(&vault, &path)?;
    if !source.is_dir() {
        return Err("Path is not a directory".to_string());
    }
    let target_parent = if target_parent.trim().is_empty() {
        vault.clone()
    } else {
        folder_path(&vault, &target_parent)?
    };
    fs::create_dir_all(&target_parent).map_err(|error| error.to_string())?;
    if target_parent.starts_with(&source) {
        return Err("Cannot move a folder inside itself".to_string());
    }
    let name = source.file_name().ok_or("Invalid folder path")?;
    let destination = target_parent.join(name);
    if destination.exists() {
        return Err("A folder with that name already exists in the destination".to_string());
    }
    fs::rename(source, destination).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> Result<Value, String> {
    Ok(load_settings(&vault_path_from_config(&state)?))
}

#[tauri::command]
fn update_settings(new_settings: Value, state: State<AppState>) -> Result<(), String> {
    let vault = vault_path_from_config(&state)?;
    let mut settings = new_settings;
    if !settings.is_object() {
        return Err("Invalid settings payload".to_string());
    }
    settings["gitEnabled"] = Value::Bool(false);
    if settings.get("theme").and_then(Value::as_object).is_none() {
        settings["theme"] = json!({ "mode": "system" });
    }
    save_settings(&vault, &settings)
}

#[tauri::command]
fn update_git_enabled(_enabled: bool, _expected_folder: String) -> Result<(), String> {
    Err("Git sync is unavailable on Android. Use Spell cloud sync instead.".to_string())
}

#[tauri::command]
fn search_notes(query: String, state: State<AppState>) -> Result<Vec<SearchResult>, String> {
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let vault = vault_path_from_config(&state)?;
    let mut results = Vec::new();
    for metadata in list_notes(state)? {
        let path = note_path(&vault, &metadata.id)?;
        let Ok(content) = fs::read_to_string(path) else {
            continue;
        };
        let title_matches = metadata.title.to_lowercase().contains(&query);
        let content_matches = content.to_lowercase().contains(&query);
        if title_matches || content_matches {
            results.push(SearchResult {
                id: metadata.id,
                title: metadata.title,
                preview: metadata.preview,
                modified: metadata.modified,
                score: if title_matches { 2.0 } else { 1.0 },
            });
        }
    }
    results.sort_by(|left, right| {
        right
            .score
            .total_cmp(&left.score)
            .then_with(|| right.modified.cmp(&left.modified))
    });
    Ok(results)
}

#[tauri::command]
fn start_file_watcher() {}

#[tauri::command]
fn git_is_available() -> bool {
    false
}

#[tauri::mobile_entry_point]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let config = load_config(app.handle());
            app.manage(AppState {
                config: Mutex::new(config),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_notes_folder,
            set_notes_folder,
            get_cloud_user_id,
            set_cloud_notes_folder,
            disconnect_cloud,
            apply_cloud_note,
            list_notes,
            read_note,
            save_note,
            delete_note,
            create_note,
            list_folders,
            create_folder,
            delete_folder,
            rename_folder,
            move_note,
            move_folder,
            get_settings,
            update_settings,
            update_git_enabled,
            search_notes,
            start_file_watcher,
            git_is_available,
            crate::updater::check_for_app_update,
            crate::updater::install_app_update,
            crate::updater::restart_app_after_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Spell on Android");
}
