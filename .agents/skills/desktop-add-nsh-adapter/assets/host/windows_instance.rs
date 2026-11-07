//! Named Windows process guard and bounded activation of a running host.

use super::{APP_ID, WM_SHOW_EXISTING, owner_class, wide};
use std::{
    io,
    time::{Duration, Instant},
};
use windows::{
    Win32::{
        Foundation::{
            CloseHandle, ERROR_ALREADY_EXISTS, GetLastError, HANDLE, HWND, LPARAM, WAIT_ABANDONED,
            WAIT_FAILED, WAIT_OBJECT_0, WAIT_TIMEOUT, WPARAM,
        },
        System::Threading::{
            CreateEventW, CreateMutexW, ReleaseMutex, ResetEvent, WaitForMultipleObjects,
            WaitForSingleObject,
        },
        UI::WindowsAndMessaging::{
            AllowSetForegroundWindow, FindWindowW, GetWindowThreadProcessId, SMTO_ABORTIFHUNG,
            SendMessageTimeoutW,
        },
    },
    core::{Error as WinError, PCWSTR},
};

// NSH_FEATURE_DEEP_LINK_BEGIN
use super::DEEP_LINK_COPY_TAG;
use windows::Win32::System::DataExchange::COPYDATASTRUCT;
// NSH_FEATURE_DEEP_LINK_END

const STARTUP_WAIT: Duration = Duration::from_secs(120);
const SHUTDOWN_WAIT: Duration = Duration::from_secs(5);

pub(super) struct InstanceGuard {
    mutex: HANDLE,
    ready: Option<HANDLE>,
    owns_mutex: bool,
}

impl InstanceGuard {
    pub(super) fn new() -> Result<(Self, bool), WinError> {
        let mutex_name = wide(&format!("Local\\{APP_ID}.nsh.instance"));
        let ready_name = wide(&format!("Local\\{APP_ID}.nsh.ready"));
        // SAFETY: These named kernel objects are unique to this application identity.
        unsafe {
            let mutex = CreateMutexW(None, true, PCWSTR(mutex_name.as_ptr()))?;
            let already_running = GetLastError() == ERROR_ALREADY_EXISTS;
            let mut guard = Self {
                mutex,
                ready: None,
                owns_mutex: !already_running,
            };
            let ready = CreateEventW(None, true, false, PCWSTR(ready_name.as_ptr()))?;
            guard.ready = Some(ready);
            if guard.owns_mutex {
                ResetEvent(ready)?;
            }
            Ok((guard, already_running))
        }
    }

    pub(super) fn ready_handle(&self) -> HANDLE {
        self.ready.expect("InstanceGuard opens the ready event")
    }

    fn take_over(&mut self) -> io::Result<()> {
        self.owns_mutex = true;
        // SAFETY: The mutex was acquired by this thread before resetting the signal.
        unsafe { ResetEvent(self.ready_handle()) }
            .map_err(|error| io::Error::other(error.to_string()))
    }

    pub(super) fn wait_for_exit_or_takeover(&mut self) -> io::Result<bool> {
        // SAFETY: The mutex remains open while this guard is alive.
        let result = unsafe { WaitForSingleObject(self.mutex, SHUTDOWN_WAIT.as_millis() as u32) };
        if result == WAIT_OBJECT_0 || result == WAIT_ABANDONED {
            self.take_over()?;
            return Ok(true);
        }
        if result == WAIT_TIMEOUT {
            return Ok(false);
        }
        if result == WAIT_FAILED {
            return Err(io::Error::last_os_error());
        }
        Err(io::Error::other("Unexpected host shutdown wait result"))
    }

    pub(super) fn wait_for_running_or_takeover(&mut self) -> io::Result<Option<HWND>> {
        let started = Instant::now();
        loop {
            let remaining = STARTUP_WAIT.checked_sub(started.elapsed()).ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::TimedOut,
                    "The desktop host did not become ready",
                )
            })?;
            // SAFETY: Both handles remain open for this wait.
            let result = unsafe {
                WaitForMultipleObjects(
                    &[self.mutex, self.ready_handle()],
                    false,
                    remaining.as_millis().min(u32::MAX as u128) as u32,
                )
            };
            if result == WAIT_OBJECT_0 || result == WAIT_ABANDONED {
                self.take_over()?;
                return Ok(None);
            }
            if result.0 == WAIT_OBJECT_0.0 + 1 {
                let class = owner_class();
                let title = wide(APP_ID);
                // SAFETY: The owner window has a stable class and title for this app.
                if let Ok(hwnd) =
                    unsafe { FindWindowW(PCWSTR(class.as_ptr()), PCWSTR(title.as_ptr())) }
                {
                    return Ok(Some(hwnd));
                }
                std::thread::sleep(Duration::from_millis(50));
                continue;
            }
            if result == WAIT_TIMEOUT {
                return Err(io::Error::new(
                    io::ErrorKind::TimedOut,
                    "The desktop host did not become ready",
                ));
            }
            if result == WAIT_FAILED {
                return Err(io::Error::last_os_error());
            }
            return Err(io::Error::other("Unexpected host startup wait result"));
        }
    }
}

impl Drop for InstanceGuard {
    fn drop(&mut self) {
        // SAFETY: The main thread owns the mutex and these handles belong to this process.
        unsafe {
            if self.owns_mutex {
                let _ = ReleaseMutex(self.mutex);
            }
            if let Some(ready) = self.ready {
                let _ = CloseHandle(ready);
            }
            let _ = CloseHandle(self.mutex);
        }
    }
}

pub(super) fn forward_to_running(hwnd: HWND, _initial_url: Option<&str>) -> io::Result<()> {
    let mut process_id = 0u32;
    // SAFETY: The HWND identifies the running instance's hidden owner window.
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut process_id)) };
    if process_id != 0 {
        // SAFETY: Delegate foreground permission to the running instance.
        let _ = unsafe { AllowSetForegroundWindow(process_id) };
    }
    let mut accepted = 0usize;
    // NSH_FEATURE_DEEP_LINK_BEGIN
    if let Some(raw) = _initial_url {
        let bytes = raw.as_bytes();
        let data = COPYDATASTRUCT {
            dwData: DEEP_LINK_COPY_TAG,
            cbData: bytes.len() as u32,
            lpData: bytes.as_ptr().cast_mut().cast(),
        };
        // SAFETY: SendMessageTimeoutW is synchronous and this payload remains live.
        let sent = unsafe {
            SendMessageTimeoutW(
                hwnd,
                windows::Win32::UI::WindowsAndMessaging::WM_COPYDATA,
                WPARAM(0),
                LPARAM((&data as *const COPYDATASTRUCT) as isize),
                SMTO_ABORTIFHUNG,
                2_000,
                Some(&mut accepted as *mut usize),
            )
        };
        if sent.0 == 0 || accepted != 1 {
            return Err(io::Error::other(
                "The running host did not accept the Deep Link",
            ));
        }
        return Ok(());
    }
    // NSH_FEATURE_DEEP_LINK_END
    let sent = unsafe {
        SendMessageTimeoutW(
            hwnd,
            WM_SHOW_EXISTING,
            WPARAM(0),
            LPARAM(0),
            SMTO_ABORTIFHUNG,
            2_000,
            Some(&mut accepted as *mut usize),
        )
    };
    if sent.0 == 0 || accepted != 1 {
        return Err(io::Error::other(
            "The running host did not activate a window",
        ));
    }
    Ok(())
}
