use assert_cmd::Command;

/// 返回指向真实编译产物的命令，避免每个用例重复拼装二进制名。
fn cmd() -> Command {
    Command::cargo_bin("example_tool_cli").unwrap()
}

/// 校验 stdout 只包含一个无 BOM、以换行结尾且可解析的 JSON 文档。
fn parse_single_json_document(output: &[u8]) -> serde_json::Value {
    assert!(!output.starts_with(&[0xEF, 0xBB, 0xBF]));
    assert_eq!(output.last(), Some(&b'\n'));
    std::str::from_utf8(output).unwrap();
    serde_json::from_slice(output).unwrap()
}

/// 校验每个机器响应都携带稳定模式定义、中性逻辑命令和 UTC 时间戳。
fn assert_metadata(value: &serde_json::Value) {
    assert_eq!(value["meta"]["schemaVersion"], "1");
    assert_eq!(value["meta"]["command"], "scaffold.status");
    let timestamp = value["meta"]["timestamp"].as_str().unwrap();
    assert!(timestamp.contains('T'));
    assert!(timestamp.ends_with('Z'));
}

/// 验证真实二进制明确报告结构已初始化且仍需定义产品。
#[test]
fn reports_neutral_scaffold_status_as_json() {
    let output = cmd()
        .args(["scaffold", "status", "--json"])
        .output()
        .unwrap();

    assert!(output.status.success());
    assert!(output.stderr.is_empty());
    let value = parse_single_json_document(&output.stdout);
    assert_eq!(value["ok"].as_bool(), Some(true));
    assert_eq!(value["data"]["initialized"].as_bool(), Some(true));
    assert_eq!(
        value["data"]["productDefinitionRequired"].as_bool(),
        Some(true)
    );
    assert_eq!(value["error"], serde_json::Value::Null);
    assert_metadata(&value);
}

/// 验证未获批准的业务命令不会被中性脚手架误当作可执行产品能力。
#[test]
fn rejects_unapproved_business_commands() {
    let output = cmd().args(["run", "--json"]).output().unwrap();

    assert_eq!(output.status.code(), Some(2));
    assert!(output.stderr.is_empty());
    let value = parse_single_json_document(&output.stdout);
    assert_eq!(value["ok"].as_bool(), Some(false));
    assert_eq!(value["data"], serde_json::Value::Null);
    assert_eq!(value["error"]["code"], "INVALID_ARGUMENT");
    assert_metadata(&value);
}

/// 验证缺少 `status` 子命令时，显式 JSON 请求仍得到机器信封而不是 clap 文本。
#[test]
fn reports_missing_status_subcommand_as_json() {
    let output = cmd().args(["scaffold", "--json"]).output().unwrap();

    assert_eq!(output.status.code(), Some(2));
    assert!(output.stderr.is_empty());
    let value = parse_single_json_document(&output.stdout);
    assert_eq!(value["ok"].as_bool(), Some(false));
    assert_eq!(value["data"], serde_json::Value::Null);
    assert_eq!(value["error"]["code"], "INVALID_ARGUMENT");
    assert_metadata(&value);
}

/// 验证真实二进制从 workspace 版本事实来源暴露预期版本。
#[test]
fn reports_the_workspace_version() {
    let output = cmd().arg("--version").output().unwrap();

    assert!(output.status.success());
    assert_eq!(
        String::from_utf8(output.stdout).unwrap(),
        "example_tool_cli v0.1.0\n"
    );
}

/// 验证人类模式只输出中性生命周期提示，不伪装成业务结果。
#[test]
fn reports_human_scaffold_status() {
    let output = cmd().args(["scaffold", "status"]).output().unwrap();

    assert!(output.status.success());
    assert!(output.stderr.is_empty());
    assert_eq!(
        String::from_utf8(output.stdout).unwrap(),
        "项目脚手架已初始化；仍需定义产品。\n"
    );
}

/// 验证真实二进制提供只读帮助入口，并保持成功状态与干净 stderr。
#[test]
fn exposes_a_read_only_help_entrypoint() {
    let output = cmd().arg("--help").output().unwrap();

    assert!(output.status.success());
    assert!(output.stderr.is_empty());
    assert!(String::from_utf8(output.stdout).unwrap().contains("Usage:"));
}
