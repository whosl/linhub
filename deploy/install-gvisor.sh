#!/usr/bin/env bash
set -Eeuo pipefail

readonly INSTALL_DIR="/usr/local/bin"
readonly RUNSC_PATH="${INSTALL_DIR}/runsc"
readonly SHIM_PATH="${INSTALL_DIR}/containerd-shim-runsc-v1"
readonly RELEASE="${GVISOR_RELEASE:-20260706.0}"
readonly SMOKE_IMAGE="${GVISOR_SMOKE_IMAGE:-busybox:1.36.1}"
readonly PYTHON_IMAGE="${LINHUB_SANDBOX_PYTHON_IMAGE:-python:3.12-slim}"
readonly NODE_IMAGE="${LINHUB_SANDBOX_NODE_IMAGE:-node:22-slim}"
readonly BASH_IMAGE="${LINHUB_SANDBOX_BASH_IMAGE:-bash:5.2}"
EXISTING_RUNSC="$(command -v runsc 2>/dev/null || true)"

log() {
  printf '[install-gvisor] %s\n' "$*"
}

die() {
  printf '[install-gvisor] 错误：%s\n' "$*" >&2
  exit 1
}

if [[ "${EUID}" -ne 0 ]]; then
  die "请以 root 身份运行此脚本"
fi

if [[ ! -r /etc/os-release ]]; then
  die "无法识别操作系统；此脚本仅支持 Ubuntu"
fi
# shellcheck disable=SC1091
source /etc/os-release
if [[ "${ID:-}" != "ubuntu" ]]; then
  die "仅支持 Ubuntu，当前系统为 ${PRETTY_NAME:-unknown}"
fi
if ! command -v systemctl >/dev/null 2>&1; then
  die "未检测到 systemd"
fi
if ! command -v docker >/dev/null 2>&1; then
  die "请先安装 Docker Engine"
fi
if ! systemctl is-active --quiet docker; then
  die "Docker daemon 未运行"
fi

case "$(uname -m)" in
  x86_64) readonly GVISOR_ARCH="x86_64" ;;
  aarch64 | arm64) readonly GVISOR_ARCH="aarch64" ;;
  *) die "gVisor 安装脚本不支持架构 $(uname -m)" ;;
esac

docker_has_runsc() {
  local runtimes
  runtimes="$(docker info --format '{{json .Runtimes}}' 2>/dev/null || true)"
  [[ "${runtimes}" == *'"runsc"'* ]]
}

pull_runtime_images() {
  log "预拉取 Code Lab 运行镜像"
  for image in "${PYTHON_IMAGE}" "${NODE_IMAGE}" "${BASH_IMAGE}"; do
    docker pull "${image}"
  done
}

# 安装前先检查：已安装且已注册时保持现状，不下载、不重启 Docker。
if [[ -n "${EXISTING_RUNSC}" ]] && [[ -x "${EXISTING_RUNSC}" ]] && docker_has_runsc; then
  log "runsc 已安装并注册到 Docker，无需重复安装"
  pull_runtime_images
  "${EXISTING_RUNSC}" --version
  exit 0
fi

if [[ -n "${EXISTING_RUNSC}" ]] && [[ -x "${EXISTING_RUNSC}" ]]; then
  log "检测到现有 runsc，仅补充 Docker runtime 注册"
  RUNSC_COMMAND="${EXISTING_RUNSC}"
else
  log "安装下载与校验依赖"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends ca-certificates curl coreutils

  readonly DOWNLOAD_DIR="$(mktemp -d /tmp/linhub-gvisor.XXXXXX)"
  trap 'rm -rf "${DOWNLOAD_DIR}"' EXIT
  readonly BASE_URL="https://storage.googleapis.com/gvisor/releases/release/${RELEASE}/${GVISOR_ARCH}"

  log "从 gVisor 官方发布源下载 ${RELEASE} (${GVISOR_ARCH})"
  for artifact in runsc containerd-shim-runsc-v1; do
    curl --fail --show-error --silent --location \
      --proto '=https' --tlsv1.2 \
      "${BASE_URL}/${artifact}" \
      --output "${DOWNLOAD_DIR}/${artifact}"
    curl --fail --show-error --silent --location \
      --proto '=https' --tlsv1.2 \
      "${BASE_URL}/${artifact}.sha512" \
      --output "${DOWNLOAD_DIR}/${artifact}.sha512"
    (
      cd "${DOWNLOAD_DIR}"
      sha512sum --check "${artifact}.sha512"
    )
  done

  install -o root -g root -m 0755 "${DOWNLOAD_DIR}/runsc" "${RUNSC_PATH}"
  install -o root -g root -m 0755 \
    "${DOWNLOAD_DIR}/containerd-shim-runsc-v1" "${SHIM_PATH}"
  RUNSC_COMMAND="${RUNSC_PATH}"
fi

log "注册 runsc Docker runtime"
"${RUNSC_COMMAND}" install
systemctl restart docker

for _ in {1..30}; do
  if systemctl is-active --quiet docker && docker info >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
systemctl is-active --quiet docker || die "Docker 重启失败"
docker_has_runsc || die "Docker 重启后仍未注册 runsc runtime"

if [[ "${SKIP_GVISOR_SMOKE_TEST:-0}" == "1" ]]; then
  log "已按配置跳过 runsc 冒烟测试"
else
  log "运行 runsc 冒烟测试（镜像：${SMOKE_IMAGE}）"
  docker run --rm \
    --runtime=runsc \
    --network=none \
    --read-only \
    --user=65532:65532 \
    --cap-drop=ALL \
    --security-opt=no-new-privileges:true \
    --pids-limit=16 \
    --memory=64m \
    --memory-swap=64m \
    --cpus=0.25 \
    --entrypoint=/bin/true \
    "${SMOKE_IMAGE}"
fi

pull_runtime_images

log "gVisor 安装完成"
"${RUNSC_COMMAND}" --version
