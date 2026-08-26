# 살림결 Next.js

기존 단일 `index.html` 가계부를 Next.js App Router + TypeScript + Tailwind CSS 구조로 옮긴 프로젝트입니다.

## 기술 구성

- Next.js App Router
- TypeScript
- Tailwind CSS 4 (`@tailwindcss/postcss`)
- React Client Component
- Supabase (PostgreSQL + PostgREST) 저장

## 실행

Node.js 20.9 이상을 권장합니다.

```bash
npm install
cp .env.example .env.local   # 값 채우기 (아래 참고)
npm run dev
```

브라우저에서 `http://localhost:3000`을 열면 됩니다.

프로덕션 빌드 확인:

```bash
npm run build
npm start
```

## App Router 경로

- `/` : 한눈에 보기
- `/ledger` : 수입·지출·통계
- `/loans` : 대출 관리
- `/savings` : 적금·예금
- `/cash` : 현금 모으기 분석

## Supabase 설정

데이터는 Supabase에 저장합니다. 프로젝트 대시보드의 **Project Settings → API**에서 값을 복사해 `.env.local`을 만듭니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

`.env*`는 gitignore 대상이므로 저장소에 올라가지 않습니다. Vercel에 배포할 때는 같은 두 값을 **Settings → Environment Variables**에 등록해야 합니다. `NEXT_PUBLIC_` 변수는 빌드 시점에 번들에 박히므로, 값을 바꾸면 재배포가 필요합니다.

### 테이블

| 테이블 | 내용 |
| --- | --- |
| `budget` | 수입·지출 내역 |
| `financial_products` | 적금·예금 상품 (금리 변경 이력은 `rate_changes` jsonb) |
| `loans` | 대출 (상환 내역은 `payments` jsonb) |

세 테이블 모두 RLS가 켜져 있고, 현재는 로그인 없이 누구나 읽기/쓰기가 가능한 임시 정책(`*_public_all`)이 걸려 있습니다. **인증을 붙일 때 `user_id` 컬럼을 추가하고 `auth.uid() = user_id` 조건으로 교체해야 합니다.**

DB 접근 코드는 `lib/supabase.ts`(클라이언트)와 `lib/store.ts`(조회·저장·삭제 + snake_case ↔ camelCase 변환)에 모여 있습니다.

## 기존 데이터 호환

원본 HTML과 같은 localStorage 키를 씁니다.

- `salimgyeol-records-v1`
- `salimgyeol-products-v1`
- `salimgyeol-loans-v1`

Supabase 테이블이 비어 있는 상태에서 앱을 처음 열면, 같은 origin의 localStorage에 남아 있는 위 데이터를 한 번 Supabase로 올린 뒤 `salimgyeol-supabase-migrated-v1` 플래그를 남겨 중복 업로드를 막습니다. 기존 HTML과 Vercel 배포 주소는 origin이 다르므로 자동으로 옮겨지지는 않습니다.

## Vercel 배포

1. 이 폴더를 GitHub 저장소에 push합니다.
2. Vercel에서 **Add New → Project**를 선택합니다.
3. GitHub 저장소를 Import합니다.
4. Framework Preset은 Next.js로 자동 인식되며 기본 설정으로 Deploy합니다.

또는 Vercel CLI를 사용한다면 프로젝트 루트에서 다음을 실행할 수 있습니다.

```bash
npx vercel
```

## 원본 보관

`legacy/index.html`에 변환 전 파일을 함께 보관했습니다.
