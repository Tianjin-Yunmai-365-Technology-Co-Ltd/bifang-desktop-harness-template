//! 条件关于页与构建时嵌入的双语发布说明。
use nsh_core::prelude::*;
use nsh_base::button;
/// 展示本地支持信息，不发起网络请求。
pub fn page(chinese: bool) -> impl IntoElement {
    let notes_open = signal(false);
    view().gap_4()
        .child(text(if chinese { "关于" } else { "About" }).text_size(px(super::tokens::TITLE)))
        .child(text(concat!("v",env!("CARGO_PKG_VERSION"))))
        .child(text(if chinese { __CONTENT_ZH__ } else { __CONTENT_EN__ }))
        .child(button()
            .style_with(super::tokens::button_style)
            .hover(super::tokens::hover_style)
            .active(super::tokens::active_style)
            .on_press(move || notes_open.set(!notes_open.get()))
            .child(text(if chinese { "更新日志" } else { "Release notes" })))
        .child(when(move || notes_open.get(), move || {
            text(if chinese {
                include_str!(concat!(env!("OUT_DIR"), "/harness_release_notes_zh.txt"))
            } else {
                include_str!(concat!(env!("OUT_DIR"), "/harness_release_notes_en.txt"))
            })
        }))
}
