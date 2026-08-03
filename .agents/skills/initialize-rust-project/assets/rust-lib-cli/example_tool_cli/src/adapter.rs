use std::{io::Write, process::ExitCode};

use clap::{Args, Parser, Subcommand};
use example_tool_core::scaffold_status;
use serde::Serialize;

/// 定义中性 CLI 的全局输出模式与唯一顶层命令。
#[derive(Parser)]
#[command(name = "example_tool_cli", version, about, long_about = None)]
struct Cli {
    /// 要求把调用结果渲染为稳定、可机器读取的 JSON 信封。
    #[arg(long, global = true)]
    json: bool,

    /// 选择当前获准执行的中性结构命令。
    #[command(subcommand)]
    command: Command,
}

/// 限定产品定义完成前只能进入脚手架状态命令组。
#[derive(Subcommand)]
enum Command {
    /// 查询中性工程骨架状态，不执行任何业务操作。
    Scaffold(ScaffoldArgs),
}

/// 定义脚手架命令组内必须显式选择的操作。
#[derive(Args)]
struct ScaffoldArgs {
    /// 选择一个只读脚手架操作。
    #[command(subcommand)]
    command: ScaffoldCommand,
}

/// 定义产品尚未获批时唯一允许的只读操作。
#[derive(Subcommand)]
enum ScaffoldCommand {
    /// 报告 workspace 已初始化且仍需产品定义。
    Status,
}

/// 表示 CLI JSON 模式的统一顶层信封，确保成功与失败具有稳定形状。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Envelope<T> {
    /// 标识本次命令是否完成预期结构查询。
    ok: bool,
    /// 成功时承载中性状态，失败时必须为空。
    data: Option<T>,
    /// 失败时承载稳定错误，成功时必须为空。
    error: Option<ErrorBody>,
    /// 承载便于 Agent 校验的协议元数据。
    meta: Meta,
}

/// 表示中性脚手架状态在 CLI 协议中的序列化形状。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusData {
    /// 标识核心库与 CLI 工作区已完成初始化。
    initialized: bool,
    /// 标识仍需在当前项目中定义产品目的与核心输入输出。
    product_definition_required: bool,
}

/// 表示 CLI 参数错误的稳定机器接口形状。
#[derive(Serialize)]
struct ErrorBody {
    /// 供 Agent 分支处理的稳定机器错误码。
    code: &'static str,
    /// 供人类诊断的错误说明，不作为机器分支依据。
    message: String,
}

/// 表示每次 JSON 响应都必须携带的协议版本与调用上下文。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Meta {
    /// 当前 JSON 信封的模式版本。
    schema_version: &'static str,
    /// 标识产生该结果的稳定中性命令。
    command: &'static str,
    /// 记录响应生成时刻的 UTC 时间戳。
    timestamp: String,
}

/// 执行中性 CLI 适配器的完整调用流程并返回稳定进程状态。
///
/// 该函数在产品定义前只接受 `scaffold status`，参数解析失败时仍为显式 JSON 请求提供机器
/// 信封。除写入标准输出或标准错误外，不读取文件、网络、凭据或外部进程。
pub async fn run() -> ExitCode {
    let wants_json = std::env::args_os().any(|argument| argument == "--json");
    let cli = match Cli::try_parse() {
        Ok(cli) => cli,
        Err(error) if wants_json && error.use_stderr() => {
            return write_json::<StatusData>(
                Envelope {
                    ok: false,
                    data: None,
                    error: Some(ErrorBody {
                        code: "INVALID_ARGUMENT",
                        message: error.to_string(),
                    }),
                    meta: metadata(),
                },
                2,
            );
        }
        Err(error) => {
            let exit_code = error.exit_code();
            let _ = error.print();
            return ExitCode::from(u8::try_from(exit_code).unwrap_or(70));
        }
    };

    match cli.command {
        Command::Scaffold(ScaffoldArgs {
            command: ScaffoldCommand::Status,
        }) => {
            let status = scaffold_status().await;
            if cli.json {
                write_json(
                    Envelope {
                        ok: true,
                        data: Some(StatusData {
                            initialized: status.initialized,
                            product_definition_required: status.product_definition_required,
                        }),
                        error: None,
                        meta: metadata(),
                    },
                    0,
                )
            } else {
                println!("项目脚手架已初始化；仍需定义产品。");
                ExitCode::SUCCESS
            }
        }
    }
}

/// 为一次 JSON 响应生成稳定的协议元数据，不读取或修改业务状态。
fn metadata() -> Meta {
    Meta {
        schema_version: "1",
        command: "scaffold.status",
        timestamp: jiff::Timestamp::now().to_string(),
    }
}

/// 把一个完整 JSON 信封原子地写入锁定的标准输出，并映射目标退出码。
///
/// 序列化或写入失败时不会继续输出不完整结果，而是向标准错误报告并返回内部错误退出码 70。
fn write_json<T: Serialize>(envelope: Envelope<T>, exit_code: u8) -> ExitCode {
    let stdout = std::io::stdout();
    let mut output = stdout.lock();
    if serde_json::to_writer(&mut output, &envelope).is_err() || writeln!(output).is_err() {
        eprintln!("写入 JSON 结果失败");
        return ExitCode::from(70);
    }

    ExitCode::from(exit_code)
}
