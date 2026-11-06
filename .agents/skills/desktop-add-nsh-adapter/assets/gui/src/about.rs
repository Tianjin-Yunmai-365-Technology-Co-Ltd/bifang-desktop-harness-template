//! 条件关于页与构建时嵌入的双语发布说明。
use nsh_core::prelude::*;
/// 展示本地支持信息，不发起网络请求。
pub fn page(chinese: bool) -> impl IntoElement {
    view().gap_4()
        .child(text(if chinese { "关于" } else { "About" }).text_size(px(super::tokens::TITLE)))
        .child(text(concat!("v",env!("CARGO_PKG_VERSION"))))
        .child(text(if chinese { __CONTENT_ZH__ } else { __CONTENT_EN__ }))
        .child(text(if chinese {
            option_env!("HARNESS_RELEASE_NOTES_ZH").unwrap_or("暂无已发布的更新日志")
        } else {
            option_env!("HARNESS_RELEASE_NOTES_EN").unwrap_or("No published release notes")
        }))
}
