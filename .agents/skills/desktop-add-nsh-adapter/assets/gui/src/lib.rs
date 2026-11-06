//! NSH 中性壳层；业务规则由直接依赖的共享 core 提供。
mod tokens;
mod translations;
__OPTIONAL_MODULES__

// NSH 运行时与语义控件。
use nsh_core::prelude::*;
use nsh_core::storage::Storage;
use nsh_base::{button, theme};
use translations::tr;

/// 注册当前适配器的根组件与已选择资源。
#[native_module("__PROJECT_ID__/native")]
fn native(registry: &mut Registry) {
    registry.register::<App>();
    registry.assets(assets!());
}

/// 当前工程身份；不包含业务操作。
const NAME_ZH: &str = __NAME_ZH__;
/// 英文工程身份。
const NAME_EN: &str = __NAME_EN__;

/// 根组件拥有进程内页面状态，偏好独立存储。
#[component]
pub fn App() -> impl IntoElement {
    let page = signal(0_u8);
    let language = signal(Storage::get_item("interface-language").unwrap_or_else(|| {
        if locale().as_str().starts_with("zh") { "zh" } else { "en" }.to_owned()
    }));
    let appearance = signal(Storage::get_item("appearance").unwrap_or_else(|| "system".to_owned()));
    let collapsed = signal(Storage::get_item("sidebar-collapsed").as_deref() == Some("true"));
    let error = signal(false);
    effect(move || set_color_scheme(match appearance.get().as_str() {
        "light" => Appearance::Light, "dark" => Appearance::Dark, _ => Appearance::System,
    }));
    effect(move || {
        nsh_core::element::desktop::set_title(format!("{} v{} | QQ 2222980", if language.get() == "zh" { NAME_ZH } else { NAME_EN }, env!("CARGO_PKG_VERSION")));
    });
    let chinese = move || language.get() == "zh";
    view().flex_1().p_safe_area().bg(move || theme().background)
        .text_color(move || theme().foreground)
        .child(view().flex_1().flex_row().style_when(move || window().width < px(tokens::NARROW), |s| s.flex_col())
            .child(view().w(move || if window().width < px(tokens::NARROW) { window().width } else { px(if __COMPACT__ || collapsed.get() { tokens::SIDEBAR_COMPACT } else { tokens::SIDEBAR }) })
                .p_4().gap_4().style_when(move || window().width < px(tokens::NARROW), |s| s.flex_row().flex_wrap()).bg(move || theme().muted)
                __LOGO__
                .child(text(move || if __COMPACT__ || collapsed.get() { "NSH" } else if chinese() { NAME_ZH } else { NAME_EN }).text_size(px(tokens::TITLE)))
                .child(when(move || !__COMPACT__ && !collapsed.get(), || text(concat!("v", env!("CARGO_PKG_VERSION")))))
                .child(button().style_with(tokens::button_style).hover(tokens::hover_style).active(tokens::active_style).on_press(move || page.set(0)).child(text(move || tr(chinese(), "home"))))
                .child(when(move || window().width >= px(tokens::NARROW), || view().flex_1()))
                __SPONSOR_MENU__
                .child(button().style_with(tokens::button_style).hover(tokens::hover_style).active(tokens::active_style).on_press(move || page.set(1)).child(text(move || tr(chinese(), "settings"))))
                __ABOUT_MENU__
                .child(when(move || !__COMPACT__ && window().width >= px(tokens::NARROW), move || button().style_with(tokens::button_style).hover(tokens::hover_style).active(tokens::active_style).accessibility_label(move || Some(tr(chinese(), if collapsed.get() { "expand" } else { "collapse" }).into())).on_press(move || {
                    let next = !collapsed.get();
                    if Storage::set_item("sidebar-collapsed", if next { "true" } else { "false" }).is_ok() { collapsed.set(next); } else { error.set(true); }
                }).child(text(move || tr(chinese(), if collapsed.get() { "expand_short" } else { "collapse" }))))))
            .child(scroll().flex_1().child(view().p_6().gap_4()
                .child(when(move || page.get() == 0, move || view().gap_4()
                    .child(text(move || if chinese() { NAME_ZH } else { NAME_EN }).text_size(px(tokens::TITLE)))
                    .child(text(move || tr(chinese(), "neutral")))))
                .child(when(move || page.get() == 1, move || view().gap_4()
                    .child(text(move || tr(chinese(), "settings")).text_size(px(tokens::TITLE)))
                    .child(text(move || tr(chinese(), "language")))
                    .child(button().style_with(tokens::button_style).hover(tokens::hover_style).active(tokens::active_style).on_press(move || {
                        if Storage::set_item("interface-language", "zh").is_ok() { language.set("zh".to_owned()); } else { error.set(true); }
                    }).child(text("中文")))
                    .child(button().style_with(tokens::button_style).hover(tokens::hover_style).active(tokens::active_style).on_press(move || {
                        if Storage::set_item("interface-language", "en").is_ok() { language.set("en".to_owned()); } else { error.set(true); }
                    }).child(text("English")))
                    .child(text(move || tr(chinese(), "appearance")))
                    .children([("system", "system"), ("light", "light"), ("dark", "dark")].into_iter().map(move |(value, key)| {
                        button().style_with(tokens::button_style).hover(tokens::hover_style).active(tokens::active_style).on_press(move || {
                            if Storage::set_item("appearance", value).is_ok() { appearance.set(value.to_owned()); } else { error.set(true); }
                        }).child(text(move || tr(chinese(), key)))
                    }))))
                __ABOUT_PAGE__
                __SPONSOR_PAGE__
                .child(when(move || error.get(), move || text(move || tr(chinese(), "storage_error")))))))
}

#[cfg(test)]
mod tests {
    /// 未知语言回退英文，不混入中文标签。
    #[test]
    fn translations_have_english_fallback() {
        assert_eq!(super::tr(false, "settings"), "Settings");
        assert_eq!(super::tr(true, "settings"), "设置");
    }
}
