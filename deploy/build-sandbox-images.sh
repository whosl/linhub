#!/usr/bin/env bash
set -Eeuo pipefail

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly PYTHON_IMAGE="${LINHUB_SANDBOX_PYTHON_IMAGE:-linhub/sandbox-python:2026-08-05}"
readonly PIP_INDEX_URL="${LINHUB_SANDBOX_PIP_INDEX_URL:-https://pypi.org/simple}"

printf '[sandbox-images] 构建 %s\n' "${PYTHON_IMAGE}"
docker build \
  --pull=false \
  --build-arg "PIP_INDEX_URL=${PIP_INDEX_URL}" \
  --tag "${PYTHON_IMAGE}" \
  "${ROOT}/docker/code-sandbox-python"

printf '[sandbox-images] 验证数据分析依赖\n'
docker run --rm --entrypoint=python3 "${PYTHON_IMAGE}" -c \
  'import duckdb, linhub_safe_archive, matplotlib, numpy, openpyxl, pandas, polars, pyarrow, scipy, seaborn, sklearn, xlsxwriter; print("sandbox image ok")'
