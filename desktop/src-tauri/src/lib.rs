//! Rust side of Writer: a small set of commands over a local clone of the
//! user's site repository. Files are read/written relative to the project
//! root (with traversal guarded), and "publish" is git add-all + commit +
//! push to origin.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::State;

#[derive(Default)]
struct AppState {
    project: Mutex<Option<PathBuf>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DirEntry {
    name: String,
    is_dir: bool,
}

#[derive(Serialize)]
struct GitStatus {
    branch: String,
    dirty: usize,
    ahead: usize,
}

fn project_root(state: &State<AppState>) -> Result<PathBuf, String> {
    state
        .project
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "No project open".to_string())
}

/// Resolve `rel` inside `root`, refusing absolute paths and `..` traversal.
fn resolve(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    if rel_path.is_absolute()
        || rel_path
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err(format!("Refusing path outside the project: {rel}"));
    }
    Ok(root.join(rel_path))
}

#[tauri::command]
fn set_project(path: String, state: State<AppState>) -> Result<String, String> {
    // Accept any folder inside the repository; anchor at its work-dir root.
    let repo = git2::Repository::discover(&path)
        .map_err(|e| format!("Not a git repository: {e}"))?;
    let root = repo
        .workdir()
        .ok_or("Repository has no working directory (bare repo?)")?
        .to_path_buf();
    *state.project.lock().unwrap() = Some(root.clone());
    Ok(root.to_string_lossy().into_owned())
}

#[tauri::command]
fn read_project_file(rel_path: String, state: State<AppState>) -> Result<String, String> {
    let path = resolve(&project_root(&state)?, &rel_path)?;
    fs::read_to_string(&path).map_err(|e| format!("Could not read {rel_path}: {e}"))
}

#[tauri::command]
fn write_project_file(
    rel_path: String,
    contents: String,
    state: State<AppState>,
) -> Result<(), String> {
    let path = resolve(&project_root(&state)?, &rel_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, contents).map_err(|e| format!("Could not write {rel_path}: {e}"))
}

#[tauri::command]
fn delete_project_file(rel_path: String, state: State<AppState>) -> Result<(), String> {
    let path = resolve(&project_root(&state)?, &rel_path)?;
    fs::remove_file(&path).map_err(|e| format!("Could not delete {rel_path}: {e}"))
}

#[tauri::command]
fn list_project_dir(rel_path: String, state: State<AppState>) -> Result<Vec<DirEntry>, String> {
    let path = resolve(&project_root(&state)?, &rel_path)?;
    let mut out = Vec::new();
    let entries = match fs::read_dir(&path) {
        Ok(entries) => entries,
        Err(_) => return Ok(out), // missing directory = empty collection
    };
    for entry in entries.flatten() {
        out.push(DirEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            is_dir: entry.file_type().map(|t| t.is_dir()).unwrap_or(false),
        });
    }
    Ok(out)
}

#[tauri::command]
fn project_file_exists(rel_path: String, state: State<AppState>) -> Result<bool, String> {
    Ok(resolve(&project_root(&state)?, &rel_path)?.exists())
}

fn open_repo(state: &State<AppState>) -> Result<git2::Repository, String> {
    git2::Repository::open(project_root(state)?).map_err(|e| e.to_string())
}

#[tauri::command]
fn git_status(state: State<AppState>) -> Result<GitStatus, String> {
    let repo = open_repo(&state)?;
    let head = repo.head().map_err(|e| e.to_string())?;
    let branch = head.shorthand().unwrap_or("HEAD").to_string();

    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true);
    let dirty = repo
        .statuses(Some(&mut opts))
        .map_err(|e| e.to_string())?
        .iter()
        .filter(|s| !s.status().is_ignored())
        .count();

    // Commits not yet on the upstream branch (0 when there is no upstream).
    let ahead = (|| -> Option<usize> {
        let local = head.target()?;
        let upstream = repo
            .find_branch(&branch, git2::BranchType::Local)
            .ok()?
            .upstream()
            .ok()?
            .get()
            .target()?;
        repo.graph_ahead_behind(local, upstream).ok().map(|(a, _)| a)
    })()
    .unwrap_or(0);

    Ok(GitStatus { branch, dirty, ahead })
}

/// Credentials for push: try the configured credential helper (works with
/// gh/git-credential-manager/osxkeychain), then the SSH agent. No secrets
/// are ever stored by this app.
fn credentials(
    url: &str,
    username_from_url: Option<&str>,
    allowed: git2::CredentialType,
    config: &git2::Config,
) -> Result<git2::Cred, git2::Error> {
    if allowed.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
        if let Ok(cred) = git2::Cred::credential_helper(config, url, username_from_url) {
            return Ok(cred);
        }
    }
    if allowed.contains(git2::CredentialType::SSH_KEY) {
        if let Some(user) = username_from_url {
            return git2::Cred::ssh_key_from_agent(user);
        }
    }
    Err(git2::Error::from_str(
        "No usable credentials — set up a git credential helper (e.g. `gh auth login`) or an SSH agent",
    ))
}

#[tauri::command]
fn git_publish(message: String, state: State<AppState>) -> Result<String, String> {
    let repo = open_repo(&state)?;

    // Stage everything (adds, edits, deletions).
    let mut index = repo.index().map_err(|e| e.to_string())?;
    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(|e| e.to_string())?;
    index
        .update_all(["*"].iter(), None)
        .map_err(|e| e.to_string())?;
    index.write().map_err(|e| e.to_string())?;

    let head = repo.head().map_err(|e| e.to_string())?;
    let branch = head.shorthand().unwrap_or("HEAD").to_string();
    let parent = head.peel_to_commit().map_err(|e| e.to_string())?;

    let tree_id = index.write_tree().map_err(|e| e.to_string())?;
    let mut committed = 0;
    if tree_id != parent.tree_id() {
        let tree = repo.find_tree(tree_id).map_err(|e| e.to_string())?;
        let sig = repo.signature().map_err(|e| {
            format!("Set your git identity first (git config user.name/user.email): {e}")
        })?;
        repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &[&parent])
            .map_err(|e| e.to_string())?;
        committed = 1;
    }

    // Push HEAD to origin.
    let config = repo.config().map_err(|e| e.to_string())?;
    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.credentials(move |url, user, allowed| credentials(url, user, allowed, &config));
    let mut push_opts = git2::PushOptions::new();
    push_opts.remote_callbacks(callbacks);

    let mut remote = repo.find_remote("origin").map_err(|e| e.to_string())?;
    let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
    remote
        .push(&[refspec.as_str()], Some(&mut push_opts))
        .map_err(|e| format!("Push failed: {e}"))?;

    Ok(if committed > 0 {
        format!("Committed and pushed to {branch} — the site will rebuild shortly.")
    } else {
        format!("Nothing new to commit; pushed {branch}.")
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            set_project,
            read_project_file,
            write_project_file,
            delete_project_file,
            list_project_dir,
            project_file_exists,
            git_status,
            git_publish
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
