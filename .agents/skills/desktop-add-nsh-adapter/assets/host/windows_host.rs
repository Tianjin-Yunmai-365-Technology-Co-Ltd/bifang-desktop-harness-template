//! Native Windows host for a Mixed NSH desktop application.

use std::{
    cell::RefCell,
    collections::BTreeMap,
    env, io,
    path::PathBuf,
    rc::Rc,
    sync::mpsc::{self, Receiver},
};

use nsh_engine::{HostCall, HostChannel};
use nsh_platform_windows::{App, AppOptions, AppView, AssetBase, Bundle, set_ui_sets};
use serde_json::{Value, json};
use windows::{
    Win32::{
        Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM},
        Globalization::GetUserDefaultUILanguage,
        System::{
            LibraryLoader::GetModuleHandleW,
            Ole::{OleInitialize, OleUninitialize},
        },
        UI::{
            HiDpi::{DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, SetProcessDpiAwarenessContext},
            WindowsAndMessaging::{
                CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW,
                GetWindowRect, IsIconic, IsWindow, MSG, PostMessageW, RegisterClassW, SW_RESTORE,
                SWP_NOACTIVATE, SWP_NOSIZE, SWP_NOZORDER, SetForegroundWindow, SetWindowPos,
                ShowWindow, TranslateMessage, WINDOW_EX_STYLE, WINDOW_STYLE, WM_APP, WNDCLASSW,
            },
        },
    },
    core::{Error as WinError, PCWSTR},
};

// NSH_FEATURE_TRAY_BEGIN
#[path = "windows_tray.rs"]
mod windows_tray;
use windows::Win32::UI::Shell::NOTIFYICONDATAW;
use windows_tray::WM_TRAY;
// NSH_FEATURE_TRAY_END

// NSH_FEATURE_SINGLE_INSTANCE_BEGIN
#[path = "windows_instance.rs"]
mod windows_instance;
use windows::Win32::{Foundation::HANDLE, System::Threading::SetEvent};
use windows_instance::{InstanceGuard, forward_to_running};
// NSH_FEATURE_SINGLE_INSTANCE_END

// NSH_FEATURE_DEEP_LINK_BEGIN
use std::cell::RefCell as LinkRefCell;
use windows::Win32::System::DataExchange::COPYDATASTRUCT;
// NSH_FEATURE_DEEP_LINK_END

// NSH_FEATURE_AUTOSTART_BEGIN
#[path = "windows_autostart.rs"]
mod windows_autostart;
// NSH_FEATURE_AUTOSTART_END

#[path = "windows_calls.rs"]
mod windows_calls;
use windows_calls::{cleanup_closed_windows, drain_host_calls};
// NSH_FEATURE_SINGLE_INSTANCE_BEGIN
use windows_calls::show_or_open_window;
// NSH_FEATURE_SINGLE_INSTANCE_END

const APP_ID: &str = __APP_ID__;
const NAME_ZH: &str = __NAME_ZH__;
const NAME_EN: &str = __NAME_EN__;
const WINDOW_SIZE: (i32, i32) = (900, 680);
const MAX_HOST_CALLS_PER_TICK: usize = 256;
const WM_HOST_CALL: u32 = WM_APP + 1;

// NSH_FEATURE_SINGLE_INSTANCE_BEGIN
const WM_SHOW_EXISTING: u32 = WM_APP + 3;
const WM_HOST_READY: u32 = WM_APP + 4;
// NSH_FEATURE_SINGLE_INSTANCE_END

// NSH_FEATURE_DEEP_LINK_BEGIN
const WM_DEEP_LINK: u32 = WM_APP + 5;
const DEEP_LINK_COPY_TAG: usize = 0x4e53_4844;
const MAX_DEEP_LINK_BYTES: u32 = 8_192;
thread_local! {
    static INCOMING_LINKS: LinkRefCell<Vec<String>> = const { LinkRefCell::new(Vec::new()) };
}
// NSH_FEATURE_DEEP_LINK_END

thread_local! {
    static DESKTOP: RefCell<Option<Desktop>> = const { RefCell::new(None) };
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

fn owner_class() -> Vec<u16> {
    wide(&format!("{APP_ID}.nsh.host"))
}

fn app_name() -> &'static str {
    // SAFETY: This reads the current user's UI language without retaining a pointer.
    let language = unsafe { GetUserDefaultUILanguage() };
    if language & 0x03ff == 0x0004 {
        NAME_ZH
    } else {
        NAME_EN
    }
}

struct WindowEntry {
    view: Rc<AppView>,
    host: HostChannel,
    title: String,
    calls_rx: Receiver<HostCall>,
}

struct OwnerWindow {
    hwnd: HWND,
    // NSH_FEATURE_TRAY_BEGIN
    icon: Option<NOTIFYICONDATAW>,
    // NSH_FEATURE_TRAY_END
}

impl OwnerWindow {
    fn new() -> Result<Self, WinError> {
        let class_name = owner_class();
        let window_name = wide(APP_ID);
        // SAFETY: The class, window name, and window procedure live until the UI thread exits.
        unsafe {
            let module = GetModuleHandleW(None)?;
            let instance = HINSTANCE(module.0);
            let class = WNDCLASSW {
                lpfnWndProc: Some(owner_proc),
                hInstance: instance,
                lpszClassName: PCWSTR(class_name.as_ptr()),
                ..Default::default()
            };
            if RegisterClassW(&class) == 0 {
                return Err(WinError::from_thread());
            }
            let hwnd = CreateWindowExW(
                WINDOW_EX_STYLE(0),
                PCWSTR(class_name.as_ptr()),
                PCWSTR(window_name.as_ptr()),
                WINDOW_STYLE(0),
                0,
                0,
                0,
                0,
                None,
                None,
                Some(instance),
                None,
            )?;
            Ok(Self {
                hwnd,
                // NSH_FEATURE_TRAY_BEGIN
                icon: None,
                // NSH_FEATURE_TRAY_END
            })
        }
    }
}

impl Drop for OwnerWindow {
    fn drop(&mut self) {
        // SAFETY: The icon and owner HWND were created on this UI thread.
        unsafe {
            // NSH_FEATURE_TRAY_BEGIN
            self.remove_tray();
            // NSH_FEATURE_TRAY_END
            let _ = DestroyWindow(self.hwnd);
        }
    }
}

struct OleApartment;

impl OleApartment {
    fn new() -> Result<Self, WinError> {
        // SAFETY: The UI thread owns the apartment and drops it on the same thread.
        unsafe { OleInitialize(None)? };
        Ok(Self)
    }
}

impl Drop for OleApartment {
    fn drop(&mut self) {
        // SAFETY: Matches OleInitialize on this UI thread.
        unsafe { OleUninitialize() };
    }
}

struct Desktop {
    bundle: Bundle,
    asset_dir: PathBuf,
    windows: BTreeMap<u64, WindowEntry>,
    next_id: u64,
    owner: OwnerWindow,
    // NSH_FEATURE_TRAY_BEGIN
    // NSH posts WM_QUIT when the final NSH top-level surface is destroyed.
    // A hidden NSH surface keeps the tray process alive with zero visible windows.
    anchor: Rc<AppView>,
    // NSH_FEATURE_TRAY_END
    // NSH_FEATURE_DEEP_LINK_BEGIN
    pending_links: BTreeMap<u64, Vec<String>>,
    unassigned_links: Vec<String>,
    // NSH_FEATURE_DEEP_LINK_END
}

impl Desktop {
    fn open_window(&mut self) -> Result<Value, String> {
        let id = self.next_id;
        let title = if id == 1 {
            app_name().to_owned()
        } else {
            format!("{} · {id}", app_name())
        };
        let host = HostChannel::new();
        let (calls_tx, calls_rx) = mpsc::channel();
        let mut params = serde_json::Map::new();
        params.insert("windowId".to_owned(), json!(id));
        host.set_params(params);
        let methods = [
            "window.list",
            "window.open",
            "window.focus",
            "window.showAll",
            "window.close",
            "app.quit",
            // NSH_FEATURE_DEEP_LINK_BEGIN
            "deepLink.takePending",
            // NSH_FEATURE_DEEP_LINK_END
            // NSH_FEATURE_AUTOSTART_BEGIN
            "autostart.get",
            "autostart.set",
            // NSH_FEATURE_AUTOSTART_END
        ];
        for method in methods {
            let tx = calls_tx.clone();
            let owner_hwnd = self.owner.hwnd.0 as isize;
            host.handle(method, move |call| {
                if let Err(error) = tx.send(call) {
                    error.0.reject("The desktop host is closing");
                    return;
                }
                // SAFETY: The owner HWND belongs to this UI thread. The queued call
                // is rejected when its receiver drops if posting fails during exit.
                let _ = unsafe {
                    PostMessageW(
                        Some(HWND(owner_hwnd as *mut _)),
                        WM_HOST_CALL,
                        WPARAM(0),
                        LPARAM(0),
                    )
                };
            });
        }

        let view = AppView::new(
            None,
            AppOptions {
                app_id: APP_ID.to_owned(),
                title: title.clone(),
                size: WINDOW_SIZE,
                asset_base: Some(AssetBase::Directory(self.asset_dir.clone())),
                host: host.clone(),
                ..AppOptions::default()
            },
        )
        .map_err(|error| error.to_string())?;
        view.load(App::Js(self.bundle.clone()));
        if let Some(previous) = self.windows.values().next_back() {
            let mut frame = windows::Win32::Foundation::RECT::default();
            // SAFETY: The windows are on this UI thread and the new one is hidden.
            if unsafe { GetWindowRect(previous.view.hwnd(), &mut frame) }.is_ok() {
                let _ = unsafe {
                    SetWindowPos(
                        view.hwnd(),
                        None,
                        frame.left + 32,
                        frame.top + 32,
                        0,
                        0,
                        SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOSIZE,
                    )
                };
            }
        }
        self.next_id += 1;
        self.windows.insert(
            id,
            WindowEntry {
                view: view.clone(),
                host,
                title: title.clone(),
                calls_rx,
            },
        );
        // NSH_FEATURE_DEEP_LINK_BEGIN
        let pending = std::mem::take(&mut self.unassigned_links);
        if !pending.is_empty() {
            self.pending_links.entry(id).or_default().extend(pending);
        }
        // NSH_FEATURE_DEEP_LINK_END
        self.broadcast_windows();
        view.show();
        // SAFETY: The new top-level window is owned by this UI thread.
        let _ = unsafe { SetForegroundWindow(view.hwnd()) };
        Ok(json!({ "id": id, "title": title }))
    }

    fn window_list(&self) -> Value {
        Value::Array(
            self.windows
                .iter()
                .map(|(id, entry)| json!({ "id": id, "title": entry.title }))
                .collect(),
        )
    }

    fn broadcast_windows(&self) {
        let windows = self.window_list();
        for entry in self.windows.values() {
            let _ = entry.host.send("windows", windows.clone());
        }
    }

    fn focus_window(&self, id: u64) -> bool {
        let Some(entry) = self.windows.get(&id) else {
            return false;
        };
        let hwnd = entry.view.hwnd();
        // SAFETY: The HWND belongs to this UI thread and may have just closed.
        unsafe {
            if !IsWindow(Some(hwnd)).as_bool() {
                return false;
            }
            if IsIconic(hwnd).as_bool() {
                let _ = ShowWindow(hwnd, SW_RESTORE);
            }
            let _ = SetForegroundWindow(hwnd);
        }
        true
    }

    fn show_all(&self) {
        for id in self.windows.keys() {
            self.focus_window(*id);
        }
    }

    fn cleanup_closed(&mut self) {
        let closed: Vec<u64> = self
            .windows
            .iter()
            .filter_map(|(id, entry)| {
                // SAFETY: IsWindow safely inspects an HWND after destruction.
                (!unsafe { IsWindow(Some(entry.view.hwnd())) }.as_bool()).then_some(*id)
            })
            .collect();
        if closed.is_empty() {
            return;
        }
        for id in closed {
            if let Some(entry) = self.windows.remove(&id) {
                drop(entry.calls_rx);
                entry.view.stop();
            }
            // NSH_FEATURE_DEEP_LINK_BEGIN
            if let Some(pending) = self.pending_links.remove(&id) {
                self.unassigned_links.extend(pending);
            }
            // NSH_FEATURE_DEEP_LINK_END
        }
        // NSH_FEATURE_DEEP_LINK_BEGIN
        if let Some((&id, _)) = self.windows.iter().next_back() {
            if !self.unassigned_links.is_empty() {
                self.pending_links
                    .entry(id)
                    .or_default()
                    .extend(std::mem::take(&mut self.unassigned_links));
            }
        }
        // NSH_FEATURE_DEEP_LINK_END
        self.broadcast_windows();
    }

    // NSH_FEATURE_DEEP_LINK_BEGIN
    fn enqueue_deep_link(&mut self, raw: String) {
        if let Some((&id, entry)) = self.windows.iter().next_back() {
            let _ = entry.host.send("deepLink", json!(raw));
            self.focus_window(id);
        } else {
            self.unassigned_links.push(raw);
            if let Err(error) = self.open_window() {
                eprintln!("Unable to open a window for the Deep Link: {error}");
            }
        }
    }
    // NSH_FEATURE_DEEP_LINK_END
}

unsafe extern "system" fn owner_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    // NSH_FEATURE_TRAY_BEGIN
    if windows_tray::handle_taskbar_created(msg) {
        return LRESULT(0);
    }
    // NSH_FEATURE_TRAY_END
    match msg {
        // NSH_FEATURE_DEEP_LINK_BEGIN
        windows::Win32::UI::WindowsAndMessaging::WM_COPYDATA => {
            // SAFETY: WM_COPYDATA holds its payload live until this callback returns.
            let Some(data) = (unsafe { (lparam.0 as *const COPYDATASTRUCT).as_ref() }) else {
                return LRESULT(0);
            };
            if data.dwData != DEEP_LINK_COPY_TAG
                || data.cbData == 0
                || data.cbData > MAX_DEEP_LINK_BYTES
                || data.lpData.is_null()
            {
                return LRESULT(0);
            }
            // SAFETY: Windows supplies cbData readable bytes for WM_COPYDATA.
            let bytes = unsafe {
                std::slice::from_raw_parts(data.lpData.cast::<u8>(), data.cbData as usize)
            };
            let Ok(raw) = std::str::from_utf8(bytes) else {
                return LRESULT(0);
            };
            if !crate::deep_link::is_supported_url(raw) {
                return LRESULT(0);
            }
            INCOMING_LINKS.with(|links| links.borrow_mut().push(raw.to_owned()));
            // SAFETY: This owner HWND remains live for the message loop.
            let _ = unsafe { PostMessageW(Some(hwnd), WM_DEEP_LINK, WPARAM(0), LPARAM(0)) };
            LRESULT(1)
        }
        WM_DEEP_LINK => LRESULT(0),
        // NSH_FEATURE_DEEP_LINK_END
        // NSH_FEATURE_SINGLE_INSTANCE_BEGIN
        WM_SHOW_EXISTING => LRESULT(if show_or_open_window() { 1 } else { 0 }),
        WM_HOST_READY => LRESULT(0),
        // NSH_FEATURE_SINGLE_INSTANCE_END
        // NSH_FEATURE_TRAY_BEGIN
        WM_TRAY => {
            windows_tray::handle_tray_event(hwnd, lparam);
            LRESULT(0)
        }
        // NSH_FEATURE_TRAY_END
        WM_HOST_CALL => LRESULT(0),
        _ => {
            // SAFETY: The host does not own the remaining messages.
            unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
        }
    }
}

// NSH_FEATURE_DEEP_LINK_BEGIN
fn drain_incoming_links() {
    let incoming = INCOMING_LINKS.with(|links| std::mem::take(&mut *links.borrow_mut()));
    if incoming.is_empty() {
        return;
    }
    DESKTOP.with(|desktop| {
        if let Some(desktop) = desktop.borrow_mut().as_mut() {
            for raw in incoming {
                desktop.enqueue_deep_link(raw);
            }
        }
    });
}
// NSH_FEATURE_DEEP_LINK_END

fn bundle_path() -> io::Result<PathBuf> {
    let executable = env::current_exe()?;
    if let Some(bin_dir) = executable.parent() {
        let packaged = bin_dir.join("nsh").join("bundle.js");
        if packaged.is_file() {
            return Ok(packaged);
        }
    }
    let local = env::current_dir()?
        .join(".nsh")
        .join("out")
        .join("bundle.js");
    if local.is_file() {
        return Ok(local);
    }
    Err(io::Error::new(
        io::ErrorKind::NotFound,
        "bundle.js not found; run `nsh build` first",
    ))
}

fn shutdown_desktop() {
    let desktop = DESKTOP.with(|desktop| desktop.borrow_mut().take());
    if let Some(mut desktop) = desktop {
        for (_, entry) in std::mem::take(&mut desktop.windows) {
            drop(entry.calls_rx);
            entry.view.stop();
            // SAFETY: These windows were created on this UI thread.
            let _ = unsafe { DestroyWindow(entry.view.hwnd()) };
        }
        // NSH_FEATURE_TRAY_BEGIN
        desktop.anchor.stop();
        // SAFETY: The hidden NSH surface was created on this UI thread.
        let _ = unsafe { DestroyWindow(desktop.anchor.hwnd()) };
        // NSH_FEATURE_TRAY_END
    }
}

fn run_ui(
    path: PathBuf,
    _initial_url: Option<String>,
    _ready_event: Option<isize>,
) -> Result<(), String> {
    let bundle = Bundle::read(&path).map_err(|error| error.to_string())?;
    let asset_dir = path.with_file_name("assets");
    set_ui_sets(vec![nsh_base::registry(), __CRATE_IDENT__::registry()]);
    // SAFETY: Process DPI awareness is set before creating any UI window.
    unsafe {
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }
    let _ole = OleApartment::new().map_err(|error| error.to_string())?;
    let owner = OwnerWindow::new().map_err(|error| error.to_string())?;
    // NSH_FEATURE_TRAY_BEGIN
    let mut owner = owner;
    let anchor = AppView::new(
        None,
        AppOptions {
            app_id: APP_ID.to_owned(),
            title: format!("{APP_ID}.tray.anchor"),
            size: (1, 1),
            ..AppOptions::default()
        },
    )
    .map_err(|error| error.to_string())?;
    if let Err(error) = owner.enable_tray() {
        anchor.stop();
        // SAFETY: The hidden NSH surface belongs to this UI thread.
        let _ = unsafe { DestroyWindow(anchor.hwnd()) };
        return Err(error.to_string());
    }
    // NSH_FEATURE_TRAY_END
    DESKTOP.with(|desktop| {
        *desktop.borrow_mut() = Some(Desktop {
            bundle,
            asset_dir,
            windows: BTreeMap::new(),
            next_id: 1,
            owner,
            // NSH_FEATURE_TRAY_BEGIN
            anchor,
            // NSH_FEATURE_TRAY_END
            // NSH_FEATURE_DEEP_LINK_BEGIN
            pending_links: BTreeMap::new(),
            unassigned_links: _initial_url.into_iter().collect(),
            // NSH_FEATURE_DEEP_LINK_END
        });
    });
    let first = DESKTOP.with(|desktop| {
        desktop
            .borrow_mut()
            .as_mut()
            .ok_or_else(|| "The host is closing".to_owned())?
            .open_window()
    });
    if let Err(error) = first {
        shutdown_desktop();
        return Err(error);
    }
    // NSH_FEATURE_SINGLE_INSTANCE_BEGIN
    let owner_hwnd = DESKTOP.with(|desktop| {
        desktop
            .borrow()
            .as_ref()
            .expect("desktop exists until the UI loop ends")
            .owner
            .hwnd
    });
    if _ready_event.is_some() {
        // SAFETY: Wake the loop once after host initialization succeeds.
        if let Err(error) =
            unsafe { PostMessageW(Some(owner_hwnd), WM_HOST_READY, WPARAM(0), LPARAM(0)) }
        {
            shutdown_desktop();
            return Err(error.to_string());
        }
    }
    // NSH_FEATURE_SINGLE_INSTANCE_END
    let mut message = MSG::default();
    let mut loop_error = None;
    // NSH_FEATURE_SINGLE_INSTANCE_BEGIN
    let mut ready_signaled = false;
    // NSH_FEATURE_SINGLE_INSTANCE_END
    // SAFETY: This is the Win32 message loop for NSH and its owner window.
    unsafe {
        loop {
            match GetMessageW(&mut message, None, 0, 0).0 {
                -1 => {
                    loop_error = Some(WinError::from_thread().to_string());
                    break;
                }
                0 => break,
                _ => {
                    let _ = TranslateMessage(&message);
                    DispatchMessageW(&message);
                    // NSH_FEATURE_SINGLE_INSTANCE_BEGIN
                    if !ready_signaled
                        && message.hwnd == owner_hwnd
                        && message.message == WM_HOST_READY
                    {
                        if let Some(ready) = _ready_event {
                            if let Err(error) = SetEvent(HANDLE(ready as *mut _)) {
                                loop_error = Some(error.to_string());
                                break;
                            }
                        }
                        ready_signaled = true;
                    }
                    // NSH_FEATURE_SINGLE_INSTANCE_END
                    cleanup_closed_windows();
                    // NSH_FEATURE_DEEP_LINK_BEGIN
                    drain_incoming_links();
                    // NSH_FEATURE_DEEP_LINK_END
                    drain_host_calls();
                    // NSH_FEATURE_TRAY_BEGIN
                    windows_tray::readd_tray_if_pending();
                    // NSH_FEATURE_TRAY_END
                    cleanup_closed_windows();
                }
            }
        }
    }
    shutdown_desktop();
    loop_error.map_or(Ok(()), Err)
}

pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    let initial_url = None::<String>;
    // NSH_FEATURE_DEEP_LINK_BEGIN
    let initial_url = env::args_os()
        .skip(1)
        .filter_map(|arg| arg.into_string().ok())
        .find(|raw| crate::deep_link::is_supported_url(raw));
    // NSH_FEATURE_DEEP_LINK_END
    // NSH_FEATURE_SINGLE_INSTANCE_BEGIN
    let (mut instance, already_running) = InstanceGuard::new()?;
    if already_running && let Some(hwnd) = instance.wait_for_running_or_takeover()? {
        match forward_to_running(hwnd, initial_url.as_deref()) {
            Ok(()) => return Ok(()),
            Err(error) => {
                if !instance.wait_for_exit_or_takeover()? {
                    return Err(error.into());
                }
            }
        }
    }
    // NSH_FEATURE_SINGLE_INSTANCE_END
    let path = bundle_path()?;
    let ready_event = None::<isize>;
    // NSH_FEATURE_SINGLE_INSTANCE_BEGIN
    let ready_event = Some(instance.ready_handle().0 as isize);
    // NSH_FEATURE_SINGLE_INSTANCE_END
    let ui = std::thread::Builder::new()
        .name("nsh-desktop-ui".to_owned())
        .stack_size(8 << 20)
        .spawn(move || run_ui(path, initial_url, ready_event))?;
    match ui.join() {
        Ok(Ok(())) => Ok(()),
        Ok(Err(error)) => Err(io::Error::other(error).into()),
        Err(_) => Err(io::Error::other("the Windows UI thread panicked").into()),
    }
}
