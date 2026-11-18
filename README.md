# 갈만해 (worthgoing)

Apps in Toss WebView 미니앱 — React + TypeScript + Vite.

공식 스캐폴더 [`create-ait-app`](https://github.com/toss/create-ait-app)의 `react-ts` 템플릿으로 생성했습니다.

현재 stage 7: AccommodationProvider + 서버 Amadeus Hotel List/Search(키 있으면) / Mock 폴백. Amadeus 비밀키는 `server/.env`만.

## 요구 사항

- Node.js **24** 이상 (`.nvmrc` 참고)

## 로컬 실행

```bash
cp .env.example .env          # VITE_API_BASE_URL 등 (비밀키 넣지 말 것)
npm install
npm run server:install        # optional: Supabase API 서버
npm run server:dev            # optional: http://127.0.0.1:8787
npm run dev
```

브라우저에서 개발 서버를 확인합니다. 오른쪽 아래 `AIT` 버튼으로 Apps in Toss 환경을 미리볼 수 있습니다.

Supabase를 쓰려면 `server/.env`에 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`를 넣고, 마이그레이션을 적용하세요. 자세한 방법은 `supabase/README.md`.

Amadeus 항공·숙소(stage 6–7): `server/.env`에 `AMADEUS_CLIENT_ID` / `AMADEUS_CLIENT_SECRET`을 넣으면 서버가 Flight + Hotel List/Search를 호출합니다. 키가 없거나 API 실패 시 Mock 프로바이더 + MOCK 배너로 폴백합니다. Vite/`VITE_*`에 Amadeus 비밀키를 넣지 마세요.

## 빌드 / 배포

```bash
npm run build   # dist + .ait 번들
npm run deploy  # 앱인토스 배포 (콘솔 연동 필요)
```

앱 식별자(`appName`)와 권한은 `apps-in-toss.config.ts`에서 관리합니다. 콘솔에 등록한 앱 이름과 동일해야 합니다.

## 문서

- [Apps in Toss 개발자센터](https://developers-apps-in-toss.toss.im/)
- [시작하기 (create-ait-app)](https://developers-apps-in-toss.toss.im/landing-page/landing-page-en)
- [기존 웹 프로젝트에 SDK 연동](https://developers-apps-in-toss.toss.im/ai-vibe-coding/tutorials/webview)
- Supabase: `supabase/README.md`, `.env.example`
