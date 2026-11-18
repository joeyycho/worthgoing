# 갈만해 (worthgoing)

Apps in Toss WebView 미니앱 — React + TypeScript + Vite.

공식 스캐폴더 [`create-ait-app`](https://github.com/toss/create-ait-app)의 `react-ts` 템플릿으로 생성했습니다.

현재 stage 8: 샌드박스/콘솔 테스트·출시 준비 체크리스트. 프로덕션 승인 자체를 주장하지 않습니다.

## 요구 사항

- Node.js **24** 이상 (`.nvmrc` 참고)

## 로컬 실행

```bash
cp .env.example .env          # VITE_API_BASE_URL 등 (비밀키 넣지 말 것)
npm install
npm run server:install        # optional: Supabase / Amadeus API 서버
npm run server:dev            # optional: http://127.0.0.1:8787
npm run smoke:server          # optional: /health + flight/stay mock smoke
npm run dev
```

브라우저에서 개발 서버를 확인합니다. 오른쪽 아래 `AIT` 버튼으로 Apps in Toss 환경을 미리볼 수 있습니다 (SDK 3.x Devtools — 별도 샌드박스 앱 없음).

Supabase를 쓰려면 `server/.env`에 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`를 넣고, 마이그레이션을 적용하세요. 자세한 방법은 `supabase/README.md`.

SerpApi (현재 기본 live 경로): `server/.env`에 `SERPAPI_API_KEY`를 넣으면 항공·숙소 검색이 **SerpApi Google Flights / Hotels**를 우선 사용합니다. 키가 없거나 API 실패 시 Mock으로 폴백합니다. Vite/`VITE_*`에 비밀키를 넣지 마세요. `/health`의 `serpapiConfigured`와 `activeFlightProvider` / `activeAccommodationProvider`는 서로 다른 신호입니다.

Duffel / Amadeus (레거시 폴백, 코드 유지): SerpApi 미설정 시 항공은 Duffel → Amadeus → Mock, 숙소는 Amadeus → Mock. `DUFFEL_ACCESS_TOKEN`, `AMADEUS_CLIENT_ID` / `AMADEUS_CLIENT_SECRET`은 서버 전용입니다.

## 빌드 / 패키징 / 콘솔 테스트

```bash
npm run build         # tsc + vite build + ait build → galman-hae.ait
npm run ait:verify    # .ait 존재·크기 확인
npm run ait:package   # build + verify
npm run check         # lint + server typecheck + ait:package
npm run deploy        # ait deploy (콘솔 API 키 / 워크스페이스 필요)
```

`apps-in-toss.config.ts`의 `appName`은 **`galman-hae`** 입니다 (콘솔 앱 ID). 제품 표시명은 계속 **갈만해**. [Apps in Toss 콘솔](https://apps-in-toss.toss.im/)에 등록한 앱 이름과 동일해야 배포·QR 테스트가 됩니다.

공식 테스트 흐름 (요약 — 상세는 개발자센터):

1. `npm run build`로 `galman-hae.ait` 생성  
2. 콘솔에 `.ait` 업로드 후 **Test** QR을 토스 앱에서 스캔 (또는 `npx ait deploy` / `npm run deploy`)  
3. SDK 3.x는 로컬에서 **AIT Devtools**로 브라우저 미리보기; 구버전(2.x) 전용 샌드박스 APK/IPA와는 다름  

출시 준비 체크리스트(환경 변수, MOCK vs live, CORS, 알려진 한계):  
→ Project store `docs/stage-8-sandbox-launch.md` (에이전트 작업 산출물) 및 아래 공식 문서.

## 문서

- [Apps in Toss 개발자센터](https://developers-apps-in-toss.toss.im/)
- [미니앱 테스트하기 (.ait / QR)](https://developers-apps-in-toss.toss.im/guide/en/operation/toss)
- [테스트 앱 / sandbox 안내 (SDK 3.x = Devtools)](https://developers-apps-in-toss.toss.im/landing-page/landing-page-en/development/test/sandbox)
- [시작하기 (create-ait-app)](https://developers-apps-in-toss.toss.im/landing-page/landing-page-en)
- [네비게이션 바](https://developers-apps-in-toss.toss.im/documentation/common/navigationbar)
- Supabase: `supabase/README.md`, `.env.example` / `server/.env.example`
