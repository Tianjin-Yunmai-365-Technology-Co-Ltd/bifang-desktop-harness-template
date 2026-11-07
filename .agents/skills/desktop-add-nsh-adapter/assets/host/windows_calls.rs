//! Host-call dispatch on the Windows UI message thread.

use super::{DESKTOP, Desktop, MAX_HOST_CALLS_PER_TICK, WM_HOST_CALL};
use nsh_engine::HostCall;
use serde_json::{Value, json};
use windows::Win32::{
    Foundation::{HWND, LPARAM, WPARAM},
    UI::WindowsAndMessaging::{DestroyWindow, IsWindow, PostMessageW, PostQuitMessage},
};

// NSH_FEATURE_AUTOSTART_BEGIN
use super::windows_autostart::{get_autostart, set_autostart};
// NSH_FEATURE_AUTOSTART_END

pub(super) fn show_all_windows() {
    DESKTOP.with(|desktop| {
        let Ok(mut desktop) = desktop.try_borrow_mut() else {
            return;
        };
        let Some(desktop) = desktop.as_mut() else {
            return;
        };
        if desktop.windows.is_empty() {
            let _ = desktop.open_window();
        } else {
            desktop.show_all();
        }
    });
}

// NSH_FEATURE_SINGLE_INSTANCE_BEGIN
pub(super) fn show_or_open_window() -> bool {
    DESKTOP.with(|desktop| {
        let Ok(mut desktop) = desktop.try_borrow_mut() else {
            return false;
        };
        let Some(desktop) = desktop.as_mut() else {
            return false;
        };
        if let Some((&id, _)) = desktop.windows.iter().next_back() {
            desktop.focus_window(id)
        } else {
            desktop.open_window().is_ok()
        }
    })
}
// NSH_FEATURE_SINGLE_INSTANCE_END

pub(super) fn drain_host_calls() {
    for _ in 0..MAX_HOST_CALLS_PER_TICK {
        let next = DESKTOP.with(|desktop| {
            desktop.borrow().as_ref().and_then(|desktop| {
                desktop
                    .windows
                    .iter()
                    .find_map(|(id, entry)| entry.calls_rx.try_recv().ok().map(|call| (*id, call)))
            })
        });
        let Some((sender, call)) = next else { return };
        handle_call(sender, call);
    }
    DESKTOP.with(|desktop| {
        if let Some(desktop) = desktop.borrow().as_ref() {
            // SAFETY: Yield to the message loop before draining another burst.
            let _ = unsafe {
                PostMessageW(Some(desktop.owner.hwnd), WM_HOST_CALL, WPARAM(0), LPARAM(0))
            };
        }
    });
}

pub(super) fn cleanup_closed_windows() {
    DESKTOP.with(|desktop| {
        if let Some(desktop) = desktop.borrow_mut().as_mut() {
            desktop.cleanup_closed();
        }
    });
}

fn handle_call(sender: u64, call: HostCall) {
    let sender_open = DESKTOP.with(|desktop| {
        desktop
            .borrow()
            .as_ref()
            .and_then(|desktop| desktop.windows.get(&sender))
            .is_some_and(|entry| {
                // SAFETY: IsWindow only inspects the HWND, even after destruction.
                unsafe { IsWindow(Some(entry.view.hwnd())) }.as_bool()
            })
    });
    if !sender_open {
        call.reject(format!("Window {sender} has closed"));
        return;
    }
    match call.name() {
        "window.list" => {
            let list = DESKTOP.with(|desktop| desktop.borrow().as_ref().map(Desktop::window_list));
            call.reply(list.ok_or_else(|| "The host is closing".to_owned()));
        }
        "window.open" => {
            let result = DESKTOP.with(|desktop| {
                desktop
                    .borrow_mut()
                    .as_mut()
                    .ok_or_else(|| "The host is closing".to_owned())?
                    .open_window()
            });
            call.reply(result);
        }
        "window.focus" => {
            let id = call.data().get("id").and_then(Value::as_u64);
            let result = id.map(|id| {
                DESKTOP.with(|desktop| {
                    desktop
                        .borrow()
                        .as_ref()
                        .is_some_and(|desktop| desktop.focus_window(id))
                })
            });
            call.reply(
                result
                    .map(Value::Bool)
                    .ok_or_else(|| "A valid window id is required".to_owned()),
            );
        }
        "window.showAll" => {
            show_all_windows();
            call.resolve(Value::Null);
        }
        "window.close" => {
            let id = call.data().get("id").and_then(Value::as_u64);
            let Some(id) = id else {
                call.reject("A valid window id is required");
                return;
            };
            let hwnd = DESKTOP.with(|desktop| {
                desktop
                    .borrow()
                    .as_ref()
                    .and_then(|desktop| desktop.windows.get(&id))
                    .map(|entry| entry.view.hwnd())
            });
            call.resolve(Value::Null);
            if let Some(hwnd) = hwnd {
                // SAFETY: This NSH top-level window belongs to the UI thread.
                let _ = unsafe { DestroyWindow(hwnd) };
                cleanup_closed_windows();
            }
        }
        // NSH_FEATURE_DEEP_LINK_BEGIN
        "deepLink.takePending" => {
            let links = DESKTOP.with(|desktop| {
                desktop
                    .borrow_mut()
                    .as_mut()
                    .map(|desktop| desktop.pending_links.remove(&sender).unwrap_or_default())
            });
            call.reply(
                links
                    .map(|links| json!(links))
                    .ok_or_else(|| "The host is closing".to_owned()),
            );
        }
        // NSH_FEATURE_DEEP_LINK_END
        // NSH_FEATURE_AUTOSTART_BEGIN
        "autostart.get" => {
            call.reply(
                get_autostart()
                    .map(Value::Bool)
                    .map_err(|error| error.to_string()),
            );
        }
        "autostart.set" => {
            let result = call
                .data()
                .get("enabled")
                .and_then(Value::as_bool)
                .ok_or_else(|| "An enabled boolean is required".to_owned())
                .and_then(|enabled| {
                    set_autostart(enabled)
                        .map(Value::Bool)
                        .map_err(|error| error.to_string())
                });
            call.reply(result);
        }
        // NSH_FEATURE_AUTOSTART_END
        "app.quit" => {
            call.resolve(Value::Null);
            // SAFETY: The handler runs in the UI thread message loop.
            unsafe { PostQuitMessage(0) };
        }
        _ => call.reject("Unknown host command"),
    }
}
