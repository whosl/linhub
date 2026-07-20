#!/bin/zsh

set -euo pipefail

ADB_BIN="${ADB_BIN:-adb}"
DEVICE="${DEVICE:-emulator-5554}"
RUNS="${RUNS:-5}"
TARGET_PACKAGE="${TARGET_PACKAGE:-com.linhub.android.debug}"

if ! [[ "$RUNS" =~ '^[0-9]+$' ]] || (( RUNS < 1 || RUNS > 20 )); then
  print -u2 "RUNS 必须是 1..20 的整数"
  exit 2
fi

summarize() {
  sort -n | awk '
    { values[NR] = $1; over20 += ($1 > 20); over34 += ($1 > 34) }
    END {
      if (NR == 0) { print "frames=0"; exit }
      p50 = int((NR * 50 + 99) / 100)
      p95 = int((NR * 95 + 99) / 100)
      printf "frames=%d min=%.2f p50=%.2f p95=%.2f max=%.2f over20ms=%d over34ms=%d", \
        NR, values[1], values[p50], values[p95], values[NR], over20, over34
    }
  '
}

print "run\tframeStats"
for run in $(seq 1 "$RUNS"); do
  "$ADB_BIN" -s "$DEVICE" shell dumpsys gfxinfo "$TARGET_PACKAGE" reset >/dev/null
  for index in 1 2 3 4; do
    "$ADB_BIN" -s "$DEVICE" shell input swipe 540 1850 540 800 300
  done
  for index in 1 2 3 4; do
    "$ADB_BIN" -s "$DEVICE" shell input swipe 540 800 540 1850 300
  done
  frames=$("$ADB_BIN" -s "$DEVICE" shell dumpsys gfxinfo "$TARGET_PACKAGE" framestats | awk -F, '
    $1 == 0 && NF >= 20 {
      duration = ($20 - $3) / 1000000
      if (duration > 1 && duration < 1000) print duration
    }
  ' | summarize)
  print "$run\t$frames"
done
