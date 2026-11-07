//! GTK host for independent NSH Mixed windows.
use std::{cell::RefCell, collections::BTreeMap, env, io, path::PathBuf, rc::Rc};

use nsh_engine::{HostCall, HostChannel};
use nsh_platform_linux::{App, AppOptions, AppView, AssetBase, Bundle, gtk4 as gtk, set_ui_sets};
use gtk::{gio, glib, prelude::*};
use serde_json::{Value, json};
// NSH_FEATURE_TRAY_BEGIN
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use ksni::{blocking::{Handle as TrayHandle, TrayMethods}, menu::StandardItem};
// NSH_FEATURE_TRAY_END
// NSH_FEATURE_AUTOSTART_BEGIN
#[path = "linux_autostart.rs"]
mod autostart;
use autostart::{autostart_enabled, set_autostart};
// NSH_FEATURE_AUTOSTART_END
// NSH_FEATURE_DEEP_LINK_BEGIN
use crate::deep_link;
// NSH_FEATURE_DEEP_LINK_END

const APP_ID: &str = __APP_ID__;
const NAME: &str = __NAME_EN__;
const WINDOW_WIDTH: i32 = 900;
const WINDOW_HEIGHT: i32 = 680;

thread_local! {
    static DESKTOP: RefCell<Option<Desktop>> = const { RefCell::new(None) };
}

struct WindowEntry {
    window: gtk::ApplicationWindow,
    view: Rc<AppView>,
    host: HostChannel,
    title: String,
}

struct Desktop {
    app: gtk::Application,
    bundle: Bundle,
    asset_dir: PathBuf,
    windows: BTreeMap<u64, WindowEntry>,
    next_id: u64,
    // NSH_FEATURE_DEEP_LINK_BEGIN
    pending_links: Vec<String>,
    // NSH_FEATURE_DEEP_LINK_END
    // NSH_FEATURE_TRAY_BEGIN
    tray: Option<TrayHandle<DesktopTray>>,
    tray_hold: Option<gio::ApplicationHoldGuard>,
    // NSH_FEATURE_TRAY_END
}

impl Desktop {
    fn open_window(&mut self) -> Value {
        let id = self.next_id;
        self.next_id += 1;
        let title = if id == 1 { NAME.to_owned() } else { format!("{NAME} · {id}") };
        let host = HostChannel::new();
        let mut params = serde_json::Map::new();
        params.insert("windowId".to_owned(), json!(id));
        host.set_params(params);
        for name in ["window.list", "window.open", "window.focus", "window.showAll", "window.close", "app.quit"
            // NSH_FEATURE_DEEP_LINK_BEGIN
            , "deepLink.takePending"
            // NSH_FEATURE_DEEP_LINK_END
            // NSH_FEATURE_AUTOSTART_BEGIN
            , "autostart.get", "autostart.set"
            // NSH_FEATURE_AUTOSTART_END
        ] {
            host.handle(name, move |call| glib::idle_add_once(move || handle_call(id, call)));
        }
        let window = gtk::ApplicationWindow::builder()
            .application(&self.app).title(&title)
            .default_width(WINDOW_WIDTH).default_height(WINDOW_HEIGHT).build();
        let view = AppView::new(AppOptions {
            app_id: APP_ID.to_owned(), title: title.clone(), size: (WINDOW_WIDTH, WINDOW_HEIGHT),
            asset_base: Some(AssetBase::Directory(self.asset_dir.clone())),
            host: host.clone(), ..AppOptions::default()
        });
        window.set_child(Some(&view.widget()));
        view.load(App::Js(self.bundle.clone()));
        window.connect_destroy(move |_| glib::idle_add_local_once(move || remove_window(id)));
        window.present();
        self.windows.insert(id, WindowEntry { window, view, host, title: title.clone() });
        self.broadcast_windows();
        json!({"id": id, "title": title})
    }

    fn window_list(&self) -> Value {
        Value::Array(self.windows.iter().map(|(id, entry)| json!({"id": id, "title": entry.title})).collect())
    }

    fn broadcast_windows(&self) {
        let list = self.window_list();
        for entry in self.windows.values() { let _ = entry.host.send("windows", list.clone()); }
    }

    fn focus_window(&self, id: u64) -> bool {
        let Some(entry) = self.windows.get(&id) else { return false; };
        entry.window.present();
        true
    }

    fn show_all(&self) { for entry in self.windows.values() { entry.window.present(); } }

    // NSH_FEATURE_DEEP_LINK_BEGIN
    fn accept_links(&mut self, urls: impl IntoIterator<Item = String>) {
        for url in urls.into_iter().filter(|url| deep_link::is_supported_url(url)) {
            if self.windows.is_empty() { self.pending_links.push(url); self.open_window(); continue; }
            if let Some(entry) = self.windows.values().find(|entry| entry.window.is_active()).or_else(|| self.windows.values().next_back()) {
                entry.window.present();
                let _ = entry.host.send("deepLink", json!(url));
            } else {
                self.pending_links.push(url);
            }
        }
    }
    // NSH_FEATURE_DEEP_LINK_END
}

fn remove_window(id: u64) {
    DESKTOP.with(|desktop| {
        if let Some(desktop) = desktop.borrow_mut().as_mut() {
            if let Some(entry) = desktop.windows.remove(&id) { entry.view.stop(); }
            desktop.broadcast_windows();
        }
    });
}

fn handle_call(sender: u64, call: HostCall) {
    match call.name() {
        "window.list" => call.reply(DESKTOP.with(|cell| cell.borrow().as_ref().map(Desktop::window_list).ok_or_else(|| "Host closing".to_owned()))),
        "window.open" => call.reply(DESKTOP.with(|cell| {
            let mut desktop = cell.borrow_mut();
            let desktop = desktop.as_mut().ok_or_else(|| "Host closing".to_owned())?;
            if !desktop.windows.contains_key(&sender) { return Err("Window closed".to_owned()); }
            Ok(desktop.open_window())
        })),
        "window.focus" => {
            let result = call.data().get("id").and_then(Value::as_u64).ok_or_else(|| "A valid window id is required".to_owned())
                .and_then(|id| DESKTOP.with(|cell| cell.borrow().as_ref().map(|desktop| json!(desktop.focus_window(id))).ok_or_else(|| "Host closing".to_owned())));
            call.reply(result);
        }
        "window.showAll" => call.reply(DESKTOP.with(|cell| cell.borrow().as_ref().map(|desktop| { desktop.show_all(); Value::Null }).ok_or_else(|| "Host closing".to_owned()))),
        "window.close" => {
            let window = call.data().get("id").and_then(Value::as_u64).and_then(|id| DESKTOP.with(|cell| cell.borrow().as_ref().and_then(|desktop| desktop.windows.get(&id).map(|entry| entry.window.clone()))));
            call.resolve(Value::Null);
            if let Some(window) = window { window.close(); }
        }
        // NSH_FEATURE_DEEP_LINK_BEGIN
        "deepLink.takePending" => call.reply(DESKTOP.with(|cell| {
            let mut desktop = cell.borrow_mut();
            let desktop = desktop.as_mut().ok_or_else(|| "Host closing".to_owned())?;
            if !desktop.windows.contains_key(&sender) { return Err("Window closed".to_owned()); }
            Ok(json!(std::mem::take(&mut desktop.pending_links)))
        })),
        // NSH_FEATURE_DEEP_LINK_END
        // NSH_FEATURE_AUTOSTART_BEGIN
        "autostart.get" => call.reply(DESKTOP.with(|cell| {
            let desktop = cell.borrow();
            if !desktop.as_ref().is_some_and(|desktop| desktop.windows.contains_key(&sender)) { return Err("Window closed".to_owned()); }
            autostart_enabled().map(|enabled| json!(enabled))
        })),
        "autostart.set" => {
            let result = call.data().get("enabled").and_then(Value::as_bool).ok_or_else(|| "A boolean enabled value is required".to_owned())
                .and_then(|enabled| DESKTOP.with(|cell| {
                    let desktop = cell.borrow();
                    if !desktop.as_ref().is_some_and(|desktop| desktop.windows.contains_key(&sender)) { return Err("Window closed".to_owned()); }
                    set_autostart(enabled).map(|actual| json!(actual))
                }));
            call.reply(result);
        }
        // NSH_FEATURE_AUTOSTART_END
        "app.quit" => {
            let app = DESKTOP.with(|cell| cell.borrow().as_ref().map(|desktop| desktop.app.clone()));
            call.resolve(Value::Null);
            if let Some(app) = app { app.quit(); }
        }
        _ => call.reject("Unknown host command"),
    }
}

// NSH_FEATURE_TRAY_BEGIN
#[derive(Clone, Copy)]
enum TrayAction { NewWindow, ShowAll, Quit }

fn tray_action(action: TrayAction) {
    glib::idle_add_once(move || DESKTOP.with(|cell| {
        let mut desktop = cell.borrow_mut();
        let Some(desktop) = desktop.as_mut() else { return; };
        match action {
            TrayAction::NewWindow => { desktop.open_window(); }
            TrayAction::ShowAll => { if desktop.windows.is_empty() { desktop.open_window(); } else { desktop.show_all(); } },
            TrayAction::Quit => desktop.app.quit(),
        }
    }));
}

struct DesktopTray { online: Arc<AtomicBool> }
impl ksni::Tray for DesktopTray {
    fn id(&self) -> String { APP_ID.to_owned() }
    fn title(&self) -> String { NAME.to_owned() }
    fn icon_pixmap(&self) -> Vec<ksni::Icon> {
        let mut data = Vec::with_capacity(16 * 16 * 4);
        for y in 0..16 { for x in 0..16 {
            let active = (x == 3 || x == 12 || x == y) && (2..=13).contains(&y);
            let color = if active { (255, 255, 255) } else { (36, 87, 167) };
            data.extend_from_slice(&[255, color.0, color.1, color.2]);
        }}
        vec![ksni::Icon { width: 16, height: 16, data }]
    }
    fn activate(&mut self, _: i32, _: i32) { tray_action(TrayAction::ShowAll); }
    fn menu(&self) -> Vec<ksni::MenuItem<Self>> {
        vec![
            StandardItem { label: "New Window".to_owned(), activate: Box::new(|_| tray_action(TrayAction::NewWindow)), ..Default::default() }.into(),
            StandardItem { label: "Show Windows".to_owned(), activate: Box::new(|_| tray_action(TrayAction::ShowAll)), ..Default::default() }.into(),
            ksni::MenuItem::Separator,
            StandardItem { label: "Quit".to_owned(), activate: Box::new(|_| tray_action(TrayAction::Quit)), ..Default::default() }.into(),
        ]
    }
    fn watcher_online(&self) {
        self.online.store(true, Ordering::Release);
        glib::idle_add_once(|| DESKTOP.with(|cell| {
            let mut desktop = cell.borrow_mut();
            if let Some(desktop) = desktop.as_mut() {
                if desktop.tray.is_some() && desktop.tray_hold.is_none() { desktop.tray_hold = Some(desktop.app.hold()); }
            }
        }));
    }
    fn watcher_offline(&self, _: ksni::OfflineReason) -> bool {
        self.online.store(false, Ordering::Release);
        glib::idle_add_once(|| DESKTOP.with(|cell| {
            let hold = cell.borrow_mut().as_mut().and_then(|desktop| desktop.tray_hold.take());
            drop(hold);
        }));
        true
    }
}
// NSH_FEATURE_TRAY_END

fn bundle_path() -> io::Result<PathBuf> {
    #[cfg(debug_assertions)]
    if let Some(directory) = env::var_os("NSH_BUNDLE_DIR") {
        let path = PathBuf::from(directory).join("bundle.js");
        if path.is_file() { return Ok(path); }
    }
    let path = env::current_exe()?.parent().ok_or_else(|| io::Error::other("No executable parent"))?.join("nsh/bundle.js");
    if path.is_file() { Ok(path) } else { Err(io::Error::new(io::ErrorKind::NotFound, "NSH bundle.js is missing")) }
}

fn ensure_desktop(app: &gtk::Application, bundle: &Bundle, asset_dir: &PathBuf) -> bool {
    DESKTOP.with(|cell| {
        let mut desktop = cell.borrow_mut();
        if desktop.is_some() { return false; }
        // NSH_FEATURE_TRAY_BEGIN
        let tray = DesktopTray { online: Arc::new(AtomicBool::new(true)) }.spawn().ok();
        let tray_hold = tray.as_ref().map(|_| app.hold());
        // NSH_FEATURE_TRAY_END
        *desktop = Some(Desktop {
            app: app.clone(), bundle: bundle.clone(), asset_dir: asset_dir.clone(),
            windows: BTreeMap::new(), next_id: 1,
            // NSH_FEATURE_DEEP_LINK_BEGIN
            pending_links: Vec::new(),
            // NSH_FEATURE_DEEP_LINK_END
            // NSH_FEATURE_TRAY_BEGIN
            tray, tray_hold,
            // NSH_FEATURE_TRAY_END
        });
        true
    })
}

pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    let path = bundle_path()?;
    let bundle = Bundle::read(&path)?;
    let asset_dir = path.with_file_name("assets");
    set_ui_sets(vec![nsh_base::registry(), __CRATE_IDENT__::registry()]);
    glib::set_prgname(Some(APP_ID));
    let app = gtk::Application::builder().application_id(APP_ID).flags(__LINUX_APP_FLAGS__).build();
    // NSH_FEATURE_SINGLE_INSTANCE_BEGIN
    // NSH_FEATURE_DEEP_LINK_BEGIN
    // The URI is dispatched to the first instance by GApplication.
    let open_bundle = bundle.clone();
    let open_assets = asset_dir.clone();
    app.connect_open(move |app, files, _| {
        let urls = files.iter().map(|file| file.uri().to_string()).filter(|url| deep_link::is_supported_url(url)).collect::<Vec<_>>();
        if urls.is_empty() { return; }
        ensure_desktop(app, &open_bundle, &open_assets);
        DESKTOP.with(|cell| { if let Some(desktop) = cell.borrow_mut().as_mut() { desktop.accept_links(urls); } });
    });
    // NSH_FEATURE_DEEP_LINK_END
    // NSH_FEATURE_SINGLE_INSTANCE_END
    app.connect_activate(move |app| {
        let first = ensure_desktop(app, &bundle, &asset_dir);
        DESKTOP.with(|cell| { if let Some(desktop) = cell.borrow_mut().as_mut() {
            if first || desktop.windows.is_empty() { desktop.open_window(); } else { desktop.show_all(); }
        }});
    });
    app.connect_shutdown(|_| DESKTOP.with(|cell| {
        if let Some(mut desktop) = cell.borrow_mut().take() {
            for entry in std::mem::take(&mut desktop.windows).into_values() { entry.view.stop(); }
            // NSH_FEATURE_TRAY_BEGIN
            if let Some(tray) = desktop.tray.take() { let _ = tray.shutdown(); }
            // NSH_FEATURE_TRAY_END
        }
    }));
    app.run();
    Ok(())
}
