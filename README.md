# 살림결 Next.js

기존 단일 `index.html` 가계부를 Next.js App Router + TypeScript + Tailwind CSS 구조로 옮긴 프로젝트입니다.

## 기술 구성

- Next.js App Router
- TypeScript
- Tailwind CSS 4 (`@tailwindcss/postcss`)
- React Client Component
- 브라우저 `localStorage` 저장

## 실행

Node.js 20.9 이상을 권장합니다.

```bash
npm install
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

## 기존 데이터 호환

원본 HTML과 같은 localStorage 키를 사용합니다.

- `salimgyeol-records-v1`
- `salimgyeol-products-v1`
- `salimgyeol-loans-v1`

같은 도메인(origin)에서 실행될 경우 기존 데이터 형식과 호환됩니다. 단, 기존 HTML과 Vercel 배포 주소는 origin이 다르므로 브라우저가 자동으로 서로의 localStorage를 공유하지는 않습니다.

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
