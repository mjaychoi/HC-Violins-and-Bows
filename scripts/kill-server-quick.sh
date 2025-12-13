#!/bin/bash

# 포트 3000에서 실행 중인 서버를 즉시 종료 (비대화형)

PORT=3000

echo "🔍 포트 $PORT 프로세스 확인..."

PID=$(lsof -ti:$PORT 2>/dev/null)

if [ -z "$PID" ]; then
  echo "✅ 포트 $PORT에서 실행 중인 프로세스가 없습니다."
  exit 0
fi

echo "📋 발견된 프로세스:"
for p in $PID; do
  CMD=$(ps -p $p -o command --no-headers 2>/dev/null | head -c 80)
  echo "  PID $p: $CMD"
done

echo ""
echo "🛑 프로세스 종료 중..."

# Next.js 서버만 종료 (Chrome 프로세스는 제외)
for p in $PID; do
  CMD=$(ps -p $p -o command --no-headers 2>/dev/null)
  if echo "$CMD" | grep -q "next-server\|node.*next\|npm.*dev"; then
    echo "  → PID $p 종료 (Next.js 서버)"
    kill -TERM $p 2>/dev/null
    sleep 1
    if kill -0 $p 2>/dev/null; then
      kill -9 $p 2>/dev/null
    fi
  fi
done

sleep 1

# 확인
REMAINING=$(lsof -ti:$PORT 2>/dev/null | grep -v "$PID" 2>/dev/null)
if [ -z "$REMAINING" ]; then
  echo "✅ Next.js 서버가 종료되었습니다."
elif lsof -ti:$PORT >/dev/null 2>&1; then
  echo "⚠️  일부 프로세스가 여전히 실행 중입니다 (Chrome 등 브라우저 프로세스는 정상)"
  lsof -i:$PORT | grep LISTEN
else
  echo "✅ 포트 $PORT가 정리되었습니다!"
fi
