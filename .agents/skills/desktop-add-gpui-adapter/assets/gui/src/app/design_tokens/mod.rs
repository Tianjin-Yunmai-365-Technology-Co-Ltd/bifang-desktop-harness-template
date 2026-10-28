//! 当前 UI 基座在原生展示层的唯一尺寸来源；页面只消费 Token 和 Kit 语义主题。

@@SPONSOR_DESIGN_MODULE@@

/// 精简侧栏的可用内容内边距，遵循 4px 节奏。
pub(super) const SIDEBAR_INSET: f32 = 8.;
/// 详细身份区顶部留白，以当前窗口 rem 单位换算。
pub(super) const SIDEBAR_LOGO_TOP: f32 = 1.75;
/// 精简模式的侧栏宽度。
pub(super) const COMPACT_WIDTH: f32 = 80.;
/// 详细模式收起后的侧栏宽度。
pub(super) const COLLAPSED_WIDTH: f32 = 76.;
/// 详细模式展开后的侧栏宽度。
pub(super) const EXPANDED_WIDTH: f32 = 248.;
/// 精简身份图的展示尺寸。
pub(super) const COMPACT_LOGO: f32 = 36.;
/// 收起身份图的展示尺寸。
pub(super) const COLLAPSED_LOGO: f32 = 44.;
/// 展开身份图的展示尺寸。
pub(super) const IDENTITY_LOGO_LARGE: f32 = 72.;
/// 两种导航模式共用的菜单图标尺寸。
pub(super) const NAV_ICON: f32 = 24.;
/// 精简模式持续可见名称的字号。
pub(super) const NAV_LABEL: f32 = 12.;
/// 精简菜单的最小交互高度。
pub(super) const COMPACT_ITEM_HEIGHT: f32 = 56.;
/// 详细菜单的最小交互高度。
pub(super) const DETAILED_ITEM_HEIGHT: f32 = 44.;
/// 通用卡片圆角，设置与支持页共用。
pub(super) const SURFACE_RADIUS: f32 = 16.;

/// 通用页面标题栏高度。
pub(super) const PAGE_HEADING_HEIGHT: f32 = 88.;
/// 页面与应用身份大标题字号。
pub(super) const PAGE_TITLE_SIZE: f32 = 26.;
/// 偏好选项按钮的最小宽度。
pub(super) const CHOICE_MIN_WIDTH: f32 = 124.;
/// 偏好选项按钮的统一高度。
pub(super) const CHOICE_HEIGHT: f32 = 40.;

/// 边界折叠按钮尺寸，两个定位偏移由其一半派生。
pub(super) const SIDEBAR_TOGGLE_SIZE: f32 = 24.;
