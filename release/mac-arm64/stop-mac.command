#!/bin/bash
cd "$(dirname "$0")"

if [ -f historic-portfolio-ai.pid ]; then
  APP_PID="$(cat historic-portfolio-ai.pid)"
  if [ -n "$APP_PID" ]; then
    kill "$APP_PID" 2>/dev/null || true
  fi
  rm -f historic-portfolio-ai.pid
fi

pkill -f "historic-portfolio-ai --urls http://127.0.0.1:5087" 2>/dev/null || true
echo "historic-portfolio-ai stopped."
