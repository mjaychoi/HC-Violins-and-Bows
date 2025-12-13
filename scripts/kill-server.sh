#!/bin/bash

# 포트 3000에서 실행 중인 서버 종료 스크립트

PORT=3000

echo "🔍 포트 $PORT에서 실행 중인 프로세스 확인 중..."

# 포트 3000을 사용하는 프로세스 찾기
PID=$(lsof -ti:$PORT 2>/dev/null)

if [ -z "$PID" ]; then
  echo "✅ 포트 $PORT에서 실행 중인 프로세스가 없습니다."
  exit 0
fi

echo "📋 발견된 프로세스:"
lsof -i:$PORT | grep LISTEN || echo "  PID: $PID"

echo ""
echo "⚠️  다음 프로세스를 종료합니다:"
for p in $PID; do
  ps -p $p -o pid,command --no-headers 2>/dev/null || echo "  PID $p"
done

echo ""
read -p "계속하시겠습니까? (y/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ 취소되었습니다."
  exit 1
fi

# 프로세스 종료
for p in $PID; do
  echo "🛑 프로세스 종료 중 (PID: $p)..."
  kill -TERM $p 2>/dev/null
  
  # 3초 대기 후에도 종료되지 않으면 강제 종료
  sleep 3
  if kill -0 $p 2>/dev/null; then
    echo "⚠️  프로세스가 종료되지 않아 강제 종료합니다 (PID: $p)..."
    kill -9 $p 2>/dev/null
  fi
done

# 확인
sleep 1
if lsof -ti:$PORT >/dev/null 2>&1; then
  echo "❌ 일부 프로세스가 여전히 실행 중입니다."
  exit 1
else
  echo "✅ 포트 $PORT가 정리되었습니다!"
fi
