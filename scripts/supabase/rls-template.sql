-- RLS 활성화 및 최소 권한 정책 예시 템플릿
-- 실제 테이블/컬럼명에 맞게 수정 후 적용하세요.

-- 1) 테이블에 RLS 활성화
-- ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- 2) 기본 DENY(정책 없으면 접근 불가) 전제에서 최소 권한 정책 추가
-- 읽기: 자신 소유 행만 조회 가능
-- CREATE POLICY clients_select_own_rows ON public.clients
--   FOR SELECT
--   TO authenticated
--   USING (owner_id = auth.uid());

-- 쓰기: 자신 소유 행만 INSERT/UPDATE/DELETE 가능
-- CREATE POLICY clients_insert_own_rows ON public.clients
--   FOR INSERT
--   TO authenticated
--   WITH CHECK (owner_id = auth.uid());

-- CREATE POLICY clients_update_own_rows ON public.clients
--   FOR UPDATE
--   TO authenticated
--   USING (owner_id = auth.uid())
--   WITH CHECK (owner_id = auth.uid());

-- CREATE POLICY clients_delete_own_rows ON public.clients
--   FOR DELETE
--   TO authenticated
--   USING (owner_id = auth.uid());

-- 참고: 공개 읽기 허용해야 하는 테이블은 아래처럼 제한된 SELECT 허용 정책을 별도 정의
-- CREATE POLICY instruments_public_read ON public.instruments
--   FOR SELECT TO anon, authenticated USING (true);

-- 주의: 서비스 롤 키를 사용하는 서버 사이드는 RLS를 우회합니다.

