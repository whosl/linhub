"""LinHub Code Lab 的受限 ZIP/TAR/GZIP 解压辅助函数。"""

from __future__ import annotations

import gzip
import os
import shutil
import stat
import tarfile
import zipfile
from pathlib import Path, PurePosixPath


class UnsafeArchiveError(ValueError):
    pass


def safe_extract_zip(archive: str | Path, destination: str | Path = "/tmp/extracted") -> list[Path]:
    target = _destination(destination)
    extracted: list[Path] = []
    with zipfile.ZipFile(archive) as source:
        members = source.infolist()
        _check_count(len(members))
        total = sum(member.file_size for member in members if not member.is_dir())
        _check_total(total)
        for member in members:
            relative = _relative(member.filename)
            output = target.joinpath(*relative.parts)
            mode = member.external_attr >> 16
            if stat.S_ISLNK(mode):
                raise UnsafeArchiveError(f"ZIP 包含符号链接：{member.filename}")
            if member.is_dir():
                output.mkdir(parents=True, exist_ok=True)
                continue
            output.parent.mkdir(parents=True, exist_ok=True)
            with source.open(member) as reader, output.open("xb") as writer:
                shutil.copyfileobj(reader, writer, length=1024 * 1024)
            extracted.append(output)
    return extracted


def safe_extract_tar(archive: str | Path, destination: str | Path = "/tmp/extracted") -> list[Path]:
    target = _destination(destination)
    extracted: list[Path] = []
    with tarfile.open(archive, mode="r:*") as source:
        members = source.getmembers()
        _check_count(len(members))
        _check_total(sum(member.size for member in members if member.isfile()))
        for member in members:
            relative = _relative(member.name)
            output = target.joinpath(*relative.parts)
            if member.isdir():
                output.mkdir(parents=True, exist_ok=True)
                continue
            if not member.isfile():
                raise UnsafeArchiveError(f"TAR 包含链接或特殊文件：{member.name}")
            reader = source.extractfile(member)
            if reader is None:
                raise UnsafeArchiveError(f"无法读取 TAR 成员：{member.name}")
            output.parent.mkdir(parents=True, exist_ok=True)
            with reader, output.open("xb") as writer:
                shutil.copyfileobj(reader, writer, length=1024 * 1024)
            extracted.append(output)
    return extracted


def safe_extract_gzip(
    archive: str | Path,
    output: str | Path = "/tmp/extracted/data",
) -> Path:
    target = Path(output).resolve()
    _assert_under_tmp(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    limit = _byte_limit()
    with gzip.open(archive, "rb") as reader, target.open("xb") as writer:
        while chunk := reader.read(1024 * 1024):
            written += len(chunk)
            if written > limit:
                raise UnsafeArchiveError(f"GZIP 解压后超过限制：{limit} bytes")
            writer.write(chunk)
    return target


def _destination(value: str | Path) -> Path:
    target = Path(value).resolve()
    _assert_under_tmp(target)
    target.mkdir(parents=True, exist_ok=True)
    return target


def _assert_under_tmp(target: Path) -> None:
    root = Path("/tmp").resolve()
    if target == root or root not in target.parents:
        raise UnsafeArchiveError("解压目标必须位于 /tmp 下")


def _relative(value: str) -> PurePosixPath:
    normalized = value.replace("\\", "/")
    path = PurePosixPath(normalized)
    if path.is_absolute() or not path.parts or any(part in {"", ".", ".."} for part in path.parts):
        raise UnsafeArchiveError(f"压缩包成员路径不安全：{value}")
    return path


def _check_count(count: int) -> None:
    limit = int(os.environ.get("LINHUB_ARCHIVE_MAX_FILES", "10000"))
    if count > limit:
        raise UnsafeArchiveError(f"压缩包文件数超过限制：{count} > {limit}")


def _byte_limit() -> int:
    tmp_limit = int(os.environ.get("LINHUB_TMP_LIMIT_BYTES", str(256 * 1024 * 1024)))
    return max(1024 * 1024, int(tmp_limit * 0.9))


def _check_total(total: int) -> None:
    limit = _byte_limit()
    if total > limit:
        raise UnsafeArchiveError(f"压缩包声明的解压后大小超过限制：{total} > {limit}")
