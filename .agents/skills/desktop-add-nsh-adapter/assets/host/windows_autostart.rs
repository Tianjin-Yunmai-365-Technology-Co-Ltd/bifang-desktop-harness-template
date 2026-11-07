//! Current-user Windows login startup registration for this application.

use std::{env, io, os::windows::ffi::OsStrExt};

use windows::{
    Win32::{
        Foundation::{ERROR_FILE_NOT_FOUND, ERROR_PATH_NOT_FOUND, ERROR_SUCCESS},
        System::Registry::{
            HKEY_CURRENT_USER, REG_SZ, RRF_RT_REG_SZ, RegDeleteKeyValueW, RegGetValueW,
            RegSetKeyValueW,
        },
    },
    core::{PCWSTR, w},
};

const APP_ID: &str = __APP_ID__;
const MAX_RUN_COMMAND_UNITS: usize = 4_096;

fn value_name() -> Vec<u16> {
    APP_ID.encode_utf16().chain(std::iter::once(0)).collect()
}

fn autostart_command() -> io::Result<Vec<u16>> {
    let executable = env::current_exe()?;
    let mut command = Vec::with_capacity(executable.as_os_str().len() + 3);
    command.push(b'"' as u16);
    command.extend(executable.as_os_str().encode_wide());
    command.extend([b'"' as u16, 0]);
    Ok(command)
}

fn registry_error(status: windows::Win32::Foundation::WIN32_ERROR) -> io::Error {
    io::Error::from_raw_os_error(status.0 as i32)
}

pub(super) fn get_autostart() -> io::Result<bool> {
    let name = value_name();
    let mut byte_len = 0u32;
    // SAFETY: Both key names are NUL-terminated and the size pointer is writable.
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            w!("Software\\Microsoft\\Windows\\CurrentVersion\\Run"),
            PCWSTR(name.as_ptr()),
            RRF_RT_REG_SZ,
            None,
            None,
            Some(&mut byte_len),
        )
    };
    if status == ERROR_FILE_NOT_FOUND || status == ERROR_PATH_NOT_FOUND {
        return Ok(false);
    }
    if status != ERROR_SUCCESS {
        return Err(registry_error(status));
    }
    if !(2..=8_192).contains(&byte_len) || !byte_len.is_multiple_of(2) {
        return Ok(false);
    }
    let mut actual = vec![0u16; (byte_len / 2) as usize];
    // SAFETY: The buffer is writable for byte_len bytes and the call updates byte_len.
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            w!("Software\\Microsoft\\Windows\\CurrentVersion\\Run"),
            PCWSTR(name.as_ptr()),
            RRF_RT_REG_SZ,
            None,
            Some(actual.as_mut_ptr().cast()),
            Some(&mut byte_len),
        )
    };
    if status == ERROR_FILE_NOT_FOUND || status == ERROR_PATH_NOT_FOUND {
        return Ok(false);
    }
    if status != ERROR_SUCCESS {
        return Err(registry_error(status));
    }
    actual.truncate((byte_len / 2) as usize);
    Ok(actual == autostart_command()?)
}

pub(super) fn set_autostart(enabled: bool) -> io::Result<bool> {
    let name = value_name();
    if enabled {
        let command = autostart_command()?;
        if command.len() > MAX_RUN_COMMAND_UNITS {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "The executable path is too long for the Windows Run key",
            ));
        }
        // SAFETY: The command is a NUL-terminated UTF-16 REG_SZ value.
        let status = unsafe {
            RegSetKeyValueW(
                HKEY_CURRENT_USER,
                w!("Software\\Microsoft\\Windows\\CurrentVersion\\Run"),
                PCWSTR(name.as_ptr()),
                REG_SZ.0,
                Some(command.as_ptr().cast()),
                (command.len() * 2) as u32,
            )
        };
        if status != ERROR_SUCCESS {
            return Err(registry_error(status));
        }
    } else {
        // SAFETY: Both key names are NUL-terminated.
        let status = unsafe {
            RegDeleteKeyValueW(
                HKEY_CURRENT_USER,
                w!("Software\\Microsoft\\Windows\\CurrentVersion\\Run"),
                PCWSTR(name.as_ptr()),
            )
        };
        if status != ERROR_SUCCESS
            && status != ERROR_FILE_NOT_FOUND
            && status != ERROR_PATH_NOT_FOUND
        {
            return Err(registry_error(status));
        }
    }
    get_autostart()
}
