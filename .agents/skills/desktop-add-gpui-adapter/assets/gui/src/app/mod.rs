//! 原生壳层只拥有导航、外观和设备偏好；领域状态始终从直接依赖的共享核心读取。

mod settings;
@@ABOUT_MODULE@@
@@SPONSOR_MODULE@@

use crate::{assets, preferences::{LanguageChoice, Preferences, ThemeChoice, Writer}};
use gpui_kit::{AnyElement, Context, FontWeight, IntoElement, Render, Subscription, Window, WindowAppearance, assets::IconName, component::{ActiveTheme, Theme, ThemeMode, button::{Button, ButtonVariants}}, div, img, prelude::*, px};

/// 页面枚举只包含本次初始化实际启用的页面。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Page {
    Settings,
@@ABOUT_VARIANT@@
@@SPONSOR_VARIANT@@
}

/// 所有壳层可变视图状态由唯一 GPUI 实体拥有，不镜像业务数据。
pub struct Shell {
    page: Page,
    preferences: Preferences,
    writer: Writer,
    locale: &'static str,
    _appearance: Subscription,
    _bounds: Subscription,
@@ABOUT_FIELDS@@
}

impl Shell {
    /// 建立真实系统外观观察和最后窗口关闭时的状态保存。
    pub fn new(preferences: Preferences, writer: Writer, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let weak = cx.entity().downgrade();
        let appearance_entity = weak.clone();
        let appearance = window.observe_window_appearance(move |window, cx| {
            let _ = appearance_entity.update(cx, |this, cx| {
                if this.preferences.theme == ThemeChoice::System {
                    this.apply_theme(window, cx);
                    cx.notify();
                }
            });
        });
        window.on_window_should_close(cx, move |window, cx| {
            let _ = weak.update(cx, |this, _| {
                this.remember_window(window);
                this.writer.save(&this.preferences);
            });
            true
        });
        let bounds_subscription = cx.observe_window_bounds(window, |this, window, _| { this.remember_window(window); });
        let locale = preferences.locale();
        let mut value = Self { page: Page::Settings, preferences, writer, locale, _appearance: appearance, _bounds: bounds_subscription,
@@ABOUT_DEFAULTS@@
        };
        value.remember_window(window);
        value.apply_language();
        value.apply_theme(window, cx);
        value
    }

    /// GPUI 新建窗口需要内容尺寸，原生 frame 只提供位置，避免标题栏每次恢复叠加。
    fn remember_window(&mut self, window: &Window) {
        if window.is_fullscreen() { return }
        self.preferences.maximized = window.is_maximized();
        if !self.preferences.maximized {
            self.preferences.bounds = Some(window_geometry(window.bounds(), window.viewport_size()));
        }
    }

    /// 当前 locale 决定中英文展示名称，版本始终来自实际 Cargo 包。
    fn name(&self) -> &'static str {
        if self.locale == "zh-CN" { "@@NAME_ZH@@" } else { "@@NAME_EN@@" }
    }

    /// 所有可见文案均从编译期本地词典解析。
    fn t(&self, key: &str) -> String {
        rust_i18n::t!(key, locale = self.locale).to_string()
    }

    /// 固定版本显示只允许一个小写前缀。
    fn version(&self) -> String {
        format!("v{}", env!("CARGO_PKG_VERSION").trim_start_matches(['v', 'V']))
    }

    /// 系统选择绑定真实原生外观，显式选择直接覆盖当前 Kit 主题。
    fn apply_theme(&self, window: &Window, cx: &mut Context<Self>) {
        let dark = match self.preferences.theme {
            ThemeChoice::Dark => true,
            ThemeChoice::Light => false,
            ThemeChoice::System => matches!(window.appearance(), WindowAppearance::Dark | WindowAppearance::VibrantDark),
        };
        Theme::change(if dark { ThemeMode::Dark } else { ThemeMode::Light }, None, cx);
    }

    /// 组件库词典与应用词典使用相同的有效语言。
    fn apply_language(&self) {
        gpui_kit::component::set_locale(if self.locale == "zh-CN" { "zh-CN" } else { "en" });
    }

    /// 主题按钮只修改设备偏好，并立即应用当前窗口外观。
    fn select_theme(&mut self, theme: ThemeChoice, window: &Window, cx: &mut Context<Self>) {
        self.preferences.theme = theme;
        self.apply_theme(window, cx);
        self.writer.save(&self.preferences);
        cx.notify();
    }

    /// 语言切换同步应用和组件词典，同时保留当前页面。
    fn select_language(&mut self, language: LanguageChoice, cx: &mut Context<Self>) {
        self.preferences.language = language;
        self.locale = self.preferences.locale();
        self.apply_language();
        self.writer.save(&self.preferences);
        cx.refresh_windows();
        cx.notify();
    }

    /// 页面切换不创建新的数据副本或重置设备偏好。
    fn navigate(&mut self, page: Page, cx: &mut Context<Self>) {
        self.page = page;
        cx.notify();
    }

    /// 页面标题来自当前实际页面对应的词典键。
    fn page_title(&self) -> String {
        self.t(match self.page {
            Page::Settings => "navigation.settings",
@@ABOUT_TITLE@@
@@SPONSOR_TITLE@@
        })
    }

    /// compact 永远显示名称；detailed 按自身持久偏好展示或收起。
    fn sidebar_width(&self) -> f32 {
        if @@COMPACT@@ { 80. } else if self.preferences.collapsed { 76. } else { 248. }
    }

    /// 具有真实按钮语义的整个菜单项直接拥有点击，不借助父级代理。
    fn navigation_item(&self, page: Page, id: &'static str, key: &str, icon: IconName, cx: &mut Context<Self>) -> AnyElement {
        let label = self.t(key);
        let compact = @@COMPACT@@;
        let collapsed = !compact && self.preferences.collapsed;
        if compact {
            Button::new(id).ghost().h(px(56.)).w_full()
                .tooltip(label.clone()).accessibility_label(label.clone())
                .child(div().flex().flex_col().items_center().gap_1()
                    .child(gpui_kit::component::Icon::new(icon).size(px(22.)))
                    .child(div().text_size(px(11.)).child(label)))
                .when(self.page == page, |button| button.primary())
                .on_click(cx.listener(move |this, _, _, cx| this.navigate(page, cx)))
                .into_any_element()
        } else {
            Button::new(id).ghost().icon(gpui_kit::component::Icon::new(icon).size(px(22.))).h(px(44.)).w_full()
                .tooltip(label.clone()).accessibility_label(label.clone())
                .when(!collapsed, |button| button.label(label))
                .when(self.page == page, |button| button.primary())
                .on_click(cx.listener(move |this, _, _, cx| this.navigate(page, cx)))
                .into_any_element()
        }
    }

    /// 功能区向下增长，支持区保持已选赞助、设置、已选关于的稳定顺序。
    fn sidebar(&self, cx: &mut Context<Self>) -> AnyElement {
        let width = self.sidebar_width();
        let logo_size = if @@COMPACT@@ { 36. } else if self.preferences.collapsed { 44. } else { 72. };
        let mut sidebar = div().w(px(width)).h_full().flex_shrink_0().flex().flex_col()
            .p(px(6.)).gap_2().border_r_1().border_color(cx.theme().border).bg(cx.theme().secondary)
            .child(div().w_full().flex_shrink_0().flex().flex_col().items_center().justify_center().gap_2().py_3()
                .child(img(assets::LOGO).size(px(logo_size)))
                .child(div().text_xs().text_color(cx.theme().muted_foreground).child(self.version()))
                .when(!@@COMPACT@@ && !self.preferences.collapsed, |header| header.child(div().w_full().min_w_0().whitespace_normal().text_center().text_sm().font_weight(FontWeight::SEMIBOLD).child(self.name()))));
@@COLLAPSE_CONTROL@@
        sidebar = sidebar.child(div().flex_1());
@@SPONSOR_NAV@@
        sidebar = sidebar.child(self.navigation_item(Page::Settings, "nav-settings", "navigation.settings", IconName::Settings, cx));
@@ABOUT_NAV@@
        sidebar.into_any_element()
    }
}

impl Render for Shell {
    /// 原生窗口标题与视图元数据由同一身份和当前语言派生。
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        window.set_window_title(&format!("{} {}@@CONTACT_TITLE@@", self.name(), self.version()));
@@CORE_PROBE@@
        let content = match self.page {
            Page::Settings => self.settings_page(cx),
@@ABOUT_RENDER@@
@@SPONSOR_RENDER@@
        };
        div().size_full().flex().bg(cx.theme().background).text_color(cx.theme().foreground)
            .child(self.sidebar(cx))
            .child(div().flex_1().min_w_0().h_full().flex().flex_col()
                .child(div().h(px(88.)).flex_shrink_0().px_8().flex().items_center().border_b_1().border_color(cx.theme().border)
                    .child(div().text_size(px(26.)).font_weight(FontWeight::BOLD).child(self.page_title())))
                .child(div().id("page-content").flex_1().min_h_0().overflow_y_scroll().p_8().child(content)))
    }
}


/// 保留原生窗口左上角，尺寸统一采用内容视口而不是含装饰的外框。
fn window_geometry(frame: gpui_kit::Bounds<gpui_kit::Pixels>, viewport: gpui_kit::Size<gpui_kit::Pixels>) -> [f32; 4] {
    [frame.origin.x.into(), frame.origin.y.into(), viewport.width.into(), viewport.height.into()]
}

#[cfg(test)]
mod tests {
    use super::window_geometry;
    use gpui_kit::{Bounds, point, px, size};

    /// 原生标题栏高度不能进入下一次创建的内容尺寸，装饰变化同样不会累计。
    #[test]
    fn saved_window_size_uses_content_viewport_without_native_decorations() {
        let first = window_geometry(Bounds::new(point(px(36.), px(58.)), size(px(1440.), px(933.))), size(px(1440.), px(900.)));
        assert_eq!(first, [36., 58., 1440., 900.]);
        let next = window_geometry(Bounds::new(point(px(first[0]), px(first[1])), size(px(first[2]), px(first[3] + 41.))), size(px(first[2]), px(first[3])));
        assert_eq!(next, first);
    }
}
