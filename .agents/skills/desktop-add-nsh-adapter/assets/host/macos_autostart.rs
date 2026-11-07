//! macOS login startup through SMAppService or a per-user LaunchAgent.

use std::{
    env,
    fs::{self, OpenOptions},
    io::{self, Write},
    os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use nsh_platform_macos::{
    objc2::{
        msg_send,
        rc::Retained,
        runtime::{AnyClass, AnyObject},
    },
    objc2_foundation::NSString,
};

pub(crate) const APP_ID: &str = __APP_ID__;
const APP_NAME: &str = __NAME_EN__;
const LOGIN_AGENT_NAME: &str = __LOGIN_AGENT_NAME__;

#[link(name = "ServiceManagement", kind = "framework")]
unsafe extern "C" {
    static SMAppServiceErrorDomain: *const NSString;
}

fn packaged_app_path() -> Result<PathBuf, String> {
    let executable = env::current_exe().map_err(|error| error.to_string())?;
    let contents = executable
        .parent()
        .filter(|directory| directory.file_name().is_some_and(|name| name == "MacOS"))
        .and_then(|directory| directory.parent())
        .filter(|directory| directory.file_name().is_some_and(|name| name == "Contents"))
        .filter(|directory| directory.join("Info.plist").is_file())
        .ok_or_else(|| "Login at startup requires the macOS .app bundle".to_owned())?;
    contents
        .parent()
        .filter(|app| app.extension().is_some_and(|extension| extension == "app"))
        .map(Path::to_path_buf)
        .ok_or_else(|| "Login at startup requires the macOS .app bundle".to_owned())
}

fn launch_agent_path() -> Result<PathBuf, String> {
    let home = PathBuf::from(
        env::var_os("HOME").ok_or_else(|| "The user home directory is unavailable".to_owned())?,
    );
    if !home.is_absolute() {
        return Err("The user home directory is not an absolute path".to_owned());
    }
    Ok(home.join("Library/LaunchAgents").join(LOGIN_AGENT_NAME))
}

fn xml_escape(raw: &str) -> String {
    raw.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn launch_agent_plist(app: &Path) -> Result<String, String> {
    let app = app
        .to_str()
        .ok_or_else(|| "The application path is not valid UTF-8".to_owned())?;
    let app = xml_escape(app);
    Ok(format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>{APP_ID}.login</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/open</string><string>-a</string><string>{app}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>LimitLoadToSessionType</key><string>Aqua</string>
</dict></plist>
"#,
    ))
}

fn launch_agent_enabled(path: &Path, app: &Path) -> Result<bool, String> {
    let expected = launch_agent_plist(app)?;
    let actual = match fs::read_to_string(path) {
        Ok(actual) => actual,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error.to_string()),
    };
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let directory = path
        .parent()
        .ok_or_else(|| "The login agent path has no parent directory".to_owned())?;
    let directory_metadata = fs::metadata(directory).map_err(|error| error.to_string())?;
    Ok(actual == expected
        && metadata.uid() == directory_metadata.uid()
        && metadata.permissions().mode() & 0o077 == 0)
}

fn write_launch_agent(path: &Path, app: &Path) -> Result<(), String> {
    let contents = launch_agent_plist(app)?;
    let directory = path
        .parent()
        .ok_or_else(|| "The login agent path has no parent directory".to_owned())?;
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = directory.join(format!(
        ".{LOGIN_AGENT_NAME}.{}-{nonce}.tmp",
        std::process::id()
    ));
    let result = (|| -> io::Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&temporary)?;
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
        fs::rename(&temporary, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.map_err(|error| error.to_string())
}

fn remove_launch_agent(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn autostart_service() -> Result<Retained<AnyObject>, String> {
    // SAFETY: Referencing the framework symbol keeps ServiceManagement linked
    // before looking up its Objective-C class.
    let _ = std::hint::black_box(unsafe { SMAppServiceErrorDomain });
    let class = AnyClass::get(c"SMAppService")
        .ok_or_else(|| "ServiceManagement is unavailable on this macOS version".to_owned())?;
    // SAFETY: SMAppService.mainAppService is available on macOS 13+; the bundle
    // declares macOS 14 as its minimum deployment version.
    Ok(unsafe { msg_send![class, mainAppService] })
}

fn autostart_status(service: &AnyObject) -> Result<isize, String> {
    // SAFETY: `service` is the SMAppService object returned by mainAppService.
    let status: isize = unsafe { msg_send![service, status] };
    match status {
        0..=3 => Ok(status),
        other => Err(format!("Unknown macOS login item status: {other}")),
    }
}

pub(crate) fn autostart_enabled() -> Result<bool, String> {
    let app = packaged_app_path()?;
    let agent = launch_agent_path()?;
    if launch_agent_enabled(&agent, &app)? {
        return Ok(true);
    }
    match autostart_service() {
        Ok(service) => Ok(autostart_status(&service)? == 1),
        Err(_) => Ok(false),
    }
}

pub(crate) fn set_autostart(enabled: bool) -> Result<bool, String> {
    let app = packaged_app_path()?;
    let agent = launch_agent_path()?;
    if enabled {
        if launch_agent_enabled(&agent, &app)? {
            return Ok(true);
        }
        if let Ok(service) = autostart_service() {
            match autostart_status(&service)? {
                1 => {
                    remove_launch_agent(&agent)?;
                    return Ok(true);
                }
                2 => {
                    return Err(format!("Approve {APP_NAME} in System Settings > General > Login Items to enable login at startup"));
                }
                0 => {
                    let mut error: *mut AnyObject = std::ptr::null_mut();
                    // SAFETY: SMAppService accepts an NSError out parameter; a
                    // registration failure falls back to the user LaunchAgent.
                    let _: bool =
                        unsafe { msg_send![&service, registerAndReturnError: &mut error] };
                    match autostart_status(&service)? {
                        1 => return Ok(true),
                        2 => {
                            return Err(format!("Approve {APP_NAME} in System Settings > General > Login Items to enable login at startup"));
                        }
                        _ => {}
                    }
                }
                _ => {}
            }
        }
        write_launch_agent(&agent, &app)?;
        launch_agent_enabled(&agent, &app)
    } else {
        remove_launch_agent(&agent)?;
        if let Ok(service) = autostart_service()
            && matches!(autostart_status(&service)?, 1 | 2)
        {
            let mut error: *mut AnyObject = std::ptr::null_mut();
            // SAFETY: SMAppService accepts an NSError out parameter; any failure
            // is reported only if the item remains registered afterward.
            let _: bool = unsafe { msg_send![&service, unregisterAndReturnError: &mut error] };
            let actual = autostart_status(&service)?;
            if matches!(actual, 1 | 2) {
                let reason = if error.is_null() {
                    "unknown macOS error".to_owned()
                } else {
                    // SAFETY: ServiceManagement supplies a valid autoreleased NSError.
                    let description: Retained<NSString> =
                        unsafe { msg_send![&*error, localizedDescription] };
                    description.to_string()
                };
                return Err(format!("Could not disable Login Items: {reason}"));
            }
        }
        autostart_enabled()
    }
}

#[cfg(test)]
mod tests {
    use super::{LOGIN_AGENT_NAME, launch_agent_enabled, remove_launch_agent, write_launch_agent};
    use std::{
        fs,
        os::unix::fs::PermissionsExt,
        path::PathBuf,
        process::Command,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn launch_agent_round_trip_and_xml_path() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after the Unix epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "nsh-login-agent-test-{}-{nonce}",
            std::process::id()
        ));
        let path = directory.join(LOGIN_AGENT_NAME);
        let app = PathBuf::from("/Applications/NSH & <Desk> \"Friend's\".app");
        let moved = PathBuf::from("/Applications/NSH Moved.app");
        assert_eq!(launch_agent_enabled(&path, &app), Ok(false));
        write_launch_agent(&path, &app).expect("write test launch agent");
        let contents = fs::read_to_string(&path).expect("read test launch agent");
        assert!(contents.contains("NSH &amp; &lt;Desk&gt; &quot;Friend&apos;s&quot;.app"));
        assert_eq!(launch_agent_enabled(&path, &app), Ok(true));
        assert_eq!(launch_agent_enabled(&path, &moved), Ok(false));
        assert_eq!(
            fs::metadata(&path)
                .expect("test launch agent metadata")
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
        let lint = Command::new("/usr/bin/plutil")
            .arg("-lint")
            .arg(&path)
            .output()
            .expect("plutil should be available on macOS");
        assert!(
            lint.status.success(),
            "{}",
            String::from_utf8_lossy(&lint.stderr)
        );
        write_launch_agent(&path, &moved).expect("update moved app path");
        assert_eq!(launch_agent_enabled(&path, &moved), Ok(true));
        remove_launch_agent(&path).expect("remove test launch agent");
        assert_eq!(launch_agent_enabled(&path, &moved), Ok(false));
        fs::remove_dir_all(directory).expect("remove test directory");
    }
}
