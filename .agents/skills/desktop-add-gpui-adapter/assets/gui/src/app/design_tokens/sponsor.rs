//! 赞助页只在启用时生成的原生展示 Token；不定义业务价格、权益或支付行为。

/// 三列权益布局需要的最小内容宽度。
pub(in crate::app) const TIERS_BREAKPOINT: f32 = 1000.;
/// 收款区左右分栏需要的最小内容宽度。
pub(in crate::app) const PAYMENT_BREAKPOINT: f32 = 924.;
/// 本地背景图叠加在语义背景上的强度。
pub(in crate::app) const BACKDROP_OPACITY: f32 = 0.16;
/// 支持页主标题字号。
pub(in crate::app) const TITLE_SIZE: f32 = 20.;
/// 权益档位名称字号。
pub(in crate::app) const TIER_TITLE_SIZE: f32 = 18.;
/// 较长价格数字使用的字号。
pub(in crate::app) const LONG_PRICE_SIZE: f32 = 26.;
/// 常规价格数字使用的字号。
pub(in crate::app) const PRICE_SIZE: f32 = 32.;
/// 档位插图展示尺寸。
pub(in crate::app) const ILLUSTRATION_SIZE: f32 = 64.;
/// 扫码媒体的展示宽度，保持原比例。
pub(in crate::app) const QR_WIDTH: f32 = 120.;
/// 扫码媒体的展示高度，保持原比例。
pub(in crate::app) const QR_HEIGHT: f32 = 136.;
/// 扫码媒体必须使用白底，不随应用暗色主题改变。
pub(in crate::app) const QR_BACKGROUND: u32 = 0xFFFFFF;

/// 能力说明图标尺寸。
pub(in crate::app) const CAPABILITY_ICON_SIZE: f32 = 20.;
/// 价格与插图一行的最小高度。
pub(in crate::app) const SUMMARY_HEIGHT: f32 = 72.;
/// 权益完成状态徽章尺寸。
pub(in crate::app) const BENEFIT_BADGE_SIZE: f32 = 20.;
/// 完成状态徽章内图标尺寸。
pub(in crate::app) const BENEFIT_ICON_SIZE: f32 = 12.;
/// 徽章与首行文字的光学对齐偏移。
pub(in crate::app) const BENEFIT_ICON_OFFSET: f32 = 2.;
/// 收款说明方向图标尺寸。
pub(in crate::app) const PAYMENT_ARROW_SIZE: f32 = 24.;
/// 档位标题排版行高。
pub(in crate::app) const TIER_TITLE_LINE_HEIGHT: f32 = 1.25;
/// 价格数字排版行高。
pub(in crate::app) const PRICE_LINE_HEIGHT: f32 = 1.1;
