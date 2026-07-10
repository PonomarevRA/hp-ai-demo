#!/bin/bash
cd "$(dirname "$0")"
chmod +x ./historic-portfolio-ai
./historic-portfolio-ai --urls "http://127.0.0.1:5087" &
APP_PID=$!
echo "$APP_PID" > historic-portfolio-ai.pid
sleep 2
open "http://127.0.0.1:5087"
wait "$APP_PID"
rm -f historic-portfolio-ai.pid
