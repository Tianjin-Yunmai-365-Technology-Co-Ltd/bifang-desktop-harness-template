"""保存跨平台候选 workflow 的受审常量与稳定步骤集合。"""

CHECKOUT_USE = "actions/checkout@11d5960a326750d5838078e36cf38b85af677262"
UPLOAD_USE = "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02"
EXPECTED_WORKFLOW_SHA256 = (
    "f1d6d182599a199c1d1977a43aed66ee1384443430225bac32d947c2f45fbe46"
)
EXPECTED_INPUTS = {
    "confirm_candidate_build",
    "source_commit",
    "branch_chain_state_sha256",
    "version",
    "e2e_selection",
}
EXPECTED_NAMED_STEPS = (
    "确认已授权候选预检",
    "选择 Python 运行时",
    "验证已检出源码",
    "从 closing commit 捕获发布信封",
    "读取项目最低 Rust 版本",
    "选择项目 MSRV",
    "验证候选版本",
    "验证发布更新日志",
    "准备 Unix 发布目录",
    "准备 Windows 发布目录",
    "验证候选",
    "尝试 Unix 签名",
    "尝试 Windows 签名",
    "打包 Unix 候选",
    "打包 Windows 候选",
    "解析候选制品",
    "记录候选清单",
    "提交候选制品集合",
)
EXPECTED_ACTION_STEPS = (CHECKOUT_USE, UPLOAD_USE)
