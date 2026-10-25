#!/bin/sh
# Starts the Calculator on port 8080 and returns once it answers, so the
# codespace forwards the port and opens the browser on a working app.
set -eu
prefix=$(npm prefix --global)
log="$HOME/calculator.log"
setsid -f "$prefix/bin/prism-code" run "$prefix/lib/node_modules/prism-code/fixtures/Calculator.holo" --port 8080 >"$log" 2>&1 </dev/null &
for _ in $(seq 1 50); do
  if curl -fs -o /dev/null http://127.0.0.1:8080/; then
    echo "Calculator is serving on port 8080"
    exit 0
  fi
  sleep 0.2
done
echo "Calculator did not answer; see $log" >&2
cat "$log" >&2
exit 1
