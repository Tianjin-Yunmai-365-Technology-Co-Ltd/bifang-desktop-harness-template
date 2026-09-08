export const NOTIFICATION_RUNTIME_FIXTURE_SOURCE = `
struct NotificationPayload { title: String, body: String }
enum NotificationCommand {
    RequestPermission {
        app: tauri::AppHandle,
        reply: oneshot::Sender<Result<(), &'static str>>,
    },
    Deliver {
        app: tauri::AppHandle,
        payload: NotificationPayload,
        reply: oneshot::Sender<Result<(), &'static str>>,
    },
}
struct NotificationWorker {
    sender: Mutex<Option<mpsc::Sender<NotificationCommand>>>,
    task: JoinHandle<()>,
}

impl NotificationWorker {
    fn sender(&self) -> Result<mpsc::Sender<NotificationCommand>, &'static str> {
        self.sender.lock().map_err(|_| "notification-worker-closed")?
            .as_ref().cloned().ok_or("notification-worker-closed")
    }

    fn shutdown(&self) {
        if let Ok(mut sender) = self.sender.lock() { sender.take(); }
        self.task.abort();
    }
}

impl Drop for NotificationWorker {
    fn drop(&mut self) {
        if let Ok(sender) = self.sender.get_mut() { sender.take(); }
        self.task.abort();
    }
}

async fn run_notification_worker(mut receiver: mpsc::Receiver<NotificationCommand>) {
    while let Some(command) = receiver.recv().await {
        match command {
            NotificationCommand::RequestPermission { app, reply } => {
                let result = request_system_notification_permission(&app).await;
                let _reply_result = reply.send(result);
            }
            NotificationCommand::Deliver { app, payload, reply } => {
                let result = deliver_system_notification(&app, &payload).await;
                let _reply_result = reply.send(result);
            }
        }
    }
}

fn start_notification_worker() -> NotificationWorker {
    let (sender, receiver) = mpsc::channel(16);
    let task = tauri::async_runtime::spawn(run_notification_worker(receiver));
    NotificationWorker { sender: Mutex::new(Some(sender)), task }
}

const DEFAULT_SYSTEM_NOTIFICATION_SETTING: bool = false;
static SYSTEM_NOTIFICATION_SETTING: AtomicBool = AtomicBool::new(DEFAULT_SYSTEM_NOTIFICATION_SETTING);

async fn read_system_notification_setting() -> Result<bool, &'static str> {
    Ok(SYSTEM_NOTIFICATION_SETTING.load(Ordering::SeqCst))
}

#[tauri::command]
async fn get_system_notification_setting() -> Result<bool, &'static str> {
    Ok(read_system_notification_setting().await.unwrap_or(DEFAULT_SYSTEM_NOTIFICATION_SETTING))
}

async fn persist_system_notification_setting(enabled: bool) -> Result<(), &'static str> {
    SYSTEM_NOTIFICATION_SETTING.store(enabled, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
async fn set_system_notification_enabled(
    app: tauri::AppHandle,
    worker: State<'_, NotificationWorker>,
    enabled: bool,
) -> Result<bool, &'static str> {
    if enabled {
        let (reply_tx, reply_rx) = oneshot::channel();
        let sender = worker.sender()?;
        sender.send(NotificationCommand::RequestPermission {
            app: app.clone(),
            reply: reply_tx,
        }).await.map_err(|_| "notification-worker-closed")?;
        reply_rx.await.map_err(|_| "notification-worker-closed")??;
    }
    persist_system_notification_setting(enabled).await?;
    get_system_notification_setting().await
}

async fn enqueue_system_notification(
    app: tauri::AppHandle,
    worker: State<'_, NotificationWorker>,
    payload: NotificationPayload,
) -> Result<(), &'static str> {
    let (reply_tx, reply_rx) = oneshot::channel();
    let sender = worker.sender()?;
    sender.send(NotificationCommand::Deliver { app, payload, reply: reply_tx })
        .await.map_err(|_| "notification-worker-closed")?;
    reply_rx.await.map_err(|_| "notification-worker-closed")??;
    Ok(())
}

#[cfg(target_os = "macos")]
const MACOS_NOTIFICATION_SETTINGS_URL_PREFIX: &str =
    "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=";

#[cfg(target_os = "macos")]
#[derive(Clone, Copy, PartialEq, Eq)]
enum MacosNotificationAuthorizationStatus { NotDetermined, Denied, Restricted, Authorized, Provisional, Ephemeral }

#[cfg(target_os = "macos")]
async fn get_macos_notification_authorization_status() -> Result<MacosNotificationAuthorizationStatus, &'static str> {
    let settings = mac_usernotifications::get_notification_settings().await.map_err(|_| "permission-status-unavailable")?;
    Ok(match settings.authorization_status {
        mac_usernotifications::AuthorizationStatus::NotDetermined => MacosNotificationAuthorizationStatus::NotDetermined,
        mac_usernotifications::AuthorizationStatus::Denied => MacosNotificationAuthorizationStatus::Denied,
        mac_usernotifications::AuthorizationStatus::Authorized => MacosNotificationAuthorizationStatus::Authorized,
        mac_usernotifications::AuthorizationStatus::Provisional => MacosNotificationAuthorizationStatus::Provisional,
        mac_usernotifications::AuthorizationStatus::Ephemeral => MacosNotificationAuthorizationStatus::Ephemeral,
        mac_usernotifications::AuthorizationStatus::Unknown => MacosNotificationAuthorizationStatus::Restricted,
    })
}

#[cfg(target_os = "macos")]
async fn open_macos_notification_settings(app: &tauri::AppHandle) -> Result<(), &'static str> {
    let bundle_identifier = app.config().identifier.clone();
    let settings_url = format!("{MACOS_NOTIFICATION_SETTINGS_URL_PREFIX}{bundle_identifier}");
    let status = tauri::async_runtime::spawn_blocking(move || std::process::Command::new("/usr/bin/open").arg(settings_url).status())
        .await.map_err(|_| "notification-settings-open-failed")?.map_err(|_| "notification-settings-open-failed")?;
    if status.success() { Ok(()) } else { Err("notification-settings-open-failed") }
}

#[cfg(target_os = "macos")]
async fn request_system_notification_permission(app: &tauri::AppHandle) -> Result<(), &'static str> {
    let mut authorization = get_macos_notification_authorization_status().await?;
    if matches!(authorization, MacosNotificationAuthorizationStatus::NotDetermined) {
        let _requested = mac_usernotifications::request_auth().await.map_err(|_| "permission-request-failed")?;
        authorization = get_macos_notification_authorization_status().await?;
    }
    match authorization {
        MacosNotificationAuthorizationStatus::Authorized | MacosNotificationAuthorizationStatus::Provisional |
        MacosNotificationAuthorizationStatus::Ephemeral => Ok(()),
        MacosNotificationAuthorizationStatus::Denied | MacosNotificationAuthorizationStatus::Restricted => {
            open_macos_notification_settings(app).await?;
            Err(if matches!(authorization, MacosNotificationAuthorizationStatus::Denied) { "permission-denied-settings-opened" } else { "permission-restricted-settings-opened" })
        }
        MacosNotificationAuthorizationStatus::NotDetermined => { open_macos_notification_settings(app).await?; Err("permission-not-granted-settings-opened") }
    }
}

#[cfg(target_os = "macos")]
async fn deliver_system_notification(app: &tauri::AppHandle, payload: &NotificationPayload) -> Result<(), &'static str> {
    let _ = app;
    mac_usernotifications::Notification::new().title(payload.title.as_str()).message(payload.body.as_str())
        .default_sound().send().await.map(|_| ()).map_err(|_| "delivery-failed")
}

#[cfg(not(target_os = "macos"))]
async fn request_system_notification_permission(app: &tauri::AppHandle) -> Result<(), &'static str> {
    let permission = app.notification().request_permission().map_err(|_| "permission-request-failed")?;
    if permission.is_granted() { Ok(()) } else { Err("permission-denied") }
}

#[cfg(not(target_os = "macos"))]
async fn deliver_system_notification(app: &tauri::AppHandle, payload: &NotificationPayload) -> Result<(), &'static str> {
    app.notification().builder().title(payload.title.clone()).body(payload.body.clone())
        .show().map_err(|_| "delivery-failed")
}
`;

/** 让不同全局快捷键夹具变体都管理同一个通知 worker。 */
export function withManagedNotificationWorker(sourceText) {
  const registration = "        .manage(start_notification_worker())";
  const marker = "        .invoke_handler(";
  let managed = sourceText;
  if (!managed.includes(registration)) {
    if (!managed.includes(marker)) throw new Error("GUI fixture 缺少 invoke_handler，无法管理通知 worker");
    managed = managed.replace(marker, `${registration}\n${marker}`);
  }
  if (managed.includes("app.state::<NotificationWorker>().shutdown();")) return managed;
  const exitGate = "if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {";
  if (managed.includes("app.run(|_app, _event| {});")) {
    return managed.replace(
      "app.run(|_app, _event| {});",
      `app.run(|app, event| {\n        ${exitGate}\n            app.state::<NotificationWorker>().shutdown();\n        }\n    });`,
    );
  }
  if (!managed.includes(exitGate)) throw new Error("GUI fixture 缺少 ExitRequested/Exit 生命周期门禁");
  return managed.replace(exitGate, `${exitGate}\n            app.state::<NotificationWorker>().shutdown();`);
}
