//! XDG autostart state and desktop entry registration for the Linux host.

use std::{
    env, fs, io,
    io::Write,
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use nsh_platform_linux::gtk4::glib;

const AUTOSTART_FILE: &str = __AUTOSTART_FILE__;
const APP_NAME: &str = __NAME_EN__;
const DESKTOP_GROUP: &str = "Desktop Entry";
static AUTOSTART_SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn xdg_config_home() -> Result<PathBuf, String> {
    if let Some(path) = env::var_os("XDG_CONFIG_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
    {
        return Ok(path);
    }
    let home = env::var_os("HOME")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "HOME is required to locate the user autostart directory".to_owned())?;
    Ok(PathBuf::from(home).join(".config"))
}

fn autostart_paths() -> Result<Vec<PathBuf>, String> {
    let mut paths = vec![xdg_config_home()?.join("autostart").join(AUTOSTART_FILE)];
    let config_dirs = env::var_os("XDG_CONFIG_DIRS")
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "/etc/xdg".into());
    paths.extend(
        env::split_paths(&config_dirs)
            .filter(|path| path.is_absolute())
            .map(|path| path.join("autostart").join(AUTOSTART_FILE)),
    );
    Ok(paths)
}

fn is_executable(path: &Path) -> bool {
    fs::metadata(path)
        .is_ok_and(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
}

fn try_exec_available(command: &str) -> bool {
    let path = Path::new(command);
    if path.is_absolute() {
        return is_executable(path);
    }
    if path.components().count() != 1 {
        return false;
    }
    env::var_os("PATH").is_some_and(|search_path| {
        env::split_paths(&search_path).any(|directory| is_executable(&directory.join(path)))
    })
}

fn desktop_entry_enabled(
    contents: &str,
    current_desktops: &[&str],
    expected_executable: Option<&Path>,
) -> bool {
    let entry = glib::KeyFile::new();
    if entry
        .load_from_data(contents, glib::KeyFileFlags::NONE)
        .is_err()
        || !entry.has_group(DESKTOP_GROUP)
    {
        return false;
    }
    if entry.has_key(DESKTOP_GROUP, "Hidden").unwrap_or(false)
        && !matches!(entry.boolean(DESKTOP_GROUP, "Hidden"), Ok(false))
    {
        return false;
    }
    if current_desktops.contains(&"GNOME")
        && entry
            .has_key(DESKTOP_GROUP, "X-GNOME-Autostart-enabled")
            .unwrap_or(false)
        && !matches!(
            entry.boolean(DESKTOP_GROUP, "X-GNOME-Autostart-enabled"),
            Ok(true)
        )
    {
        return false;
    }
    if entry.string(DESKTOP_GROUP, "Type").ok().as_deref() != Some("Application")
        || !entry
            .string(DESKTOP_GROUP, "Exec")
            .is_ok_and(|exec| !exec.is_empty())
    {
        return false;
    }
    if let Some(expected) = expected_executable {
        let Ok(expected_exec) = desktop_exec(expected) else {
            return false;
        };
        let mut commands = contents.lines().filter_map(|line| {
            let (key, value) = line.split_once('=')?;
            (key.trim() == "Exec").then_some(value.trim_end_matches('\r'))
        });
        if commands.next() != Some(expected_exec.as_str()) || commands.next().is_some() {
            return false;
        }
    }
    if entry.has_key(DESKTOP_GROUP, "OnlyShowIn").unwrap_or(false) {
        let Ok(only_show_in) = entry.string_list(DESKTOP_GROUP, "OnlyShowIn") else {
            return false;
        };
        if !only_show_in
            .iter()
            .any(|name| current_desktops.contains(&name.as_str()))
        {
            return false;
        }
    }
    if entry.has_key(DESKTOP_GROUP, "NotShowIn").unwrap_or(false) {
        let Ok(not_show_in) = entry.string_list(DESKTOP_GROUP, "NotShowIn") else {
            return false;
        };
        if not_show_in
            .iter()
            .any(|name| current_desktops.contains(&name.as_str()))
        {
            return false;
        }
    }
    match entry.string(DESKTOP_GROUP, "TryExec") {
        Ok(command) => {
            if expected_executable.is_some_and(|expected| Path::new(command.as_str()) != expected)
                || (!command.is_empty() && !try_exec_available(&command))
            {
                return false;
            }
        }
        Err(_) if expected_executable.is_some() => return false,
        Err(_) => {}
    }
    true
}

fn autostart_enabled_from_paths(
    paths: impl IntoIterator<Item = PathBuf>,
    current_desktops: &[&str],
    current_executable: &Path,
) -> Result<bool, String> {
    for (index, path) in paths.into_iter().enumerate() {
        match fs::read_to_string(&path) {
            Ok(contents) => {
                let expected_executable = if index == 0 {
                    Some(current_executable)
                } else {
                    None
                };
                return Ok(desktop_entry_enabled(
                    &contents,
                    current_desktops,
                    expected_executable,
                ));
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) if error.kind() == io::ErrorKind::InvalidData => return Ok(false),
            Err(error) => return Err(format!("Reading {}: {error}", path.display())),
        }
    }
    Ok(false)
}

pub(super) fn autostart_enabled() -> Result<bool, String> {
    let current_desktop = env::var("XDG_CURRENT_DESKTOP").unwrap_or_default();
    let current_desktops: Vec<&str> = current_desktop
        .split(':')
        .filter(|name| !name.is_empty())
        .collect();
    let current_executable = env::current_exe().map_err(|error| error.to_string())?;
    autostart_enabled_from_paths(autostart_paths()?, &current_desktops, &current_executable)
}

fn desktop_string(path: &Path) -> Result<String, String> {
    let text = path
        .to_str()
        .ok_or_else(|| format!("{} is not a UTF-8 path", path.display()))?;
    if text.contains(['\n', '\r']) {
        return Err(format!("{} contains a line break", path.display()));
    }
    let mut escaped = String::with_capacity(text.len());
    for character in text.chars() {
        match character {
            '\\' => escaped.push_str("\\\\"),
            ' ' => escaped.push_str("\\s"),
            '\t' => escaped.push_str("\\t"),
            _ => escaped.push(character),
        }
    }
    Ok(escaped)
}

fn desktop_exec(path: &Path) -> Result<String, String> {
    let text = path
        .to_str()
        .ok_or_else(|| format!("{} is not a UTF-8 path", path.display()))?;
    if text.contains(['\n', '\r', '=']) {
        return Err(format!(
            "{} cannot be used in a desktop Exec entry",
            path.display()
        ));
    }
    let mut escaped = String::with_capacity(text.len() + 2);
    escaped.push('"');
    for character in text.chars() {
        match character {
            '\\' => escaped.extend(['\\'; 4]),
            '"' | '$' | '`' => {
                escaped.extend(['\\'; 2]);
                escaped.push(character);
            }
            '\t' => escaped.push_str("\\t"),
            '%' => escaped.push_str("%%"),
            _ => escaped.push(character),
        }
    }
    escaped.push('"');
    Ok(escaped)
}

fn write_autostart_entry(path: &Path, contents: &str) -> Result<(), String> {
    let directory = path
        .parent()
        .ok_or_else(|| "Autostart entry has no parent directory".to_owned())?;
    fs::create_dir_all(directory)
        .map_err(|error| format!("Creating {}: {error}", directory.display()))?;
    for _ in 0..16 {
        let sequence = AUTOSTART_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let temporary = directory.join(format!(
            ".{AUTOSTART_FILE}.{}.{}.tmp",
            std::process::id(),
            sequence
        ));
        let file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary);
        let mut file = match file {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Creating {}: {error}", temporary.display())),
        };
        let written = file
            .write_all(contents.as_bytes())
            .and_then(|()| file.sync_all());
        drop(file);
        if let Err(error) = written {
            let _ = fs::remove_file(&temporary);
            return Err(format!("Writing {}: {error}", temporary.display()));
        }
        if let Err(error) = fs::rename(&temporary, path) {
            let _ = fs::remove_file(&temporary);
            return Err(format!("Registering {}: {error}", path.display()));
        }
        return Ok(());
    }
    Err("Cannot allocate a temporary autostart entry".to_owned())
}

pub(super) fn set_autostart(enabled: bool) -> Result<bool, String> {
    let path = xdg_config_home()?.join("autostart").join(AUTOSTART_FILE);
    let contents = if enabled {
        let executable = env::current_exe().map_err(|error| error.to_string())?;
        let working_directory = env::current_dir().map_err(|error| error.to_string())?;
        format!(
            "[Desktop Entry]\nType=Application\nName={APP_NAME}\nExec={}\nTryExec={}\nPath={}\nTerminal=false\nHidden=false\n",
            desktop_exec(&executable)?,
            desktop_string(&executable)?,
            desktop_string(&working_directory)?
        )
    } else {
        format!("[Desktop Entry]\nType=Application\nName={APP_NAME}\nExec=false\nHidden=true\n")
    };
    write_autostart_entry(&path, &contents)?;
    autostart_enabled()
}

#[cfg(test)]
mod tests {
    use super::{
        AUTOSTART_SEQUENCE, autostart_enabled_from_paths, desktop_entry_enabled, desktop_exec,
        write_autostart_entry,
    };
    use std::{fs, os::unix::fs::symlink, path::Path, sync::atomic::Ordering};

    #[test]
    fn autostart_uses_the_effective_desktop_entry_state() {
        let entry = "[Desktop Entry]\nType=Application\nExec=/bin/true\n";
        assert!(desktop_entry_enabled(entry, &["GNOME"], None));
        assert!(!desktop_entry_enabled(
            &format!("{entry}Hidden=true\n"),
            &["GNOME"],
            None
        ));
        assert!(!desktop_entry_enabled(
            &format!("{entry}X-GNOME-Autostart-enabled=false\n"),
            &["GNOME"],
            None
        ));
        assert!(!desktop_entry_enabled(
            &format!("{entry}OnlyShowIn=KDE;\n"),
            &["GNOME"],
            None
        ));
        assert!(desktop_entry_enabled(
            &format!("{entry}OnlyShowIn=GNOME;\n"),
            &["GNOME"],
            None
        ));
        assert!(!desktop_entry_enabled(
            &format!("{entry}TryExec=/missing/generated-host\n"),
            &["GNOME"],
            None
        ));
    }

    #[test]
    fn user_autostart_entry_must_target_the_current_executable() {
        let entry = "[Desktop Entry]\nType=Application\nExec=\"/bin/true\"\nTryExec=/bin/true\n";
        assert!(desktop_entry_enabled(
            entry,
            &[],
            Some(Path::new("/bin/true"))
        ));
        assert!(!desktop_entry_enabled(
            entry,
            &[],
            Some(Path::new("/bin/false"))
        ));
        assert!(!desktop_entry_enabled(
            "[Desktop Entry]\nType=Application\nExec=/bin/false\nTryExec=/bin/true\n",
            &[],
            Some(Path::new("/bin/true"))
        ));
        assert!(!desktop_entry_enabled(
            "[Desktop Entry]\nType=Application\nExec=\"/bin/true\"\nExec=/bin/false\nTryExec=/bin/true\n",
            &[],
            Some(Path::new("/bin/true"))
        ));
        assert!(!desktop_entry_enabled(
            "[Desktop Entry]\nType=Application\nExec=/bin/true\n",
            &[],
            Some(Path::new("/bin/true"))
        ));
        assert!(desktop_entry_enabled(entry, &[], None));
    }

    #[test]
    fn user_autostart_entry_overrides_system_entry() {
        let sequence = AUTOSTART_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let directory = std::env::temp_dir().join(format!(
            "nsh-autostart-precedence-{}-{sequence}",
            std::process::id()
        ));
        let user = directory.join("user/autostart/sample.desktop");
        let system = directory.join("system/autostart/sample.desktop");
        fs::create_dir_all(system.parent().expect("system autostart directory"))
            .expect("system autostart directory");
        fs::write(
            &system,
            "[Desktop Entry]\nType=Application\nExec=/bin/true\n",
        )
        .expect("system autostart entry");
        let paths = [user.clone(), system];
        let current = Path::new("/bin/false");
        assert_eq!(
            autostart_enabled_from_paths(paths.clone(), &[], current),
            Ok(true)
        );

        write_autostart_entry(&user, "[Desktop Entry]\nHidden=true\n")
            .expect("disable user autostart");
        assert_eq!(
            autostart_enabled_from_paths(paths.clone(), &[], current),
            Ok(false)
        );

        write_autostart_entry(
            &user,
            "[Desktop Entry]\nType=Application\nExec=/bin/true\nTryExec=/bin/true\n",
        )
        .expect("old package autostart entry");
        assert_eq!(
            autostart_enabled_from_paths(paths.clone(), &[], current),
            Ok(false)
        );

        write_autostart_entry(
            &user,
            "[Desktop Entry]\nType=Application\nExec=\"/bin/false\"\nTryExec=/bin/false\n",
        )
        .expect("current package autostart entry");
        assert_eq!(autostart_enabled_from_paths(paths, &[], current), Ok(true));
        fs::remove_dir_all(directory).expect("remove test directory");
    }

    #[test]
    fn autostart_exec_escapes_field_codes_and_shell_metacharacters() {
        let exec = desktop_exec(Path::new("/tmp/NSH $test%`\\host")).expect("valid path");
        assert!(exec.starts_with('"') && exec.ends_with('"'));
        assert!(exec.contains("\\\\$"));
        assert!(exec.contains("%%"));
        assert!(exec.contains("\\\\`"));
        assert!(exec.contains("\\\\\\\\"));
    }

    #[test]
    fn autostart_write_replaces_a_symlink_without_touching_its_target() {
        let sequence = AUTOSTART_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let directory = std::env::temp_dir().join(format!(
            "nsh-autostart-test-{}-{sequence}",
            std::process::id()
        ));
        fs::create_dir_all(&directory).expect("test directory");
        let outside = directory.join("outside");
        let entry = directory.join("autostart").join("sample.desktop");
        fs::create_dir_all(entry.parent().expect("autostart directory"))
            .expect("autostart directory");
        fs::write(&outside, "unchanged").expect("outside file");
        symlink(&outside, &entry).expect("symlink");

        write_autostart_entry(&entry, "[Desktop Entry]\nHidden=true\n")
            .expect("replace autostart entry");

        assert_eq!(
            fs::read_to_string(&outside).expect("outside file"),
            "unchanged"
        );
        assert_eq!(
            fs::read_to_string(&entry).expect("autostart entry"),
            "[Desktop Entry]\nHidden=true\n"
        );
        fs::remove_dir_all(directory).expect("remove test directory");
    }
}
