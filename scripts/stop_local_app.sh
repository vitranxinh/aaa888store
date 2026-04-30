#!/bin/zsh
set -e

cd ~/Projects/soban-retail

if [ -f app.pid ]; then
  kill "$(cat app.pid)" || true
  rm -f app.pid
  echo "App stopped."
else
  pkill -f "next start" || true
  echo "No app.pid found. Tried pkill next start."
fi
