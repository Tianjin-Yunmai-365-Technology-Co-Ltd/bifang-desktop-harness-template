#!/usr/bin/env python3
"""校验 GUI Release no-bundle 探针的原生性能观测并生成绑定证据。"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import statistics
import sys
import tempfile
from typing import Any

THRESHOLDS = {
    "coldStartRuns": 5,
    "coldStartMedianMsMaximum": 2000.0,
    "coldStartMaximumMs": 3000.0,
    "interactionSamplesMinimum": 20,
    "interactionP95MsMaximum": 100.0,
    "interactionSingleMsExclusiveMaximum": 200.0,
    "longTaskMsMinimum": 50.0,
    "longTaskMsExclusiveMaximum": 200.0,
    "cpuObservationSecondsMinimum": 30.0,
    "cpuSamplesMinimum": 5,
    "idleCpuP95PercentMaximum": 5.0,
    "hiddenTrayCpuP95PercentMaximum": 2.0,
    "steadyRssMiBMaximum": 300.0,
    "peakRssMiBMaximum": 500.0,
    "rssGrowthPercentMaximum": 15.0,
    "rssGrowthMiBMinimumAllowance": 32.0,
    "navigationInteractionCyclesMinimum": 20,
}

SOURCE_COMMIT_PATTERN = re.compile(r"^[0-9a-f]{40}$")
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


class PerformanceEvidenceError(RuntimeError):
    """表示输入文件或证据输出边界不安全。"""


def _is_finite_number(value: object) -> bool:
    """只接受有限且不是布尔值的整数或浮点数。"""
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(float(value))
    )


def _read_json_object(path: Path, label: str) -> dict[str, Any]:
    """从普通非符号链接文件读取一个 JSON 对象。"""
    if not path.exists() or not path.is_file() or path.is_symlink():
        raise PerformanceEvidenceError(f"{label} must be a regular non-symlink file: {path}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise PerformanceEvidenceError(f"cannot read {label}: {exc}") from exc
    if not isinstance(value, dict):
        raise PerformanceEvidenceError(f"{label} root must be a JSON object")
    return value


def _sha256(path: Path) -> str:
    """流式计算普通候选文件的 SHA-256。"""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _number(
    document: dict[str, Any],
    key: str,
    errors: list[str],
    *,
    minimum: float = 0.0,
    integer: bool = False,
) -> float | int | None:
    """提取满足非负下界的数值字段并累积结构错误。"""
    value = document.get(key)
    if not _is_finite_number(value):
        errors.append(f"{key} must be a finite number")
        return None
    numeric = float(value)
    if numeric < minimum:
        errors.append(f"{key} must be >= {minimum:g}")
    if integer and numeric != int(numeric):
        errors.append(f"{key} must be an integer")
        return None
    return int(numeric) if integer else numeric


def _number_list(
    document: dict[str, Any],
    key: str,
    errors: list[str],
    *,
    minimum_items: int = 0,
    exact_items: int | None = None,
) -> list[float]:
    """提取有限非负数值列表并校验样本数量。"""
    raw = document.get(key)
    if not isinstance(raw, list):
        errors.append(f"{key} must be an array")
        return []
    values: list[float] = []
    for index, value in enumerate(raw):
        if not _is_finite_number(value) or float(value) < 0:
            errors.append(f"{key}[{index}] must be a finite non-negative number")
            continue
        values.append(float(value))
    if exact_items is not None and len(raw) != exact_items:
        errors.append(f"{key} must contain exactly {exact_items} samples")
    if len(raw) < minimum_items:
        errors.append(f"{key} must contain at least {minimum_items} samples")
    return values


def _nearest_rank_p95(values: list[float]) -> float | None:
    """按 nearest-rank 定义计算 p95。"""
    if not values:
        return None
    ordered = sorted(values)
    return ordered[math.ceil(0.95 * len(ordered)) - 1]


def _expect_equal(
    document: dict[str, Any],
    key: str,
    expected: object,
    errors: list[str],
    label: str,
) -> None:
    """要求证据字段与候选事实精确一致。"""
    if document.get(key) != expected:
        errors.append(f"{label}.{key} must equal {expected!r}")


def _probe_name(manifest: dict[str, Any], errors: list[str]) -> str:
    """从 GUI manifest 提取明确命名的 no-bundle 运行探针。"""
    name = manifest.get("performanceProbe")
    if not isinstance(name, str) or not name:
        errors.append("manifest.performanceProbe must name the runtime executable")
        return ""
    if Path(name).name != name:
        errors.append("manifest.performanceProbe must be a basename")
    return name


def _interaction_durations(
    evidence: dict[str, Any], errors: list[str]
) -> list[float]:
    """提取具有可观察结果的批准交互时延。"""
    raw = evidence.get("interactions")
    if not isinstance(raw, list):
        errors.append("interactions must be an array")
        return []
    if len(raw) < THRESHOLDS["interactionSamplesMinimum"]:
        errors.append(
            "interactions must contain at least "
            f"{THRESHOLDS['interactionSamplesMinimum']} samples"
        )
    durations: list[float] = []
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            errors.append(f"interactions[{index}] must be an object")
            continue
        name = item.get("name")
        if not isinstance(name, str) or not name.strip():
            errors.append(f"interactions[{index}].name must be non-empty")
        if item.get("observableResult") is not True:
            errors.append(f"interactions[{index}].observableResult must be true")
        duration = item.get("durationMs")
        if not _is_finite_number(duration) or float(duration) < 0:
            errors.append(
                f"interactions[{index}].durationMs must be a finite non-negative number"
            )
            continue
        durations.append(float(duration))
    return durations


def evaluate(
    probe: Path,
    manifest: dict[str, Any],
    evidence: dict[str, Any],
    tray_enabled: bool,
    initial_errors: list[str] | None = None,
) -> dict[str, Any]:
    """对探针绑定、采样完整性和全部固定阈值作一次确定性判定。"""
    errors = list(initial_errors or [])
    actual_sha = ""
    if not probe.exists() or not probe.is_file() or probe.is_symlink():
        errors.append("performance probe must be a regular non-symlink file")
    else:
        try:
            actual_sha = _sha256(probe)
        except OSError as exc:
            errors.append(f"cannot hash performance probe: {exc}")

    probe_name = _probe_name(manifest, errors)
    if probe_name and probe.name != probe_name:
        errors.append("probe basename does not match manifest.performanceProbe")

    if manifest.get("interface") != "gui":
        errors.append("manifest.interface must be 'gui'")
    if manifest.get("performanceProbeKind") != "tauri-no-bundle-executable":
        errors.append(
            "manifest.performanceProbeKind must be 'tauri-no-bundle-executable'"
        )
    if manifest.get("performanceProbeBuildProfile") != "release":
        errors.append("manifest.performanceProbeBuildProfile must be 'release'")
    if manifest.get("sourceTreeState") != "clean":
        errors.append("manifest.sourceTreeState must be 'clean'")
    source_commit = manifest.get("sourceCommit")
    if not isinstance(source_commit, str) or not SOURCE_COMMIT_PATTERN.fullmatch(
        source_commit
    ):
        errors.append("manifest.sourceCommit must be 40 lowercase hexadecimal characters")
        source_commit = ""
    manifest_sha = manifest.get("performanceProbeSha256")
    if not isinstance(manifest_sha, str) or not SHA256_PATTERN.fullmatch(manifest_sha):
        errors.append(
            "manifest.performanceProbeSha256 must be 64 lowercase hexadecimal characters"
        )
    elif actual_sha and manifest_sha != actual_sha:
        errors.append("manifest.performanceProbeSha256 does not match probe bytes")
    if manifest.get("buildMode") != "native":
        errors.append("only a native buildMode can pass GUI performance validation")

    platform = manifest.get("platform")
    if not isinstance(platform, str) or not platform.strip():
        errors.append("manifest.platform must be a non-empty string")
    architecture = manifest.get("architecture")
    if not isinstance(architecture, str) or not architecture.strip():
        errors.append("manifest.architecture must be a non-empty string")

    e2e_selection = manifest.get("e2eSelection")
    if e2e_selection not in {"enabled", "disabled"}:
        errors.append("manifest.e2eSelection must be enabled or disabled")

    _expect_equal(evidence, "schemaVersion", 1, errors, "evidence")
    _expect_equal(evidence, "performanceProbeSha256", actual_sha, errors, "evidence")
    _expect_equal(evidence, "sourceCommit", source_commit, errors, "evidence")
    _expect_equal(evidence, "sourceTreeState", "clean", errors, "evidence")
    _expect_equal(
        evidence, "platform", platform, errors, "evidence"
    )
    _expect_equal(
        evidence, "architecture", architecture, errors, "evidence"
    )
    _expect_equal(evidence, "buildMode", "native", errors, "evidence")
    _expect_equal(evidence, "buildProfile", "release", errors, "evidence")
    _expect_equal(
        evidence,
        "performanceProbeKind",
        "tauri-no-bundle-executable",
        errors,
        "evidence",
    )
    _expect_equal(evidence, "e2eSelection", e2e_selection, errors, "evidence")
    _expect_equal(evidence, "trayEnabled", tray_enabled, errors, "evidence")

    for key in (
        "observationAvailable",
        "wholeProcessTree",
        "probeBytesUnmodified",
        "allProcessesRecovered",
    ):
        if evidence.get(key) is not True:
            errors.append(f"evidence.{key} must be true")
    if evidence.get("rendererTimingSource") != "performance-observer":
        errors.append("rendererTimingSource must be 'performance-observer'")
    process_sampler = evidence.get("processSampler")
    if not isinstance(process_sampler, str) or not process_sampler.strip():
        errors.append("processSampler must be non-empty")

    warmup_runs = _number(
        evidence, "warmupRuns", errors, minimum=1, integer=True
    )
    cold_starts = _number_list(
        evidence,
        "coldStartVisibleUsableMs",
        errors,
        exact_items=int(THRESHOLDS["coldStartRuns"]),
    )
    cold_median = statistics.median(cold_starts) if cold_starts else None
    cold_max = max(cold_starts) if cold_starts else None
    if cold_median is not None and cold_median > THRESHOLDS[
        "coldStartMedianMsMaximum"
    ]:
        errors.append("cold-start median exceeds 2000 ms")
    if cold_max is not None and cold_max > THRESHOLDS["coldStartMaximumMs"]:
        errors.append("cold-start maximum exceeds 3000 ms")

    interaction_durations = _interaction_durations(evidence, errors)
    interaction_p95 = _nearest_rank_p95(interaction_durations)
    interaction_max = max(interaction_durations) if interaction_durations else None
    if interaction_p95 is not None and interaction_p95 > THRESHOLDS[
        "interactionP95MsMaximum"
    ]:
        errors.append("interaction p95 exceeds 100 ms")
    if interaction_max is not None and interaction_max >= THRESHOLDS[
        "interactionSingleMsExclusiveMaximum"
    ]:
        errors.append("an interaction is 200 ms or slower")

    long_tasks = _number_list(evidence, "longTasksMs", errors)
    for index, duration in enumerate(long_tasks):
        if duration < THRESHOLDS["longTaskMsMinimum"]:
            errors.append(f"longTasksMs[{index}] is shorter than the 50 ms record floor")
    long_task_max = max(long_tasks) if long_tasks else 0.0
    if long_task_max >= THRESHOLDS["longTaskMsExclusiveMaximum"]:
        errors.append("a Long Task is 200 ms or slower")

    idle_seconds = _number(
        evidence,
        "idleObservationSeconds",
        errors,
        minimum=THRESHOLDS["cpuObservationSecondsMinimum"],
    )
    idle_cpu = _number_list(
        evidence,
        "idleCpuPercentOfOneLogicalCore",
        errors,
        minimum_items=int(THRESHOLDS["cpuSamplesMinimum"]),
    )
    idle_cpu_p95 = _nearest_rank_p95(idle_cpu)
    if idle_cpu_p95 is not None and idle_cpu_p95 > THRESHOLDS[
        "idleCpuP95PercentMaximum"
    ]:
        errors.append("idle whole-process-tree CPU p95 exceeds 5%")

    hidden_seconds: float | int | None = None
    hidden_cpu_p95: float | None = None
    if tray_enabled:
        hidden_seconds = _number(
            evidence,
            "hiddenTrayObservationSeconds",
            errors,
            minimum=THRESHOLDS["cpuObservationSecondsMinimum"],
        )
        hidden_cpu = _number_list(
            evidence,
            "hiddenTrayCpuPercentOfOneLogicalCore",
            errors,
            minimum_items=int(THRESHOLDS["cpuSamplesMinimum"]),
        )
        hidden_cpu_p95 = _nearest_rank_p95(hidden_cpu)
        if hidden_cpu_p95 is not None and hidden_cpu_p95 > THRESHOLDS[
            "hiddenTrayCpuP95PercentMaximum"
        ]:
            errors.append("hidden/tray whole-process-tree CPU p95 exceeds 2%")
    elif any(
        key in evidence
        for key in (
            "hiddenTrayObservationSeconds",
            "hiddenTrayCpuPercentOfOneLogicalCore",
        )
    ):
        errors.append("hidden/tray samples must be absent when tray is disabled")

    steady_rss = _number(evidence, "steadyRssMiB", errors)
    peak_rss = _number(evidence, "peakRssMiB", errors)
    rss_before = _number(evidence, "rssBeforeCyclesMiB", errors)
    rss_after = _number(evidence, "rssAfterCyclesMiB", errors)
    cycles = _number(
        evidence,
        "navigationInteractionCycles",
        errors,
        minimum=THRESHOLDS["navigationInteractionCyclesMinimum"],
        integer=True,
    )
    if steady_rss is not None and steady_rss > THRESHOLDS["steadyRssMiBMaximum"]:
        errors.append("steady whole-process-tree RSS exceeds 300 MiB")
    if peak_rss is not None and peak_rss > THRESHOLDS["peakRssMiBMaximum"]:
        errors.append("peak whole-process-tree RSS exceeds 500 MiB")

    rss_growth = None
    rss_growth_limit = None
    if rss_before is not None and rss_after is not None:
        rss_growth = rss_after - rss_before
        rss_growth_limit = max(
            rss_before * THRESHOLDS["rssGrowthPercentMaximum"] / 100.0,
            THRESHOLDS["rssGrowthMiBMinimumAllowance"],
        )
        if rss_growth > rss_growth_limit:
            errors.append("RSS growth after interaction cycles exceeds the allowed budget")

    metrics = {
        "warmupRuns": warmup_runs,
        "coldStartMedianMs": cold_median,
        "coldStartMaximumMs": cold_max,
        "interactionSamples": len(interaction_durations),
        "interactionP95Ms": interaction_p95,
        "interactionMaximumMs": interaction_max,
        "longTaskMaximumMs": long_task_max,
        "idleObservationSeconds": idle_seconds,
        "idleCpuP95PercentOfOneLogicalCore": idle_cpu_p95,
        "hiddenTrayObservationSeconds": hidden_seconds,
        "hiddenTrayCpuP95PercentOfOneLogicalCore": hidden_cpu_p95,
        "steadyRssMiB": steady_rss,
        "peakRssMiB": peak_rss,
        "navigationInteractionCycles": cycles,
        "rssGrowthMiB": rss_growth,
        "rssGrowthLimitMiB": rss_growth_limit,
    }
    return {
        "schemaVersion": 1,
        "kind": "gui-release-performance",
        "status": "passed" if not errors else "failed",
        "probe": {
            "file": probe.name,
            "sha256": actual_sha,
            "sourceCommit": source_commit,
            "sourceTreeState": manifest.get("sourceTreeState"),
            "kind": manifest.get("performanceProbeKind"),
            "platform": platform,
            "architecture": architecture,
            "buildMode": manifest.get("buildMode"),
            "buildProfile": evidence.get("buildProfile"),
            "e2eSelection": e2e_selection,
        },
        "thresholdProfile": "gui-release-v1",
        "thresholds": THRESHOLDS,
        "metrics": metrics,
        "observations": evidence,
        "failures": errors,
    }


def _write_json_atomic(path: Path, payload: dict[str, Any], protected: list[Path]) -> None:
    """在既有普通目录内原子写证据，且不覆盖任何输入。"""
    parent = path.parent
    if not parent.exists() or not parent.is_dir() or parent.is_symlink():
        raise PerformanceEvidenceError("output parent must be a regular existing directory")
    if path.exists() and (not path.is_file() or path.is_symlink()):
        raise PerformanceEvidenceError("output must be a regular file when it exists")
    resolved_output = path.resolve(strict=False)
    if any(resolved_output == item.resolve(strict=False) for item in protected):
        raise PerformanceEvidenceError("output must not overwrite probe or input evidence")

    temporary_name = ""
    try:
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{path.name}.", suffix=".tmp", dir=parent
        )
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, path)
        temporary_name = ""
    finally:
        if temporary_name:
            try:
                os.unlink(temporary_name)
            except FileNotFoundError:
                pass


def _build_parser() -> argparse.ArgumentParser:
    """建立稳定、非交互的命令行参数。"""
    parser = argparse.ArgumentParser(
        description="Validate a native GUI Release no-bundle performance probe."
    )
    parser.add_argument("--probe", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument(
        "--tray-enabled", choices=("enabled", "disabled"), required=True
    )
    parser.add_argument("--output", type=Path, required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    """读取输入、始终尽可能保存判定证据，并以退出码表达门禁结果。"""
    args = _build_parser().parse_args(argv)
    input_errors: list[str] = []
    try:
        manifest = _read_json_object(args.manifest, "manifest")
    except PerformanceEvidenceError as exc:
        manifest = {}
        input_errors.append(str(exc))
    try:
        evidence = _read_json_object(args.evidence, "evidence")
    except PerformanceEvidenceError as exc:
        evidence = {}
        input_errors.append(str(exc))

    result = evaluate(
        args.probe,
        manifest,
        evidence,
        args.tray_enabled == "enabled",
        input_errors,
    )
    try:
        _write_json_atomic(
            args.output,
            result,
            [args.probe, args.manifest, args.evidence],
        )
    except (OSError, PerformanceEvidenceError) as exc:
        print(f"performance evidence output failed: {exc}", file=sys.stderr)
        return 2

    print(
        json.dumps(
            {
                "status": result["status"],
                "evidence": args.output.name,
                "failures": result["failures"],
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    return 0 if result["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
