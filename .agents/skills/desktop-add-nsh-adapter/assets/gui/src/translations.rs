//! 中性壳层翻译，界面不散落语言分支。
/// 按已解析语言返回中英文标签，未知键原样显示以暴露缺失。
pub fn tr(chinese: bool, key: &'static str) -> &'static str {
    match (chinese, key) {
        (true, "home") => "首页", (_, "home") => "Home",
        (true, "settings") => "设置", (_, "settings") => "Settings",
        (true, "language") => "界面语言", (_, "language") => "Language",
        (true, "appearance") => "外观主题", (_, "appearance") => "Appearance",
        (true, "system") => "跟随系统", (_, "system") => "System",
        (true, "light") => "浅色", (_, "light") => "Light",
        (true, "dark") => "深色", (_, "dark") => "Dark",
        (true, "about") => "关于", (_, "about") => "About",
        (true, "sponsor") => "赞助", (_, "sponsor") => "Sponsor",
        (true, "collapse") => "收起侧栏", (_, "collapse") => "Collapse sidebar",
        (true, "expand") => "展开侧栏", (_, "expand") => "Expand sidebar",
        (true, "expand_short") => "展开", (_, "expand_short") => "Expand",
        (true, "neutral") => "中性工程已初始化，请在下游定义产品。", (_, "neutral") => "Neutral workspace initialized. Define the product in this downstream project.",
        (true, "storage_error") => "无法保存设置，请重试。", (_, "storage_error") => "Unable to save settings. Please retry.",
        _ => key,
    }
}
