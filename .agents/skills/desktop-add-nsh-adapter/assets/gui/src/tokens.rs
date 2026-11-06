//! 所有展示尺寸集中定义，页面只消费语义 Token。
/// 详细侧栏宽度。
pub const SIDEBAR: f32 = 224.0;
/// 窄侧栏保持双语名称可见并允许换行。
pub const SIDEBAR_COMPACT: f32 = 112.0;
/// 页面标题字号。
pub const TITLE: f32 = 24.0;
/// 窄屏转为顶部导航，内容保留完整宽度。
pub const NARROW: f32 = 640.0;
/// 赞助档位展示宽度，窄屏改为完整内容宽度。
pub const SPONSOR_CARD: f32 = 280.0;
/// 档位图片和支付材料保持统一展示尺寸。
pub const MEDIA: f32 = 180.0;

/// 为真实语义按钮建立共享外观与交互反馈。
pub fn button_style(style: nsh_core::element::StyleRefinement) -> nsh_core::element::StyleRefinement {
    use nsh_core::prelude::*;
    style.px_4().py_2().rounded_lg()
        .bg(nsh_base::theme().secondary)
        .text_color(nsh_base::theme().secondary_foreground)
}

/// 鼠标停留反馈由实际语义控件装配。
pub fn hover_style(style: nsh_core::element::StyleRefinement) -> nsh_core::element::StyleRefinement {
    use nsh_core::prelude::*;
    style.opacity(0.85)
}

/// 按压反馈由实际语义控件装配。
pub fn active_style(style: nsh_core::element::StyleRefinement) -> nsh_core::element::StyleRefinement {
    use nsh_core::prelude::*;
    style.opacity(0.65)
}
