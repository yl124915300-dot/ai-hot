#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/workspace/ai-hot/ai-hot-comments-render-oneclick-v2"
cd "$APP_DIR"

if [ ! -d node_modules ]; then
  npm ci >/tmp/openclaw_skill_npm.log 2>&1
fi

APP_API_KEY="${APP_API_KEY:-codex-skill-admin-key}"
PUBLIC_TELEGRAM_URL="${PUBLIC_TELEGRAM_URL:-https://t.me/openclawyuyu}"

node src/server.js >/tmp/openclaw_skill_app.log 2>&1 &
APP_PID=$!
trap 'kill $APP_PID >/dev/null 2>&1 || true' EXIT
sleep 2

echo "[healthz]"
curl -s http://127.0.0.1:8080/healthz

echo "\n[generate-content]"
curl -s -X POST http://127.0.0.1:8080/api/generate-content \
  -H 'content-type: application/json' \
  -d '{"prompt":"乌兹物流咨询入口测试","taskType":"traffic_post","track":"logistics"}'

echo "\n[consultations]"
curl -s -X POST http://127.0.0.1:8080/api/consultations \
  -H 'content-type: application/json' \
  -d '{"name":"Codex Skill Test","contact":"tg:@skilltest","demand":"验证咨询链路","track":"general"}'
