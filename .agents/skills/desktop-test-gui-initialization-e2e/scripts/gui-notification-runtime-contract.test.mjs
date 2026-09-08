import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { withFixture } from "./verify-gui-lifecycle-contract.fixture.mjs";
import { verifyGuiLifecycleContract } from "./verify-gui-lifecycle-contract.mjs";

function mutateLifecycle(guiRoot, mutate) {
  const source = path.join(guiRoot, "src-tauri", "src", "lifecycle.rs");
  const original = fs.readFileSync(source, "utf8");
  const changed = mutate(original);
  assert.notEqual(changed, original, "test mutation must change the lifecycle fixture");
  fs.writeFileSync(source, changed);
}

test("rejects a dead macOS permission state machine beside a real entry that returns Ok", () => {
  withFixture(({ root, guiRoot }) => {
    mutateLifecycle(guiRoot, (source) => source.replace(
      '#[cfg(target_os = "macos")]\nasync fn request_system_notification_permission(app: &tauri::AppHandle) -> Result<(), &\'static str> {',
      '#[cfg(target_os = "macos")]\nasync fn request_system_notification_permission(app: &tauri::AppHandle) -> Result<(), &\'static str> {\n    let _ = app;\n    Ok(())\n}\n\n#[cfg(target_os = "macos")]\nasync fn unused_notification_permission_state_machine(app: &tauri::AppHandle) -> Result<(), &\'static str> {',
    ));
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /macOS 通知权限函数必须且只能调用一次 mac_usernotifications::request_auth/u,
    );
  });
});

test("rejects a setting command that directly calls the permission helper around the worker", () => {
  withFixture(({ root, guiRoot }) => {
    mutateLifecycle(guiRoot, (source) => source.replace(
      `        let (reply_tx, reply_rx) = oneshot::channel();
        let sender = worker.sender()?;
        sender.send(NotificationCommand::RequestPermission {
            app: app.clone(),
            reply: reply_tx,
        }).await.map_err(|_| "notification-worker-closed")?;
        reply_rx.await.map_err(|_| "notification-worker-closed")??;`,
      "        request_system_notification_permission(&app).await?;",
    ));
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /必须通过 NotificationWorker\.sender 等待权限回执后再持久化，不得直接调用 permission helper/u,
    );
  });
});

test("rejects a delivery entry that directly calls the platform helper around the worker", () => {
  withFixture(({ root, guiRoot }) => {
    mutateLifecycle(guiRoot, (source) => source.replace(
      `    let (reply_tx, reply_rx) = oneshot::channel();
    let sender = worker.sender()?;
    sender.send(NotificationCommand::Deliver { app, payload, reply: reply_tx })
        .await.map_err(|_| "notification-worker-closed")?;
    reply_rx.await.map_err(|_| "notification-worker-closed")??;
    Ok(())`,
      "    deliver_system_notification(&app, &payload).await",
    ));
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /投递入口不得绕过同一 NotificationWorker\.sender 直接调用平台 delivery helper/u,
    );
  });
});

test("rejects a notification worker that receives only one command instead of looping", () => {
  withFixture(({ root, guiRoot }) => {
    mutateLifecycle(guiRoot, (source) => source.replace(
      "while let Some(command) = receiver.recv().await {",
      "if let Some(command) = receiver.recv().await {",
    ));
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /唯一 receiver 循环必须串行分派/u,
    );
  });
});

test("rejects zero-capacity and unbounded notification channels", () => {
  for (const replacement of ["mpsc::channel(0)", "mpsc::unbounded_channel()"]) {
    withFixture(({ root, guiRoot }) => {
      mutateLifecycle(guiRoot, (source) => source.replace("mpsc::channel(16)", replacement));
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /唯一 start_notification_worker 及其有界 mpsc 通道/u,
      );
    });
  }
});

test("rejects each missing notification worker shutdown lifecycle path", () => {
  const cases = [
    (source) => source.replace("impl Drop for NotificationWorker {", "impl NotificationWorker {"),
    (source) => source.replace("tauri::RunEvent::ExitRequested { .. } | ", ""),
    (source) => source.replace(" | tauri::RunEvent::Exit", ""),
  ];
  for (const mutate of cases) {
    withFixture(({ root, guiRoot }) => {
      mutateLifecycle(guiRoot, mutate);
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /ExitRequested、Exit 与 Drop 路径关闭 sender/u,
      );
    });
  }
});

test("rejects macOS denied restricted and still-undetermined branches that open settings then return Ok", () => {
  const cases = [
    (source) => source.replace(
      'Err(if matches!(authorization, MacosNotificationAuthorizationStatus::Denied) { "permission-denied-settings-opened" } else { "permission-restricted-settings-opened" })',
      "Ok(())",
    ),
    (source) => source.replace(
      'Err("permission-not-granted-settings-opened")',
      "Ok(())",
    ),
  ];
  for (const mutate of cases) {
    withFixture(({ root, guiRoot }) => {
      mutateLifecycle(guiRoot, mutate);
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /打开设置.*必须返回稳定.*Err/u,
      );
    });
  }
});

test("rejects a hard-coded notification settings URL hidden behind dead contract tokens", () => {
  withFixture(({ root, guiRoot }) => {
    mutateLifecycle(guiRoot, (source) => source.replace(
      '    let settings_url = format!("{MACOS_NOTIFICATION_SETTINGS_URL_PREFIX}{bundle_identifier}");',
      '    // let settings_url = format!("{MACOS_NOTIFICATION_SETTINGS_URL_PREFIX}{bundle_identifier}");\n    let settings_url = "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=com.example.other".to_string();',
    ));
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /必须由当前 app identifier 构造固定 URL/u,
    );
  });
});

test("rejects a changed macOS settings prefix even when a comment preserves the fixed token", () => {
  for (const replacement of [
    "https://example.invalid/notifications?id=",
    "x-apple.systempreferences:com.apple.preference.security?id=",
  ]) {
    withFixture(({ root, guiRoot }) => {
      mutateLifecycle(guiRoot, (source) => source.replace(
        '    "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=";',
        `    "${replacement}";\n// x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=`,
      ));
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /设置前缀必须在 macOS cfg 下唯一且精确定义/u,
      );
    });
  }
});

test("rejects a Denied status mapped to Authorized behind a correct mapping comment", () => {
  withFixture(({ root, guiRoot }) => {
    mutateLifecycle(guiRoot, (source) => source.replace(
      "        mac_usernotifications::AuthorizationStatus::Denied => MacosNotificationAuthorizationStatus::Denied,",
      "        // mac_usernotifications::AuthorizationStatus::Denied => MacosNotificationAuthorizationStatus::Denied,\n        mac_usernotifications::AuthorizationStatus::Denied => MacosNotificationAuthorizationStatus::Authorized,",
    ));
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /六个 crate AuthorizationStatus 精确映射/u,
    );
  });
});

test("rejects returning the requested notification value instead of the reread persisted state", () => {
  withFixture(({ root, guiRoot }) => {
    mutateLifecycle(guiRoot, (source) => source.replace(
      "    get_system_notification_setting().await\n}",
      "    Ok(enabled)\n}",
    ));
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /从同一 get command 返回最终权威状态/u,
    );
  });
});

test("rejects a notification setting default that is not substantively false", () => {
  for (const mutate of [
    (source) => source.replace(
      "const DEFAULT_SYSTEM_NOTIFICATION_SETTING: bool = false;",
      "const DEFAULT_SYSTEM_NOTIFICATION_SETTING: bool = true;",
    ),
    (source) => source.replace(
      ".await.unwrap_or(DEFAULT_SYSTEM_NOTIFICATION_SETTING)",
      ".await.unwrap_or(true)",
    ),
  ]) {
    withFixture(({ root, guiRoot }) => {
      mutateLifecycle(guiRoot, mutate);
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /实质回退为默认 false/u,
      );
    });
  }
});

test("rejects RequestPermission moved outside the enabled branch", () => {
  withFixture(({ root, guiRoot }) => {
    mutateLifecycle(guiRoot, (source) => source.replace(
      `    if enabled {
        let (reply_tx, reply_rx) = oneshot::channel();
        let sender = worker.sender()?;
        sender.send(NotificationCommand::RequestPermission {
            app: app.clone(),
            reply: reply_tx,
        }).await.map_err(|_| "notification-worker-closed")?;
        reply_rx.await.map_err(|_| "notification-worker-closed")??;
    }`,
      `    if enabled {}
    let (reply_tx, reply_rx) = oneshot::channel();
    let sender = worker.sender()?;
    sender.send(NotificationCommand::RequestPermission {
        app: app.clone(),
        reply: reply_tx,
    }).await.map_err(|_| "notification-worker-closed")?;
    reply_rx.await.map_err(|_| "notification-worker-closed")??;`,
    ));
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /RequestPermission 必须且只能位于 if enabled 分支/u,
    );
  });
});

test("rejects an unconditional settings jump after the enabled branch", () => {
  withFixture(({ root, guiRoot }) => {
    mutateLifecycle(guiRoot, (source) => source.replace(
      `    }
    persist_system_notification_setting(enabled).await?;`,
      `    }
    open_macos_notification_settings(&app).await?;
    persist_system_notification_setting(enabled).await?;`,
    ));
    assert.match(
      verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
      /关闭设置不得请求权限或跳转系统设置/u,
    );
  });
});

test("rejects swallowed permission send outer-reply and inner worker errors", () => {
  const cases = [
    (source) => source.replace(
      '        }).await.map_err(|_| "notification-worker-closed")?;',
      '        }).await.map_err(|_| "notification-worker-closed").ok();',
    ),
    (source) => source.replace(
      '        reply_rx.await.map_err(|_| "notification-worker-closed")??;',
      '        reply_rx.await.unwrap_or(Ok(()))?;',
    ),
    (source) => source.replace(
      '        reply_rx.await.map_err(|_| "notification-worker-closed")??;',
      '        let _worker_result = reply_rx.await.map_err(|_| "notification-worker-closed")?;',
    ),
  ];
  for (const mutate of cases) {
    withFixture(({ root, guiRoot }) => {
      mutateLifecycle(guiRoot, mutate);
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /设置命令必须传播 mpsc send 失败、oneshot 接收失败与 worker 返回的内层错误/u,
      );
    });
  }
});

test("rejects swallowed delivery send outer-reply and inner worker errors", () => {
  const cases = [
    (source) => source.replace(
      `    sender.send(NotificationCommand::Deliver { app, payload, reply: reply_tx })
        .await.map_err(|_| "notification-worker-closed")?;
    reply_rx.await.map_err(|_| "notification-worker-closed")??;
    Ok(())`,
      `    sender.send(NotificationCommand::Deliver { app, payload, reply: reply_tx })
        .await.map_err(|_| "notification-worker-closed").ok();
    reply_rx.await.map_err(|_| "notification-worker-closed")??;
    Ok(())`,
    ),
    (source) => source.replace(
      `    sender.send(NotificationCommand::Deliver { app, payload, reply: reply_tx })
        .await.map_err(|_| "notification-worker-closed")?;
    reply_rx.await.map_err(|_| "notification-worker-closed")??;
    Ok(())`,
      `    sender.send(NotificationCommand::Deliver { app, payload, reply: reply_tx })
        .await.map_err(|_| "notification-worker-closed")?;
    reply_rx.await.unwrap_or(Ok(()))?;
    Ok(())`,
    ),
    (source) => source.replace(
      `    sender.send(NotificationCommand::Deliver { app, payload, reply: reply_tx })
        .await.map_err(|_| "notification-worker-closed")?;
    reply_rx.await.map_err(|_| "notification-worker-closed")??;
    Ok(())`,
      `    sender.send(NotificationCommand::Deliver { app, payload, reply: reply_tx })
        .await.map_err(|_| "notification-worker-closed")?;
    let _worker_result = reply_rx.await.map_err(|_| "notification-worker-closed")?;
    Ok(())`,
    ),
  ];
  for (const mutate of cases) {
    withFixture(({ root, guiRoot }) => {
      mutateLifecycle(guiRoot, mutate);
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /投递入口必须传播 mpsc send 失败、oneshot 接收失败与 worker 返回的内层错误/u,
      );
    });
  }
});

test("rejects a worker that replaces platform helper errors before replying", () => {
  const cases = [
    (source) => source.replace(
      `                let result = request_system_notification_permission(&app).await;
                let _reply_result = reply.send(result);`,
      `                let result = request_system_notification_permission(&app).await;
                let _reply_result = reply.send(Ok(()));`,
    ),
    (source) => source.replace(
      `                let result = deliver_system_notification(&app, &payload).await;
                let _reply_result = reply.send(result);`,
      `                let result = deliver_system_notification(&app, &payload).await;
                let _reply_result = reply.send(Ok(()));`,
    ),
  ];
  for (const mutate of cases) {
    withFixture(({ root, guiRoot }) => {
      mutateLifecycle(guiRoot, mutate);
      assert.match(
        verifyGuiLifecycleContract(root, "sample_gui").join("\n"),
        /通过各自 oneshot 返回平台 helper 结果/u,
      );
    });
  }
});
