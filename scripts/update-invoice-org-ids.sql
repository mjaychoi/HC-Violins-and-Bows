-- ============================================
-- Invoice org_id 업데이트 스크립트
-- ============================================
-- 
-- 사용법:
-- 1. 먼저 현재 상태 확인:
--    npm run fix:invoice-org-ids
--
-- 2. Supabase 대시보드 > SQL Editor에서 이 파일 실행
--
-- 3. YOUR-ORG-ID-HERE를 실제 org_id로 교체하거나
--    아래 "방법 2: 가장 많이 사용된 org_id로 업데이트" 사용
--
-- ============================================

-- 방법 1: 특정 org_id로 모든 NULL org_id 업데이트
-- 주의: YOUR-ORG-ID-HERE를 실제 org_id로 교체하세요!
/*
UPDATE invoices
SET org_id = 'YOUR-ORG-ID-HERE'::UUID
WHERE org_id IS NULL;
*/

-- 방법 2: 가장 많이 사용된 org_id로 업데이트
-- (기존 invoice들 중 가장 많은 org_id를 찾아서 사용)
-- 주의: 여러 org_id가 섞여있으면 주의해서 사용하세요!
/*
UPDATE invoices
SET org_id = (
  SELECT org_id
  FROM invoices
  WHERE org_id IS NOT NULL
  GROUP BY org_id
  ORDER BY COUNT(*) DESC
  LIMIT 1
)
WHERE org_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM invoices
    WHERE org_id IS NOT NULL
  );
*/

-- 방법 3: 특정 날짜 이후의 invoice만 업데이트
-- (예: 2025-01-01 이후 생성된 invoice만)
/*
UPDATE invoices
SET org_id = 'YOUR-ORG-ID-HERE'::UUID
WHERE org_id IS NULL
  AND created_at >= '2025-01-01'::timestamp;
*/

-- ============================================
-- 업데이트 전 확인 쿼리
-- ============================================

-- 1. org_id가 NULL인 invoice 개수
-- SELECT COUNT(*) as null_org_id_count
-- FROM invoices
-- WHERE org_id IS NULL;

-- 2. org_id 분포 확인
-- SELECT 
--   org_id,
--   COUNT(*) as count
-- FROM invoices
-- GROUP BY org_id
-- ORDER BY count DESC;

-- 3. 샘플 invoice 확인 (org_id가 NULL인 것들)
-- SELECT 
--   id,
--   invoice_number,
--   org_id,
--   client_id,
--   invoice_date,
--   created_at
-- FROM invoices
-- WHERE org_id IS NULL
-- ORDER BY created_at DESC
-- LIMIT 10;

-- ============================================
-- 업데이트 후 확인 쿼리
-- ============================================

-- 업데이트 후에도 여전히 NULL인 invoice 확인
-- SELECT COUNT(*) as still_null_count
-- FROM invoices
-- WHERE org_id IS NULL;

