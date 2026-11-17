# 갈만해 (worthgoing)

Apps in Toss WebView 미니앱 — React + TypeScript + Vite.

공식 스캐폴더 [`create-ait-app`](https://github.com/toss/create-ait-app)의 `react-ts` 템플릿으로 생성했습니다.

현재 stage 4: MOCK 추천 저장·공유(클라이언트 Storage + Share.createLink). 가격은 저장/공유 시점 기준. 실시간 API·Supabase 아님.

## 요구 사항

- Node.js **24** 이상 (`.nvmrc` 참고)

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 개발 서버를 확인합니다. 오른쪽 아래 `AIT` 버튼으로 Apps in Toss 환경을 미리볼 수 있습니다.

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
