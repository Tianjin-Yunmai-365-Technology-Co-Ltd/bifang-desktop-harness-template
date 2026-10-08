//! 原生 GPUI 入口；前台只处理窗口与展示，偏好文件由独立后台工作线程读写。

#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

rust_i18n::i18n!("locales", fallback = "en-US");

mod app;
mod assets;
mod preferences;

use gpui_kit::{App, Bounds, QuitMode, TitlebarOptions, WindowBounds, WindowOptions, prelude::*, px, size};

/// 同步主线程持有原生事件循环，结束后等待偏好工作线程完成最后一次写入。
fn main() {
    let (preferences, writer) = preferences::load();
    let writer_end = writer.clone();
    gpui_kit::application().with_assets(assets::Assets).run(move |cx: &mut App| {
        use gpui_kit::component as gpui_component;
        rust_i18n::extend!(gpui_component);
        gpui_kit::init(cx);
        cx.set_quit_mode(QuitMode::Explicit);
        cx.on_window_closed(|cx, _| {
            if cx.windows().is_empty() {
                cx.quit();
            }
        }).detach();
        let fallback = Bounds::centered(None, size(px(1440.), px(900.)), cx);
        let bounds = preferences.window_bounds(cx).unwrap_or(WindowBounds::Windowed(fallback));
        gpui_kit::open_window(WindowOptions {
            window_bounds: Some(bounds),
            window_min_size: Some(size(px(960.), px(640.))),
            titlebar: Some(TitlebarOptions { title: Some("@@NAME_EN@@".into()), ..Default::default() }),
            app_id: Some("app-@@KEBAB_ID@@".into()),
            ..Default::default()
        }, cx, |window, cx| cx.new(|cx| app::Shell::new(preferences, writer, window, cx)))
        .expect("无法创建 GPUI 窗口");
        cx.activate(true);
    });
    writer_end.finish();
}
