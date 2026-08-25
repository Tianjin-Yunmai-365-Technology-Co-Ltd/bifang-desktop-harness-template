"""验证长文档分卷没有丢失历史证据、签署字段或方法论章节。"""

from __future__ import annotations

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]


def read_partition(root_file: str, directory: str) -> list[str]:
    """读取稳定根索引和按名称排序的全部分卷。"""

    return [
        (ROOT / root_file).read_text(encoding="utf-8"),
        *[
            path.read_text(encoding="utf-8")
            for path in sorted((ROOT / directory).glob("*.md"))
        ],
    ]


class DocumentPartitionTests(unittest.TestCase):
    """保护 Verification 历史与 Harness 方法论的事实守恒。"""

    def test_verification_partition_preserves_history_and_signatures(self) -> None:
        """证据分卷必须保留标题、签署字段和既有失败事实。"""

        texts = read_partition("docs/VERIFICATION.md", "docs/verification")
        self.assertGreaterEqual(sum(text.count("\n## ") for text in texts), 26)
        self.assertGreaterEqual(sum(text.count("\n### ") for text in texts), 68)
        self.assertGreaterEqual(sum(text.count("复核人：") for text in texts), 4)
        self.assertGreaterEqual(sum(text.count("审批边界：") for text in texts), 3)
        combined = "\n".join(texts)
        for fragment in (
            "因缺少第三方 YAML 解析模块",
            "沙箱拒绝写入",
            "首次错误调用",
            "首次发布冒烟错误使用相对",
            "首次负向冒烟包装脚本错误",
        ):
            self.assertIn(fragment, combined)

    def test_methodology_partition_preserves_numbered_sections(self) -> None:
        """方法论根索引和主题卷必须保留原章节集合。"""

        texts = read_partition(
            "docs/HARNESS_ENGINEERING.md",
            "docs/harness_engineering",
        )
        self.assertEqual(sum(text.count("\n## ") for text in texts), 19)
        self.assertEqual(sum(text.count("\n### ") for text in texts), 28)
        combined = "\n".join(texts)
        self.assertIn("## 2. 什么是个人小工具 Harness 工程", combined)
        self.assertIn("## 15. Agent-first 小工具设计", combined)
        self.assertIn("## 18. 参考资料", combined)


if __name__ == "__main__":
    unittest.main()
