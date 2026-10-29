//! 原生窗口的启动与语言刷新共用同一身份、版本和固定品牌联系人。

/// 当前界面语言选择已确认的双语展示名，未知语言回退英文。
pub fn application_name(locale: &str) -> &'static str {
    if locale == "zh-CN" { "@@NAME_ZH@@" } else { "@@NAME_EN@@" }
}

/// 展示边界去掉旧前缀并只添加一个小写 v。
pub fn display_version(version: &str) -> String {
    format!("v{}", version.trim().trim_start_matches(['v', 'V']))
}

/// 标题固定按应用名称、展示版本、受管 QQ 联系人顺序生成。
pub fn format_window_title(application_name: &str, version: &str) -> String {
    format!("{} {} @@CONTACT_CHANNEL@@:@@CONTACT_VALUE@@", application_name.trim(), display_version(version))
}

/// 原生窗口始终读取当前语言名称和实际 Cargo 包版本。
pub fn window_title(locale: &str) -> String {
    format_window_title(application_name(locale), env!("CARGO_PKG_VERSION"))
}

#[cfg(test)]
#[path = "window_title_test.rs"]
mod tests;
