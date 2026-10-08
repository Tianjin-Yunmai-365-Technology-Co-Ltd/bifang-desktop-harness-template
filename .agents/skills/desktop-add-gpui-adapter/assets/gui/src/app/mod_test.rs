//! 使用 Kit 真实布局树验证侧栏和内容坐标，偏好写入只在内存中发生。

use super::*;
use gpui_kit::{AnyWindowHandle, AppContext, Bounds, Entity, TestAppContext, WindowBounds, WindowOptions, point, size, test::TestWindowExt};

/// 测试退出时回收偏好工作线程，不读取或写入真实用户目录。
pub(super) struct FinishWriter(crate::preferences::Writer);

impl Drop for FinishWriter {
    /// 测试失败或正常结束都等待当前测试拥有的内存队列收尾。
    fn drop(&mut self) { self.0.finish(); }
}

/// 通过生产窗口入口建立固定大小、固定语言和隔离内存偏好的壳层。
pub(super) fn open_shell(cx: &mut TestAppContext, width: f32, height: f32) -> (AnyWindowHandle, Entity<Shell>, FinishWriter) {
    cx.update(gpui_kit::init);
    let (_, writer) = crate::preferences::load_from(None);
    let finish = FinishWriter(writer.clone());
    let preferences = Preferences { language: LanguageChoice::English, theme: ThemeChoice::Light, ..Preferences::default() };
    let (handle, shell) = cx.update(|cx| {
        gpui_kit::open_window(WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(Bounds::new(point(px(0.), px(0.)), size(px(width), px(height))))),
            ..Default::default()
        }, cx, |window, cx| cx.new(|cx| Shell::new(preferences, writer, window, cx))).expect("创建真实布局测试窗口")
    });
    (handle, shell, finish)
}

/// 原生标题栏高度不能进入下一次创建的内容尺寸，装饰变化同样不会累计。
#[test]
fn saved_window_size_uses_content_viewport_without_native_decorations() {
    let first = window_geometry(Bounds::new(point(px(36.), px(58.)), size(px(1440.), px(933.))), size(px(1440.), px(900.)));
    assert_eq!(first, [36., 58., 1440., 900.]);
    let next = window_geometry(Bounds::new(point(px(first[0]), px(first[1])), size(px(first[2]), px(first[3] + 41.))), size(px(first[2]), px(first[3])));
    assert_eq!(next, first);
}

/// 详细菜单内容真实左对齐；折叠按钮在身份区内，折叠后侧栏和内容使用同一宽度。
#[gpui_kit::test]
fn sidebar_alignment_and_toggle_share_the_fixed_shell_bounds(cx: &mut TestAppContext) {
    let (handle, shell, _finish) = open_shell(cx, 1440., 900.);
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        let sidebar = window.find("sidebar").bounds();
        let main = window.find("main-content").bounds();
        assert_eq!(sidebar.size.width, px(if @@COMPACT@@ { 80. } else { 248. }));
        assert_eq!(main.origin.x, sidebar.right());
        assert_eq!(main.origin.y, sidebar.origin.y);
        assert_eq!(main.right(), px(1440.));
        if @@COMPACT@@ {
            assert!(window.try_find("sidebar-toggle").is_none());
        } else {
            let icon = window.find(("nav-settings", 1usize)).bounds();
            let row = window.find(("nav-settings", 0usize)).bounds();
            assert_eq!(icon.origin.x, row.origin.x, "详细菜单图标不能被 Kit 内层默认居中");
            assert!(icon.origin.x < sidebar.origin.x + px(32.));
            let identity = window.find("sidebar-identity").bounds();
            let toggle = window.find("sidebar-toggle").bounds();
            assert!(toggle.origin.y >= identity.origin.y && toggle.bottom() <= identity.bottom());
            assert!(toggle.origin.x >= identity.origin.x && toggle.right() <= identity.right());
            window.click("sidebar-toggle", cx);
            window.render_frame(cx);
            assert!(shell.read(cx).preferences.collapsed);
            let sidebar = window.find("sidebar").bounds();
            assert_eq!(sidebar.size.width, px(76.));
            assert_eq!(window.find("main-content").bounds().origin.x, sidebar.right());
            assert!(window.try_find(("nav-settings", 2usize)).is_none());
            let icon = window.find(("nav-settings", 1usize)).bounds();
            assert!((icon.center().x - sidebar.center().x).abs() <= px(1.));
        }
    }).expect("更新真实布局测试窗口");
}
