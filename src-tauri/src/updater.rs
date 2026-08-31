use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const GITHUB_REPO: &str = "666base/spell";
const USER_AGENT: &str = "Spell-Updater";
const PROGRESS_EVENT: &str = "app-update-progress";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub available: bool,
    pub notes: String,
    pub asset_name: Option<String>,
    pub asset_size: Option<u64>,
    pub html_url: String,
    pub platform: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallOutcome {
    pub status: String,
    pub path: Option<String>,
    pub restart_required: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProgress {
    percent: u8,
    downloaded: u64,
    total: u64,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    draft: Option<bool>,
    prerelease: Option<bool>,
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    size: u64,
    browser_download_url: String,
}

fn http_agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(20))
        .timeout_read(Duration::from_secs(120))
        .build()
}

fn github_get(url: &str) -> Result<ureq::Response, String> {
    http_agent()
        .get(url)
        .set("User-Agent", USER_AGENT)
        .set("Accept", "application/vnd.github+json")
        .set("X-GitHub-Api-Version", "2022-11-28")
        .call()
        .map_err(map_http_error)
}

fn map_http_error(error: ureq::Error) -> String {
    match error {
        ureq::Error::Status(404, _) => {
            "No published Spell release was found. Publish the latest GitHub release first."
                .to_string()
        }
        ureq::Error::Status(code, _) => {
            format!("GitHub returned {code} while checking for updates.")
        }
        ureq::Error::Transport(_) => {
            "Couldn't reach GitHub. Check your internet connection and try again.".to_string()
        }
    }
}

fn current_version(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

fn platform_label() -> &'static str {
    if cfg!(target_os = "android") {
        "android-apk"
    } else {
        "linux-deb"
    }
}

fn expected_extension() -> &'static str {
    if cfg!(target_os = "android") {
        "apk"
    } else {
        "deb"
    }
}

fn parse_version(value: &str) -> Vec<u64> {
    value
        .trim()
        .trim_start_matches('v')
        .split('.')
        .map(|part| {
            part.chars()
                .take_while(|character| character.is_ascii_digit())
                .collect::<String>()
                .parse()
                .unwrap_or(0)
        })
        .collect()
}

fn version_is_newer(latest: &str, current: &str) -> bool {
    let latest = parse_version(latest);
    let current = parse_version(current);
    latest > current
}

fn pick_asset(assets: &[GithubAsset]) -> Option<&GithubAsset> {
    let extension = format!(".{}", expected_extension());
    let matches: Vec<&GithubAsset> = assets
        .iter()
        .filter(|asset| asset.name.to_lowercase().ends_with(&extension))
        .collect();

    if cfg!(target_os = "android") {
        matches
            .iter()
            .find(|asset| asset.name.to_lowercase().contains("universal"))
            .copied()
            .or_else(|| matches.first().copied())
    } else {
        matches
            .iter()
            .find(|asset| {
                let name = asset.name.to_lowercase();
                name.contains("amd64") || name.contains("x86_64")
            })
            .copied()
            .or_else(|| matches.first().copied())
    }
}

fn fetch_latest_release() -> Result<GithubRelease, String> {
    let latest_url = format!("https://api.github.com/repos/{GITHUB_REPO}/releases/latest");
    match github_get(&latest_url) {
        Ok(response) => response
            .into_json()
            .map_err(|_| "Could not read the latest Spell release.".to_string()),
        Err(_) => {
            let list_url =
                format!("https://api.github.com/repos/{GITHUB_REPO}/releases?per_page=10");
            let releases: Vec<GithubRelease> = github_get(&list_url)?
                .into_json()
                .map_err(|_| "Could not read Spell releases.".to_string())?;
            releases
                .into_iter()
                .find(|release| release.draft != Some(true) && release.prerelease != Some(true))
                .ok_or_else(|| {
                    "No published Spell release was found. Publish the latest GitHub release first."
                        .to_string()
                })
        }
    }
}

fn missing_asset_message() -> String {
    if cfg!(target_os = "android") {
        "The latest release doesn't include an Android APK yet. Attach a universal APK to the GitHub release, then try again.".to_string()
    } else {
        "The latest release doesn't include a Linux .deb yet.".to_string()
    }
}

fn updates_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("updates");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory)
}

fn sanitize_filename(name: &str) -> Result<String, String> {
    if name.is_empty()
        || name.contains("..")
        || name.contains('/')
        || name.contains('\\')
        || !name.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-' | ' ')
        })
    {
        return Err("The update file name is invalid.".to_string());
    }
    Ok(name.to_string())
}

fn emit_progress(app: &AppHandle, downloaded: u64, total: u64) {
    let percent = downloaded
        .saturating_mul(100)
        .checked_div(total)
        .unwrap_or(0)
        .min(100) as u8;
    let _ = app.emit(
        PROGRESS_EVENT,
        UpdateProgress {
            percent,
            downloaded,
            total,
        },
    );
}

fn download_asset(app: &AppHandle, asset: &GithubAsset) -> Result<PathBuf, String> {
    let filename = sanitize_filename(&asset.name)?;
    let directory = updates_dir(app)?;
    if let Ok(entries) = fs::read_dir(&directory) {
        for entry in entries.flatten() {
            let _ = fs::remove_file(entry.path());
        }
    }

    let destination = directory.join(&filename);
    let response = http_agent()
        .get(&asset.browser_download_url)
        .set("User-Agent", USER_AGENT)
        .set("Accept", "application/octet-stream")
        .call()
        .map_err(map_http_error)?;

    let total = response
        .header("Content-Length")
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(asset.size);

    let mut reader = response.into_reader();
    let mut file = File::create(&destination).map_err(|error| error.to_string())?;
    let mut buffer = [0u8; 64 * 1024];
    let mut downloaded = 0u64;
    emit_progress(app, 0, total);

    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read])
            .map_err(|error| error.to_string())?;
        downloaded = downloaded.saturating_add(read as u64);
        emit_progress(app, downloaded, total);
    }

    file.flush().map_err(|error| error.to_string())?;
    emit_progress(app, downloaded.max(total), total.max(downloaded));

    if downloaded == 0 {
        let _ = fs::remove_file(&destination);
        return Err(
            "Download failed — received an empty file. Check your connection or download from GitHub."
                .to_string(),
        );
    }
    if asset.size > 0 && downloaded + 1024 < asset.size {
        let _ = fs::remove_file(&destination);
        return Err(format!(
            "Download incomplete ({downloaded} of {} bytes). Try again.",
            asset.size
        ));
    }

    Ok(destination)
}

fn install_linux_deb(path: &Path) -> Result<InstallOutcome, String> {
    let path_str = path
        .to_str()
        .ok_or_else(|| "Invalid package path".to_string())?
        .to_string();

    let pkexec = Command::new("pkexec")
        .args(["apt", "install", "--yes", "--allow-downgrades", &path_str])
        .status();

    if let Ok(status) = pkexec {
        if status.success() {
            return Ok(InstallOutcome {
                status: "installed".to_string(),
                path: Some(path_str),
                restart_required: true,
            });
        }
    }

    let opened = Command::new("xdg-open").arg(path).status();
    match opened {
        Ok(status) if status.success() => Ok(InstallOutcome {
            status: "opened_installer".to_string(),
            path: Some(path_str),
            restart_required: false,
        }),
        Ok(_) | Err(_) => Err(
            "The update was downloaded, but Spell couldn't install it. Open the .deb from your package installer to finish."
                .to_string(),
        ),
    }
}

fn check_for_update_sync(app: &AppHandle) -> Result<UpdateInfo, String> {
    let current = current_version(app);
    let release = fetch_latest_release()?;
    let latest = release.tag_name.trim_start_matches('v').to_string();
    let asset = pick_asset(&release.assets);
    let available = version_is_newer(&latest, &current) && asset.is_some();

    Ok(UpdateInfo {
        current_version: current,
        latest_version: latest,
        available,
        notes: release.body.unwrap_or_default(),
        asset_name: asset.map(|item| item.name.clone()),
        asset_size: asset.map(|item| item.size),
        html_url: release.html_url,
        platform: platform_label().to_string(),
    })
}

fn install_update_sync(app: &AppHandle) -> Result<InstallOutcome, String> {
    let current = current_version(app);
    let release = fetch_latest_release()?;
    let latest = release.tag_name.trim_start_matches('v').to_string();
    if !version_is_newer(&latest, &current) {
        return Err("You're already on the latest version.".to_string());
    }
    let asset = pick_asset(&release.assets).ok_or_else(missing_asset_message)?;
    let path = download_asset(app, asset)?;

    if cfg!(target_os = "android") {
        return Ok(InstallOutcome {
            status: "ready".to_string(),
            path: Some(path.to_string_lossy().into_owned()),
            restart_required: false,
        });
    }

    install_linux_deb(&path)
}

#[tauri::command]
pub async fn check_for_app_update(app: AppHandle) -> Result<UpdateInfo, String> {
    tauri::async_runtime::spawn_blocking(move || check_for_update_sync(&app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn install_app_update(app: AppHandle) -> Result<InstallOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || install_update_sync(&app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn restart_app_after_update(app: AppHandle) -> Result<(), String> {
    if cfg!(target_os = "android") {
        return Ok(());
    }

    let restart_path = std::env::current_exe()
        .ok()
        .and_then(|path| path.to_str().map(ToString::to_string))
        .unwrap_or_else(|| "spell".to_string());

    let _ = Command::new("sh")
        .arg("-c")
        .arg(format!("sleep 1; exec '{restart_path}'"))
        .spawn();
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{parse_version, version_is_newer};

    #[test]
    fn compares_semver_tags() {
        assert!(version_is_newer("1.0.1", "1.0.0"));
        assert!(version_is_newer("v1.2.0", "1.1.9"));
        assert!(!version_is_newer("1.0.0", "1.0.0"));
        assert!(!version_is_newer("1.0.0", "1.0.1"));
        assert_eq!(parse_version("v1.2.3"), vec![1, 2, 3]);
    }
}
