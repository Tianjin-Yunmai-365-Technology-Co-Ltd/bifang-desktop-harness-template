//! AppKit host for independent NSH Mixed windows.

use std::{cell::RefCell, collections::BTreeMap, env, io, path::PathBuf, rc::Rc};
use dispatch2::DispatchQueue;
use nsh_engine::{HostCall, HostChannel};
use nsh_platform_macos::{
    App, AppOptions, AppView, AssetBase, Bundle,
    objc2::{DefinedClass, MainThreadMarker, MainThreadOnly, define_class, msg_send, rc::Retained, runtime::ProtocolObject},
    objc2_app_kit::{NSApplication, NSApplicationActivationPolicy, NSApplicationDelegate, NSBackingStoreType, NSWindow, NSWindowDelegate, NSWindowStyleMask},
    objc2_foundation::{NSNotification, NSObject, NSObjectProtocol, NSPoint, NSRect, NSSize, NSString},
    set_ui_sets,
};
use serde_json::{Value, json};
// NSH_FEATURE_TRAY_BEGIN
use nsh_platform_macos::{objc2::{runtime::{AnyObject, Sel}, sel}, objc2_app_kit::{NSMenu, NSMenuItem, NSStatusBar, NSStatusItem, NSVariableStatusItemLength, NSEventMask, NSEventType}};
// NSH_FEATURE_TRAY_END
// NSH_FEATURE_SINGLE_INSTANCE_BEGIN
use std::{fs::{self, File, OpenOptions, TryLockError}, io::{Read, Write}, os::unix::{fs::PermissionsExt, net::{UnixListener, UnixStream}}, sync::atomic::{AtomicBool, Ordering}, thread, time::{Duration, Instant}};
const MAX_INSTANCE_MESSAGE_BYTES: usize = 8192;
const INSTANCE_WAIT: Duration = Duration::from_secs(30);
static INSTANCE_CLOSING: AtomicBool = AtomicBool::new(false);
// NSH_FEATURE_SINGLE_INSTANCE_END
// NSH_FEATURE_DEEP_LINK_BEGIN
use nsh_platform_macos::objc2_foundation::{NSArray, NSURL};
use crate::deep_link;
thread_local! { static EARLY_LINKS: RefCell<Vec<String>> = const { RefCell::new(Vec::new()) }; }
// NSH_FEATURE_DEEP_LINK_END
// NSH_FEATURE_AUTOSTART_BEGIN
use crate::macos_autostart::{autostart_enabled, set_autostart};
// NSH_FEATURE_AUTOSTART_END

const APP_ID: &str = __APP_ID__;
const NAME: &str = __NAME_EN__;
const WINDOW_SIZE: NSSize = NSSize::new(900.0, 680.0);
thread_local! { static DESKTOP: RefCell<Option<Desktop>> = const { RefCell::new(None) }; }

fn valid_window_title(title: &str) -> bool {
    !title.trim().is_empty() && title.chars().count() <= 200 && !title.chars().any(char::is_control)
}

struct WindowEntry {
    window: Retained<NSWindow>,
    view: Rc<AppView>,
    _delegate: Retained<WindowDelegate>,
    host: HostChannel,
    title: String,
    // NSH_FEATURE_DEEP_LINK_BEGIN
    pending_links: Vec<String>,
    // NSH_FEATURE_DEEP_LINK_END
}

struct Desktop {
    bundle: Bundle,
    asset_dir: PathBuf,
    windows: BTreeMap<u64, WindowEntry>,
    next_id: u64,
    // NSH_FEATURE_DEEP_LINK_BEGIN
    unassigned_links: Vec<String>,
    // NSH_FEATURE_DEEP_LINK_END
    // NSH_FEATURE_TRAY_BEGIN
    status_item: Retained<NSStatusItem>,
    _status_menu: Retained<NSMenu>,
    // NSH_FEATURE_TRAY_END
    _actions: Retained<Actions>,
}

impl Desktop {
    fn open_window(&mut self, mtm: MainThreadMarker) -> Value {
        let id = self.next_id;
        self.next_id += 1;
        let title = if id == 1 { NAME.to_owned() } else { format!("{NAME} · {id}") };
        let host = HostChannel::new();
        let mut params = serde_json::Map::new();
        params.insert("windowId".to_owned(), json!(id));
        params.insert("menuGlobal".to_owned(), json!(true));
        params.insert("menuOwner".to_owned(), json!(self.windows.is_empty()));
        host.set_params(params);
        for name in ["window.list", "window.setTitle", "window.open", "window.focus", "window.showAll", "window.close", "app.quit"
            // NSH_FEATURE_DEEP_LINK_BEGIN
            , "deepLink.takePending"
            // NSH_FEATURE_DEEP_LINK_END
            // NSH_FEATURE_AUTOSTART_BEGIN
            , "autostart.get", "autostart.set"
            // NSH_FEATURE_AUTOSTART_END
        ] {
            host.handle(name, move |call| DispatchQueue::main().exec_async(move || handle_call(id, call)));
        }
        let frame = NSRect::new(NSPoint::new(0.0, 0.0), WINDOW_SIZE);
        let style = NSWindowStyleMask::Titled | NSWindowStyleMask::Closable | NSWindowStyleMask::Miniaturizable | NSWindowStyleMask::Resizable;
        // SAFETY: NSWindow's designated initializer runs on the main thread.
        let window = unsafe { NSWindow::initWithContentRect_styleMask_backing_defer(NSWindow::alloc(mtm), frame, style, NSBackingStoreType::Buffered, false) };
        // SAFETY: WindowEntry owns NSWindow until its close callback has completed.
        unsafe { window.setReleasedWhenClosed(false) };
        window.setTitle(&NSString::from_str(&title));
        let delegate = WindowDelegate::alloc(mtm).set_ivars(id);
        // SAFETY: NSObject initializer runs on the main thread.
        let delegate: Retained<WindowDelegate> = unsafe { msg_send![super(delegate), init] };
        window.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
        let view = AppView::new(mtm, AppOptions {
            app_id: APP_ID.to_owned(), title: title.clone(),
            size: (WINDOW_SIZE.width as i32, WINDOW_SIZE.height as i32),
            asset_base: Some(AssetBase::Directory(self.asset_dir.clone())),
            host: host.clone(), ..AppOptions::default()
        });
        window.setContentView(Some(&view.view()));
        view.load(App::Js(self.bundle.clone()));
        if let Some(previous) = self.windows.values().next_back() {
            let frame = previous.window.frame();
            let _ = window.cascadeTopLeftFromPoint(NSPoint::new(frame.origin.x, frame.origin.y + frame.size.height));
        } else { window.center(); }
        window.makeKeyAndOrderFront(None);
        NSApplication::sharedApplication(mtm).activate();
        self.windows.insert(id, WindowEntry {
            window, view, _delegate: delegate, host, title: title.clone(),
            // NSH_FEATURE_DEEP_LINK_BEGIN
            pending_links: std::mem::take(&mut self.unassigned_links),
            // NSH_FEATURE_DEEP_LINK_END
        });
        self.broadcast_windows();
        json!({"id": id, "title": title})
    }

    fn window_list(&self) -> Value {
        Value::Array(self.windows.iter().map(|(id, entry)| json!({"id": id, "title": entry.window.title().to_string()})).collect())
    }

    fn broadcast_windows(&self) {
        let list = self.window_list();
        for entry in self.windows.values() { let _ = entry.host.send("windows", list.clone()); }
    }

    // NSH_FEATURE_DEEP_LINK_BEGIN
    fn active_window_id(&self) -> Option<u64> {
        self.windows.iter().find_map(|(id, entry)| entry.window.isKeyWindow().then_some(*id))
            .or_else(|| self.windows.keys().next_back().copied())
    }
    // NSH_FEATURE_DEEP_LINK_END

    fn focus_window(&self, id: u64, mtm: MainThreadMarker) -> bool {
        let Some(entry) = self.windows.get(&id) else { return false; };
        if entry.window.isMiniaturized() { entry.window.deminiaturize(None); }
        entry.window.makeKeyAndOrderFront(None);
        NSApplication::sharedApplication(mtm).activate();
        true
    }

    fn show_all(&self, mtm: MainThreadMarker) {
        for entry in self.windows.values() {
            if entry.window.isMiniaturized() { entry.window.deminiaturize(None); }
            entry.window.makeKeyAndOrderFront(None);
        }
        NSApplication::sharedApplication(mtm).activate();
    }

    // NSH_FEATURE_DEEP_LINK_BEGIN
    fn accept_links(&mut self, links: Vec<String>, mtm: MainThreadMarker) {
        for url in links.into_iter().filter(|url| deep_link::is_supported_url(url)) {
            if self.windows.is_empty() { self.unassigned_links.push(url); self.open_window(mtm); continue; }
            if let Some(id) = self.active_window_id() {
                self.focus_window(id, mtm);
                if let Some(entry) = self.windows.get(&id) { let _ = entry.host.send("deepLink", json!(url)); }
            }
        }
    }
    // NSH_FEATURE_DEEP_LINK_END
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "NshMixedDesktopActions"]
    struct Actions;
    unsafe impl NSObjectProtocol for Actions {}
    unsafe impl NSApplicationDelegate for Actions {
        // NSH_FEATURE_DEEP_LINK_BEGIN
        #[unsafe(method(application:openURLs:))]
        fn open_urls(&self, _app: &NSApplication, urls: &NSArray<NSURL>) {
            for url in urls.iter() { if let Some(value) = url.absoluteString() { queue_deep_link(value.to_string()); } }
        }
        // NSH_FEATURE_DEEP_LINK_END
        #[unsafe(method(applicationShouldTerminateAfterLastWindowClosed:))]
        fn should_terminate_after_last_window_closed(&self, _app: &NSApplication) -> bool {
            __QUIT_AFTER_LAST_WINDOW__
        }
        #[unsafe(method(applicationShouldHandleReopen:hasVisibleWindows:))]
        fn should_handle_reopen(&self, _app: &NSApplication, _visible: bool) -> bool { show_all_windows(); false }
        #[unsafe(method(applicationWillTerminate:))]
        fn will_terminate(&self, _notification: &NSNotification) {
            // NSH_FEATURE_SINGLE_INSTANCE_BEGIN
            INSTANCE_CLOSING.store(true, Ordering::Release);
            // NSH_FEATURE_SINGLE_INSTANCE_END
            DESKTOP.with(|cell| { if let Some(desktop) = cell.borrow_mut().take() {
                for entry in desktop.windows.into_values() { entry.view.stop(); }
            }});
        }
    }
    // NSH_FEATURE_TRAY_BEGIN
    impl Actions {
        #[unsafe(method(statusClicked:))]
        fn status_clicked(&self, _sender: Option<&AnyObject>) {
            let mtm = MainThreadMarker::from(self);
            let app = NSApplication::sharedApplication(mtm);
            let event = app.currentEvent();
            if event.as_ref().is_some_and(|event| event.r#type() == NSEventType::RightMouseUp) {
                let popup = DESKTOP.with(|cell| cell.borrow().as_ref().map(|desktop| (desktop.status_item.clone(), desktop._status_menu.clone())));
                if let (Some((item, menu)), Some(event)) = (popup, event)
                    && let Some(button) = item.button(mtm) { NSMenu::popUpContextMenu_withEvent_forView(&menu, &event, &button); }
            } else { show_all_windows(); }
        }
        #[unsafe(method(newWindow:))]
        fn new_window(&self, _sender: Option<&AnyObject>) {
            let mtm = MainThreadMarker::from(self);
            DESKTOP.with(|cell| { if let Some(desktop) = cell.borrow_mut().as_mut() { desktop.open_window(mtm); }});
        }
        #[unsafe(method(showAll:))]
        fn show_all(&self, _sender: Option<&AnyObject>) { show_all_windows(); }
        #[unsafe(method(quitApp:))]
        fn quit_app(&self, _sender: Option<&AnyObject>) { NSApplication::sharedApplication(MainThreadMarker::from(self)).terminate(None); }
    }
    // NSH_FEATURE_TRAY_END
);

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = u64]
    #[name = "NshMixedDesktopWindowDelegate"]
    struct WindowDelegate;
    unsafe impl NSObjectProtocol for WindowDelegate {}
    unsafe impl NSWindowDelegate for WindowDelegate {
        #[unsafe(method(windowWillClose:))]
        fn window_will_close(&self, _notification: &NSNotification) {
            let id = *self.ivars();
            DispatchQueue::main().exec_async(move || DESKTOP.with(|cell| {
                if let Some(desktop) = cell.borrow_mut().as_mut() {
                    let owner = desktop.windows.keys().next().copied() == Some(id);
                    if let Some(entry) = desktop.windows.remove(&id) {
                        entry.view.stop();
                        // NSH_FEATURE_DEEP_LINK_BEGIN
                        if !entry.pending_links.is_empty() {
                            if let Some(next) = desktop.windows.values_mut().next() { next.pending_links.extend(entry.pending_links); }
                            else { desktop.unassigned_links.extend(entry.pending_links); }
                        }
                        // NSH_FEATURE_DEEP_LINK_END
                        if owner && let Some((_, next)) = desktop.windows.first_key_value() { let _ = next.host.send("menu.owner", json!(true)); }
                    }
                    desktop.broadcast_windows();
                }
            }));
        }
    }
);

fn show_all_windows() {
    if let Some(mtm) = MainThreadMarker::new() { DESKTOP.with(|cell| { if let Some(desktop) = cell.borrow_mut().as_mut() {
        if desktop.windows.is_empty() { desktop.open_window(mtm); } else { desktop.show_all(mtm); }
    }}); }
}

// NSH_FEATURE_DEEP_LINK_BEGIN
fn queue_deep_link(raw: String) {
    if !deep_link::is_supported_url(&raw) { return; }
    EARLY_LINKS.with(|cell| cell.borrow_mut().push(raw));
    DispatchQueue::main().exec_async(deliver_pending_links);
}

fn deliver_pending_links() {
    let Some(mtm) = MainThreadMarker::new() else { return; };
    let links = EARLY_LINKS.with(|cell| std::mem::take(&mut *cell.borrow_mut()));
    if links.is_empty() { return; }
    DESKTOP.with(|cell| {
        if let Some(desktop) = cell.borrow_mut().as_mut() { desktop.accept_links(links, mtm); }
        else { EARLY_LINKS.with(|cell| cell.borrow_mut().extend(links)); }
    });
}
// NSH_FEATURE_DEEP_LINK_END

// NSH_FEATURE_SINGLE_INSTANCE_BEGIN
struct InstanceGuard {
    _lock: File,
    socket_path: PathBuf,
    listener: Option<UnixListener>,
}

impl InstanceGuard {
    fn start(&mut self) -> io::Result<()> {
        let listener = self.listener.take().ok_or_else(|| io::Error::other("Instance listener already started"))?;
        thread::Builder::new().name("nsh-instance-ipc".to_owned()).spawn(move || listen_for_second_instances(listener))?;
        Ok(())
    }
}

impl Drop for InstanceGuard {
    fn drop(&mut self) { let _ = fs::remove_file(&self.socket_path); }
}

fn claim_instance(urls: &[String]) -> io::Result<Option<InstanceGuard>> {
    let home = env::var_os("HOME").ok_or_else(|| io::Error::other("User home directory unavailable"))?;
    let directory = PathBuf::from(home).join("Library/Application Support").join(APP_ID);
    fs::create_dir_all(&directory)?;
    fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))?;
    let lock = OpenOptions::new().read(true).write(true).create(true).truncate(false).open(directory.join("instance.lock"))?;
    let socket_path = directory.join("instance.sock");
    let payload = serde_json::to_vec(&json!({"urls": urls}))?;
    if payload.len() > MAX_INSTANCE_MESSAGE_BYTES { return Err(io::Error::new(io::ErrorKind::InvalidInput, "Too many launch URLs")); }
    let deadline = Instant::now() + INSTANCE_WAIT;
    loop {
        match lock.try_lock() {
            Ok(()) => {
                match fs::remove_file(&socket_path) {
                    Ok(()) => {},
                    Err(error) if error.kind() == io::ErrorKind::NotFound => {},
                    Err(error) => return Err(error),
                }
                let listener = UnixListener::bind(&socket_path)?;
                return Ok(Some(InstanceGuard { _lock: lock, socket_path, listener: Some(listener) }));
            }
            Err(TryLockError::WouldBlock) => {
                if forward_to_first_instance(&socket_path, &payload).is_ok() { return Ok(None); }
                if Instant::now() >= deadline { return Err(io::Error::new(io::ErrorKind::TimedOut, "Running instance did not accept launch")); }
                thread::sleep(Duration::from_millis(50));
            }
            Err(TryLockError::Error(error)) => return Err(error),
        }
    }
}

fn forward_to_first_instance(socket_path: &PathBuf, payload: &[u8]) -> io::Result<()> {
    let mut stream = UnixStream::connect(socket_path)?;
    stream.set_write_timeout(Some(Duration::from_secs(2)))?;
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    stream.write_all(&(payload.len() as u32).to_be_bytes())?;
    stream.write_all(payload)?;
    let mut response = [0];
    stream.read_exact(&mut response)?;
    if response == [1] { Ok(()) } else { Err(io::Error::other("Running instance rejected launch")) }
}

fn listen_for_second_instances(listener: UnixListener) {
    for incoming in listener.incoming() {
        let Ok(mut stream) = incoming else { break; };
        if let Err(error) = receive_second_instance(&mut stream) { eprintln!("Ignoring instance request: {error}"); }
    }
}

fn receive_second_instance(stream: &mut UnixStream) -> io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
    stream.set_write_timeout(Some(Duration::from_secs(2)))?;
    let mut size = [0; 4];
    stream.read_exact(&mut size)?;
    let size = u32::from_be_bytes(size) as usize;
    if size > MAX_INSTANCE_MESSAGE_BYTES { return Err(io::Error::new(io::ErrorKind::InvalidData, "Instance request too large")); }
    let mut payload = vec![0; size];
    stream.read_exact(&mut payload)?;
    let request: Value = serde_json::from_slice(&payload)?;
    let raw = request.get("urls").and_then(Value::as_array).ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "URL list missing"))?;
    let mut urls = Vec::new();
    for value in raw {
        let url = value.as_str().ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "Invalid launch URL"))?;
        // NSH_FEATURE_DEEP_LINK_BEGIN
        if !deep_link::is_supported_url(url) { return Err(io::Error::new(io::ErrorKind::InvalidData, "Unsupported launch URL")); }
        // NSH_FEATURE_DEEP_LINK_END
        urls.push(url.to_owned());
    }
    if INSTANCE_CLOSING.load(Ordering::Acquire) { return Err(io::Error::new(io::ErrorKind::ConnectionAborted, "Host closing")); }
    let mut reply = stream.try_clone()?;
    DispatchQueue::main().exec_async(move || {
        if INSTANCE_CLOSING.load(Ordering::Acquire) { return; }
        if urls.is_empty() { show_all_windows(); }
        // NSH_FEATURE_DEEP_LINK_BEGIN
        else { for url in urls { queue_deep_link(url); } deliver_pending_links(); }
        // NSH_FEATURE_DEEP_LINK_END
        let _ = reply.write_all(&[1]);
    });
    Ok(())
}
// NSH_FEATURE_SINGLE_INSTANCE_END

fn handle_call(sender: u64, call: HostCall) {
    let Some(mtm) = MainThreadMarker::new() else { call.reject("Main thread required"); return; };
    match call.name() {
        "window.list" => call.reply(DESKTOP.with(|cell| cell.borrow().as_ref().map(Desktop::window_list).ok_or_else(|| "Host closing".to_owned()))),
        "window.setTitle" => {
            let result = call.data().get("title").and_then(Value::as_str).filter(|title| valid_window_title(title))
                .ok_or_else(|| "Valid window title required".to_owned())
                .and_then(|title| DESKTOP.with(|cell| {
                    let mut desktop = cell.borrow_mut(); let desktop = desktop.as_mut().ok_or_else(|| "Host closing".to_owned())?;
                    let entry = desktop.windows.get_mut(&sender).ok_or_else(|| "Window closed".to_owned())?;
                    if entry.title == title { return Ok(json!(false)); }
                    entry.window.setTitle(&NSString::from_str(title));
                    entry.title = title.to_owned();
                    desktop.broadcast_windows();
                    Ok(json!(true))
                }));
            call.reply(result);
        }
        "window.open" => call.reply(DESKTOP.with(|cell| {
            let mut desktop = cell.borrow_mut(); let desktop = desktop.as_mut().ok_or_else(|| "Host closing".to_owned())?;
            if !desktop.windows.contains_key(&sender) { return Err("Window closed".to_owned()); }
            Ok(desktop.open_window(mtm))
        })),
        "window.focus" => {
            let result = call.data().get("id").and_then(Value::as_u64).ok_or_else(|| "Valid window id required".to_owned())
                .and_then(|id| DESKTOP.with(|cell| cell.borrow().as_ref().map(|desktop| json!(desktop.focus_window(id, mtm))).ok_or_else(|| "Host closing".to_owned())));
            call.reply(result);
        }
        "window.showAll" => call.reply(DESKTOP.with(|cell| cell.borrow().as_ref().map(|desktop| { desktop.show_all(mtm); Value::Null }).ok_or_else(|| "Host closing".to_owned()))),
        "window.close" => {
            let window = call.data().get("id").and_then(Value::as_u64).and_then(|id| DESKTOP.with(|cell| cell.borrow().as_ref().and_then(|desktop| desktop.windows.get(&id).map(|entry| entry.window.clone()))));
            call.resolve(Value::Null);
            if let Some(window) = window { window.close(); }
        }
        // NSH_FEATURE_DEEP_LINK_BEGIN
        "deepLink.takePending" => call.reply(DESKTOP.with(|cell| {
            let mut desktop = cell.borrow_mut(); let desktop = desktop.as_mut().ok_or_else(|| "Host closing".to_owned())?;
            let entry = desktop.windows.get_mut(&sender).ok_or_else(|| "Window closed".to_owned())?;
            Ok(json!(std::mem::take(&mut entry.pending_links)))
        })),
        // NSH_FEATURE_DEEP_LINK_END
        // NSH_FEATURE_AUTOSTART_BEGIN
        "autostart.get" => call.reply(autostart_enabled().map(|enabled| json!(enabled))),
        "autostart.set" => {
            let result = call.data().get("enabled").and_then(Value::as_bool).ok_or_else(|| "Boolean enabled required".to_owned()).and_then(set_autostart).map(|enabled| json!(enabled));
            call.reply(result);
        }
        // NSH_FEATURE_AUTOSTART_END
        "app.quit" => { call.resolve(Value::Null); NSApplication::sharedApplication(mtm).terminate(None); }
        _ => call.reject("Unknown host command"),
    }
}

// NSH_FEATURE_TRAY_BEGIN
fn menu_item(mtm: MainThreadMarker, title: &str, action: Sel, target: &Actions) -> Retained<NSMenuItem> {
    // SAFETY: Actions owns each selector and remains retained for the menu lifetime.
    let item = unsafe { NSMenuItem::initWithTitle_action_keyEquivalent(NSMenuItem::alloc(mtm), &NSString::from_str(title), Some(action), &NSString::from_str("")) };
    // SAFETY: Desktop retains Actions for the menu lifetime.
    unsafe { item.setTarget(Some(target)) };
    item
}

fn make_status_item(mtm: MainThreadMarker, actions: &Actions) -> io::Result<(Retained<NSStatusItem>, Retained<NSMenu>)> {
    let bar = NSStatusBar::systemStatusBar();
    let item = bar.statusItemWithLength(NSVariableStatusItemLength);
    let button = item.button(mtm).ok_or_else(|| io::Error::other("Status item button unavailable"))?;
    button.setTitle(&NSString::from_str(&NAME.chars().take(2).collect::<String>()));
    button.setToolTip(Some(&NSString::from_str(NAME)));
    // SAFETY: Desktop retains Actions and the button dispatches only its implemented selector.
    unsafe { button.setTarget(Some(actions)); button.setAction(Some(sel!(statusClicked:))); }
    button.sendActionOn(NSEventMask::LeftMouseUp | NSEventMask::RightMouseUp);
    let menu = NSMenu::new(mtm);
    menu.addItem(&menu_item(mtm, "New Window", sel!(newWindow:), actions));
    menu.addItem(&menu_item(mtm, "Show Windows", sel!(showAll:), actions));
    menu.addItem(&NSMenuItem::separatorItem(mtm));
    menu.addItem(&menu_item(mtm, "Quit", sel!(quitApp:), actions));
    Ok((item, menu))
}
// NSH_FEATURE_TRAY_END

fn bundle_path() -> io::Result<PathBuf> {
    #[cfg(debug_assertions)]
    if let Some(directory) = env::var_os("NSH_BUNDLE_DIR") {
        let path = PathBuf::from(directory).join("bundle.js");
        if path.is_file() { return Ok(path); }
    }
    let path = env::current_exe()?.parent().ok_or_else(|| io::Error::other("No executable parent"))?.join("../Resources/nsh/bundle.js");
    if path.is_file() { Ok(path) } else { Err(io::Error::new(io::ErrorKind::NotFound, "NSH bundle.js is missing")) }
}

pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    // NSH_FEATURE_DEEP_LINK_BEGIN
    let urls = env::args_os().skip(1).filter_map(|arg| arg.into_string().ok()).filter(|arg| deep_link::is_supported_url(arg)).collect::<Vec<_>>();
    // NSH_FEATURE_DEEP_LINK_END
    // NSH_FEATURE_SINGLE_INSTANCE_BEGIN
    let mut launch_urls = Vec::new();
    // NSH_FEATURE_DEEP_LINK_BEGIN
    launch_urls.extend(urls.iter().cloned());
    // NSH_FEATURE_DEEP_LINK_END
    let Some(mut instance) = claim_instance(&launch_urls)? else { return Ok(()); };
    // NSH_FEATURE_SINGLE_INSTANCE_END
    let path = bundle_path()?;
    let bundle = Bundle::read(&path)?;
    let asset_dir = path.with_file_name("assets");
    set_ui_sets(vec![nsh_base::registry(), __CRATE_IDENT__::registry()]);
    let mtm = MainThreadMarker::new().ok_or("Host must start on the main thread")?;
    let app = NSApplication::sharedApplication(mtm);
    app.setActivationPolicy(NSApplicationActivationPolicy::Regular);
    let actions = Actions::alloc(mtm);
    // SAFETY: NSObject initializer runs on the main thread.
    let actions: Retained<Actions> = unsafe { msg_send![actions, init] };
    app.setDelegate(Some(ProtocolObject::from_ref(&*actions)));
    // NSH_FEATURE_TRAY_BEGIN
    let (status_item, status_menu) = make_status_item(mtm, &actions)?;
    // NSH_FEATURE_TRAY_END
    DESKTOP.with(|cell| *cell.borrow_mut() = Some(Desktop {
        bundle, asset_dir, windows: BTreeMap::new(), next_id: 1,
        // NSH_FEATURE_DEEP_LINK_BEGIN
        unassigned_links: urls,
        // NSH_FEATURE_DEEP_LINK_END
        // NSH_FEATURE_TRAY_BEGIN
        status_item, _status_menu: status_menu,
        // NSH_FEATURE_TRAY_END
        _actions: actions,
    }));
    DESKTOP.with(|cell| { if let Some(desktop) = cell.borrow_mut().as_mut() { desktop.open_window(mtm); }});
    // NSH_FEATURE_SINGLE_INSTANCE_BEGIN
    instance.start()?;
    // NSH_FEATURE_SINGLE_INSTANCE_END
    app.run();
    app.setDelegate(None);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::valid_window_title;

    #[test]
    fn title_input_is_bounded_and_keeps_unicode() {
        assert!(valid_window_title("测试工具 · 2"));
        assert!(valid_window_title(&"界".repeat(200)));
        assert!(!valid_window_title(" \t "));
        assert!(!valid_window_title("bad\nname"));
        assert!(!valid_window_title(&"界".repeat(201)));
    }
}
