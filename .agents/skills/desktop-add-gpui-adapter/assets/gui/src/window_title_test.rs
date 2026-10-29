use super::{application_name, display_version, format_window_title, window_title};

/// 完整输出断言同时约束字段、顺序、空格和固定联系人。
#[test]
fn title_contains_name_version_and_qq_in_order() {
    assert_eq!(format_window_title(" Example Utility ", "3.4.5"), "Example Utility v3.4.5 QQ:2222980");
    assert_eq!(format_window_title("示例工具", "3.4.5"), "示例工具 v3.4.5 QQ:2222980");
}

/// 原始版本或已有多重大小写前缀都只能产生一个小写 v。
#[test]
fn title_normalizes_version_prefix_once() {
    for version in ["3.4.5", "v3.4.5", "Vv3.4.5", " vv3.4.5 "] {
        assert_eq!(format_window_title("Example Utility", version), "Example Utility v3.4.5 QQ:2222980", "input {version:?}");
    }
}

/// 启动与语言刷新使用相同权威版本，未知语言使用英文名称。
#[test]
fn localized_title_uses_the_current_cargo_version() {
    for locale in ["zh-CN", "en-US", "unknown"] {
        assert_eq!(window_title(locale), format!("{} {} QQ:2222980", application_name(locale), display_version(env!("CARGO_PKG_VERSION"))));
    }
    assert_eq!(application_name("zh-CN"), "@@NAME_ZH@@");
    assert_eq!(application_name("en-US"), "@@NAME_EN@@");
    assert_eq!(application_name("unknown"), "@@NAME_EN@@");
}
