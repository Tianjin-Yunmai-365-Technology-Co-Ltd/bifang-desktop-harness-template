//! Explorer notification icon, native menu, and taskbar recovery.

use super::windows_calls::show_all_windows;
use super::{DESKTOP, OwnerWindow, app_name, wide};
use std::cell::Cell;
use windows::{
    Win32::{
        Foundation::{HWND, LPARAM, POINT, WPARAM},
        Globalization::GetUserDefaultUILanguage,
        UI::{
            Shell::{
                NIF_ICON, NIF_MESSAGE, NIF_TIP, NIM_ADD, NIM_DELETE, NOTIFYICONDATAW,
                Shell_NotifyIconW,
            },
            WindowsAndMessaging::{
                AppendMenuW, CreatePopupMenu, DestroyMenu, GetCursorPos, IDI_APPLICATION,
                LoadIconW, MF_SEPARATOR, MF_STRING, PostMessageW, PostQuitMessage,
                RegisterWindowMessageW, SetForegroundWindow, TPM_RETURNCMD, TPM_RIGHTBUTTON,
                TrackPopupMenu, WM_CONTEXTMENU, WM_LBUTTONUP, WM_RBUTTONUP,
            },
        },
    },
    core::{Error as WinError, PCWSTR},
};

pub(super) const WM_TRAY: u32 = windows::Win32::UI::WindowsAndMessaging::WM_APP + 2;
const TRAY_ID: u32 = 1;
const MENU_NEW: usize = 1;
const MENU_SHOW: usize = 2;
const MENU_QUIT: usize = 3;
thread_local! {
    static TASKBAR_CREATED: Cell<u32> = const { Cell::new(0) };
    static TASKBAR_READD_PENDING: Cell<bool> = const { Cell::new(false) };
}

impl OwnerWindow {
    pub(super) fn enable_tray(&mut self) -> Result<(), WinError> {
        // SAFETY: The owner HWND and loaded system icon remain live while the tray icon exists.
        unsafe {
            let taskbar_created = RegisterWindowMessageW(windows::core::w!("TaskbarCreated"));
            if taskbar_created == 0 {
                return Err(WinError::from_thread());
            }
            TASKBAR_CREATED.with(|slot| slot.set(taskbar_created));
            let hicon = LoadIconW(None, IDI_APPLICATION)?;
            let mut icon = NOTIFYICONDATAW {
                cbSize: std::mem::size_of::<NOTIFYICONDATAW>() as u32,
                hWnd: self.hwnd,
                uID: TRAY_ID,
                uFlags: NIF_ICON | NIF_MESSAGE | NIF_TIP,
                uCallbackMessage: WM_TRAY,
                hIcon: hicon,
                ..Default::default()
            };
            let mut used = 0;
            for character in app_name().chars() {
                let mut units = [0u16; 2];
                let encoded = character.encode_utf16(&mut units);
                if used + encoded.len() >= icon.szTip.len() {
                    break;
                }
                icon.szTip[used..used + encoded.len()].copy_from_slice(encoded);
                used += encoded.len();
            }
            if !Shell_NotifyIconW(NIM_ADD, &icon).as_bool() {
                return Err(WinError::from_thread());
            }
            self.icon = Some(icon);
            Ok(())
        }
    }

    pub(super) fn remove_tray(&mut self) {
        if let Some(icon) = self.icon.take() {
            // SAFETY: This owner HWND and icon were created on the UI thread.
            let _ = unsafe { Shell_NotifyIconW(NIM_DELETE, &icon) };
        }
    }
}

pub(super) fn handle_taskbar_created(msg: u32) -> bool {
    if !TASKBAR_CREATED.with(|slot| slot.get() != 0 && slot.get() == msg) {
        return false;
    }
    DESKTOP.with(|desktop| match desktop.try_borrow() {
        Ok(desktop) => {
            if let Some(icon) = desktop
                .as_ref()
                .and_then(|desktop| desktop.owner.icon.as_ref())
            {
                // SAFETY: Explorer discarded the old icon; the owner HWND remains live.
                let _ = unsafe { Shell_NotifyIconW(NIM_ADD, icon) };
            }
        }
        Err(_) => TASKBAR_READD_PENDING.with(|pending| pending.set(true)),
    });
    true
}

pub(super) fn handle_tray_event(hwnd: HWND, lparam: LPARAM) {
    match lparam.0 as u32 {
        WM_LBUTTONUP => show_all_windows(),
        WM_RBUTTONUP | WM_CONTEXTMENU => show_tray_menu(hwnd),
        _ => {}
    }
}

fn tray_labels() -> (&'static str, &'static str, &'static str) {
    // SAFETY: This reads the current user's UI language without retaining a pointer.
    if unsafe { GetUserDefaultUILanguage() } & 0x03ff == 0x0004 {
        ("新建窗口", "显示所有窗口", "退出")
    } else {
        ("New Window", "Show All Windows", "Quit")
    }
}

fn show_tray_menu(hwnd: HWND) {
    let (new_label, show_label, quit_label) = tray_labels();
    let new_label = wide(new_label);
    let show_label = wide(show_label);
    let quit_label = wide(quit_label);
    // SAFETY: The popup and its owner HWND live on this UI thread.
    unsafe {
        let Ok(menu) = CreatePopupMenu() else { return };
        let _ = AppendMenuW(menu, MF_STRING, MENU_NEW, PCWSTR(new_label.as_ptr()));
        let _ = AppendMenuW(menu, MF_STRING, MENU_SHOW, PCWSTR(show_label.as_ptr()));
        let _ = AppendMenuW(menu, MF_SEPARATOR, 0, None);
        let _ = AppendMenuW(menu, MF_STRING, MENU_QUIT, PCWSTR(quit_label.as_ptr()));
        let mut point = POINT::default();
        if GetCursorPos(&mut point).is_ok() {
            let _ = SetForegroundWindow(hwnd);
            let choice = TrackPopupMenu(
                menu,
                TPM_RETURNCMD | TPM_RIGHTBUTTON,
                point.x,
                point.y,
                None,
                hwnd,
                None,
            );
            match choice.0 as usize {
                MENU_NEW => DESKTOP.with(|desktop| {
                    if let Ok(mut desktop) = desktop.try_borrow_mut() {
                        if let Some(desktop) = desktop.as_mut() {
                            let _ = desktop.open_window();
                        }
                    }
                }),
                MENU_SHOW => show_all_windows(),
                MENU_QUIT => PostQuitMessage(0),
                _ => {}
            }
        }
        let _ = DestroyMenu(menu);
        let _ = PostMessageW(
            Some(hwnd),
            windows::Win32::UI::WindowsAndMessaging::WM_NULL,
            WPARAM(0),
            LPARAM(0),
        );
    }
}

pub(super) fn readd_tray_if_pending() {
    if TASKBAR_READD_PENDING.with(|pending| pending.replace(false)) {
        DESKTOP.with(|desktop| {
            if let Some(icon) = desktop
                .borrow()
                .as_ref()
                .and_then(|desktop| desktop.owner.icon.as_ref())
            {
                // SAFETY: Explorer discarded the old icon; the owner HWND is live.
                let _ = unsafe { Shell_NotifyIconW(NIM_ADD, icon) };
            }
        });
    }
}
