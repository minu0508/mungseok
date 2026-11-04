# 멍석

한강 둔치에 멍석 깔아뒀어요. 다른 사람들과 나란히 앉아, 아무것도 하지 않고 버틴 시간을 재는 웹 서비스입니다.

- 가입 없이 링크로 바로 들어와요.
- 마우스, 키보드, 화면 터치, 탭 전환 중 하나라도 일어나면 일어난 걸로 칩니다.
- 한 둔치(방)에 30명까지 앉고, 넘치면 새 둔치가 열려요.
- 오늘의 순위는 한국 시간 자정에 초기화되고, 서버를 다시 켜도 남아요.
- 지금 멍때리는 사람 수를 실시간 차트로 보여줘요.

## 실행

```bash
npm install
npm run build      # 화면(web/) 빌드 → web/dist
npm start          # http://localhost:3000
npm test
```

화면을 고쳤으면 `npm --prefix web run build` 로 다시 빌드하면 됩니다. 서버는 요청마다 `web/dist` 를 읽어서 다시 켤 필요가 없어요.

환경 변수

| 이름 | 기본값 | 뜻 |
|---|---|---|
| `PORT` | 3000 | 서버 포트 |
| `MIN_RECORD_SECS` | 10 | 순위에 오르는 최소 초 |
| `DATA_FILE` | `data/board.json` | 오늘의 순위를 저장할 파일 |
| `COUNT_EVERY_MS` | 5000 | 앉은 사람 수를 방송하는 간격 |

## 구조

- `server.js` — `web/dist` 제공 + WebSocket(`/ws`)으로 방·자리·시간·순위·인원 관리
- `web/` — React + Vite + Tailwind + shadcn/ui 화면
  - Motion: 패널 전환, 사람이 앉고 일어나는 움직임
  - Anime.js: 강물 반짝임, 다리 조명, 카운트다운, 결과 시간 올라가는 숫자
  - Bklit UI: 지금 멍때리는 사람 수 실시간 선 차트 (`src/components/charts/`, shadcn 레지스트리로 받은 코드)
- `test/server.test.js` — 서버를 띄워 실제 WebSocket 으로 확인하는 테스트

## 알려진 한계

- 순위는 JSON 파일 하나에 저장합니다. 서버가 여러 대이거나 디스크가 지워지는 호스팅에서는 DB 로 옮겨야 합니다.
- 시간 측정은 브라우저가 "움직였다"고 알려주는 것을 믿습니다. 스크립트로 조작하면 기록을 꾸밀 수 있습니다.
- 화면 번들이 gzip 기준 약 180KB 입니다.
