//! 将已验证的候选发布说明从临时文件嵌入 GUI，避免环境变量长度限制。
use std::{env, fs, path::PathBuf};

fn main() {
    const ZH_KEY: &str = "HARNESS_RELEASE_NOTES_ZH_PATH";
    const EN_KEY: &str = "HARNESS_RELEASE_NOTES_EN_PATH";
    println!("cargo:rerun-if-env-changed={ZH_KEY}");
    println!("cargo:rerun-if-env-changed={EN_KEY}");

    let out = PathBuf::from(env::var_os("OUT_DIR").expect("Cargo must set OUT_DIR"));
    let zh = env::var_os(ZH_KEY);
    let en = env::var_os(EN_KEY);
    match (zh, en) {
        (Some(zh), Some(en)) => {
            fs::copy(zh, out.join("harness_release_notes_zh.txt"))
                .expect("cannot embed Chinese release notes");
            fs::copy(en, out.join("harness_release_notes_en.txt"))
                .expect("cannot embed English release notes");
        }
        (None, None) => {
            fs::write(out.join("harness_release_notes_zh.txt"), "暂无已发布的更新日志")
                .expect("cannot write Chinese release notes placeholder");
            fs::write(out.join("harness_release_notes_en.txt"), "No published release notes")
                .expect("cannot write English release notes placeholder");
        }
        _ => panic!("both release notes paths must be set together"),
    }
}
