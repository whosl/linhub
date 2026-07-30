#!/bin/zsh

set -euo pipefail

ADB_BIN="${ADB_BIN:-adb}"
DEVICE="${DEVICE:-emulator-5554}"
RUNS="${RUNS:-10}"
TARGET_PACKAGE="${TARGET_PACKAGE:-com.linhub.android.benchmark}"
TARGET_ACTIVITY="${TARGET_ACTIVITY:-com.linhub.android.MainActivity}"
CHROME_ACTIVITY="com.android.chrome/org.chromium.chrome.browser.ChromeTabbedActivity"

if ! [[ "$RUNS" =~ '^[0-9]+$' ]] || (( RUNS < 1 || RUNS > 50 )); then
  print -u2 "RUNS 必须是 1..50 的整数"
  exit 2
fi

"$ADB_BIN" -s "$DEVICE" forward tcp:9222 localabstract:chrome_devtools_remote >/dev/null
"$ADB_BIN" -s "$DEVICE" shell cmd package compile -m speed-profile -f "$TARGET_PACKAGE" >/dev/null

typeset -a web_samples native_samples
print "run\twebInteractivePaintedMs\tnativeColdTotalTimeMs"
for run in $(seq 1 "$RUNS"); do
  "$ADB_BIN" -s "$DEVICE" shell am start -n "$CHROME_ACTIVITY" >/dev/null
  sleep 0.25
  web_json=$(ITERATIONS=1 node android/tools/web-performance-cdp.mjs)
  web_ms=$(print -r -- "$web_json" | jq -r '.samples[0].interactivePaintedMs')

  "$ADB_BIN" -s "$DEVICE" shell am force-stop "$TARGET_PACKAGE"
  native_output=$("$ADB_BIN" -s "$DEVICE" shell am start -W \
    -n "$TARGET_PACKAGE/$TARGET_ACTIVITY")
  native_ms=$(print -r -- "$native_output" | awk -F': ' '/^TotalTime:/ { print $2 }')
  if [[ -z "$native_ms" ]]; then
    print -u2 "第 $run 轮未读到原生 TotalTime"
    exit 1
  fi

  web_samples+=("$web_ms")
  native_samples+=("$native_ms")
  print "$run\t$web_ms\t$native_ms"
done

summarize() {
  print -l -- "$@" | sort -n | awk '
    { values[NR] = $1; sum += $1 }
    END {
      p50 = int((NR * 50 + 99) / 100)
      p95 = int((NR * 95 + 99) / 100)
      printf "min=%.2f p50=%.2f p95=%.2f max=%.2f mean=%.2f", \
        values[1], values[p50], values[p95], values[NR], sum / NR
    }
  '
}

print "web\t$(summarize "${web_samples[@]}")"
print "native\t$(summarize "${native_samples[@]}")"
