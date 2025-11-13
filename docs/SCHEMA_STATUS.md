# Supabase Database Schema Status

## 📊 현재 상태 (2025-11-12)

### ✅ 실제 DB에 존재하는 테이블 (6개)

1. **client_instruments** - 클라이언트-악기 관계 테이블
   - ✅ 마이그레이션 파일: 없음 (초기 스키마에 포함된 것으로 추정)
   - 컬럼: id, client_id, instrument_id, relationship_type, notes, created_at
   - 제약조건: 5개 (PK, FK 2개, UNIQUE, CHECK)

2. **clients** - 클라이언트 테이블
   - ✅ 마이그레이션 파일: 없음 (초기 스키마에 포함된 것으로 추정)
   - 컬럼: id, last_name, first_name, contact_number, email, note, created_at, tags, interest, **client_number**
   - 제약조건: 1개 (PK)
   - ✅ `client_number` 컬럼: `20250101000001_add_unique_numbers.sql`로 추가됨

3. **instrument_images** - 악기 이미지 테이블
   - ✅ 마이그레이션 파일: 없음 (초기 스키마에 포함된 것으로 추정)
   - 컬럼: id, instrument_id, image_url, file_name, file_size, mime_type, display_order, created_at
   - 제약조건: 2개 (PK, FK)

4. **instruments** - 악기 테이블
   - ✅ 마이그레이션 파일:
     - `20241112141803_add_subtype_column.sql` - subtype 컬럼 추가
     - `20241112141804_update_status_constraint.sql` - status 제약조건 업데이트
     - `20241112141805_add_updated_at_trigger.sql` - updated_at 트리거 추가
     - `20250101000001_add_unique_numbers.sql` - serial_number 컬럼 추가
   - 컬럼: id, status, maker, type, year, certificate, size, weight, price, ownership, description, image_url, condition, notes, created_at, updated_at, note, **subtype**, **serial_number**
   - 제약조건: 2개 (PK, CHECK)

5. **maintenance_tasks** - 유지보수 작업 테이블
   - ✅ 마이그레이션 파일:
     - `20251109150920_maintenance_tasks.sql` - 테이블 생성
     - `20250101000000_add_client_id_to_maintenance_tasks.sql` - client_id 컬럼 추가
   - 컬럼: id, instrument_id, task_type, title, description, status, received_date, due_date, personal_due_date, scheduled_date, completed_date, priority, estimated_hours, actual_hours, cost, notes, created_at, updated_at, **client_id**
   - 제약조건: 6개 (PK, FK 2개, CHECK 3개)

6. **sales_history** - 판매 이력 테이블
   - ⚠️ 마이그레이션 파일: 없음
   - 컬럼: id, instrument_id, client_id, sale_price, sale_date, notes, created_at
   - 제약조건: 2개 (PK, FK)

## 🔍 발견된 문제점

### ⚠️ 1. sales_history 테이블에 대한 마이그레이션 파일이 없음
- 실제 DB에는 `sales_history` 테이블이 존재하지만, 레포지토리에는 마이그레이션 파일이 없습니다.
- 이 테이블은 초기 스키마에 포함되었거나, 수동으로 생성되었을 가능성이 있습니다.
- **권장사항**: `sales_history` 테이블 생성 마이그레이션 파일을 추가하는 것이 좋습니다.

### ⚠️ 2. 초기 테이블들에 대한 마이그레이션 파일 부재
- `clients`, `instruments`, `client_instruments`, `instrument_images` 테이블에 대한 초기 생성 마이그레이션 파일이 없습니다.
- 이들은 초기 스키마에 포함되었거나, Supabase 대시보드에서 수동으로 생성되었을 가능성이 있습니다.
- **권장사항**: 초기 스키마 마이그레이션 파일을 생성하여 레포지토리에 추가하는 것이 좋습니다.

## ✅ 잘 반영된 부분

1. **최근 추가된 기능들이 모두 마이그레이션 파일로 관리됨**
   - `subtype` 컬럼 추가
   - `serial_number`, `client_number` 추가
   - `maintenance_tasks` 테이블 생성
   - `client_id` 컬럼 추가

2. **스키마 체크 스크립트가 잘 작동함**
   - `scripts/check-schema.ts`로 실제 DB 스키마를 확인 가능
   - 스키마 export 파일 자동 생성

3. **마이그레이션 파일들이 타임스탬프 순서로 정리됨**

## 📝 권장 사항

1. **초기 스키마 마이그레이션 파일 생성**
   - `clients`, `instruments`, `client_instruments`, `instrument_images` 테이블 생성 마이그레이션 파일 추가
   - `sales_history` 테이블 생성 마이그레이션 파일 추가

2. **마이그레이션 파일 문서화**
   - 각 마이그레이션 파일에 설명 추가
   - 마이그레이션 실행 순서 명시

3. **스키마 버전 관리**
   - 현재 스키마 버전을 문서화
   - 마이그레이션 실행 이력 추적

## 🔄 스키마 확인 방법

```bash
# 실제 DB 스키마 확인 및 export
npm run schema:check

# 생성된 스키마 파일 확인
cat supabase-schema-export.sql
```

## 📅 마이그레이션 파일 목록

1. `20241112141803_add_subtype_column.sql` - instruments.subtype 추가
2. `20241112141804_update_status_constraint.sql` - instruments.status 제약조건 업데이트
3. `20241112141805_add_updated_at_trigger.sql` - updated_at 트리거 추가
4. `20251109150920_maintenance_tasks.sql` - maintenance_tasks 테이블 생성
5. `20250101000000_add_client_id_to_maintenance_tasks.sql` - maintenance_tasks.client_id 추가
6. `20250101000001_add_unique_numbers.sql` - instruments.serial_number, clients.client_number 추가

## 결론

**현재 상태**: 대부분 잘 반영되어 있으나, 초기 테이블들(`clients`, `instruments`, `client_instruments`, `instrument_images`, `sales_history`)에 대한 마이그레이션 파일이 부족합니다.

**점수**: 7/10
- 최근 추가된 기능들은 모두 마이그레이션으로 관리됨 ✅
- 초기 스키마 마이그레이션 파일 부재 ⚠️

