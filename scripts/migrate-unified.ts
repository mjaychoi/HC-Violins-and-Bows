import { logError } from '@/utils/logger';

const LOG_CONTEXT = 'migrate-unified';

function err(message: string, error?: unknown) {
  logError(`[${LOG_CONTEXT}] ❌ ${message}`, error, LOG_CONTEXT);
  if (error) {
    logError(
      error instanceof Error ? error.message : String(error),
      LOG_CONTEXT
    );
  }
}

async function migrateUnified() {
  err(
    [
      '이 스크립트는 비활성화되었습니다.',
      'legacy unified.sql 번들은 production migration 경로에서 제거되었습니다.',
      'timestamp-prefixed migration만 supabase/migrations/ 아래에서 배포할 수 있습니다.',
      'archive 참고: supabase/migrations_archive/unified.sql',
    ].join(' ')
  );
  process.exit(1);
}

// 실행
migrateUnified().catch(error => {
  err('예상치 못한 에러:', error);
  process.exit(1);
});
