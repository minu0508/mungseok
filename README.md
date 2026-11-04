# 멍석

한강 둔치에 멍석 깔아뒀어요. 다른 사람들과 나란히 앉아, 아무것도 하지 않고 버틴 시간을 재는 웹 서비스입니다.

- 가입 없이 링크로 바로 들어와요.
- 마우스, 키보드, 화면 터치, 탭 전환 중 하나라도 일어나면 일어난 걸로 칩니다.
- 한 둔치(방)에 30명까지 앉고, 넘치면 새 둔치가 열려요.
- 앉아 있는 동안 20~40분마다 무작위로 "아직 계세요?"를 물어요. 60초 안에 누르면 계속 앉아 있고(누르는 동작은 일어난 걸로 치지 않아요), 답이 없으면 마지막으로 확인된 때까지만 기록해요.
- 오늘의 순위는 한국 시간 자정에 초기화되고, 한 사람(IP)당 그날 가장 좋은 기록 하나만 남아요. IP 는 비밀 값을 섞은 해시로만 저장해요.
- IP 하나당 접속 하나만 허용해요. 같은 IP 에서 새로 들어오면 이전 접속이 닫혀요.
- 이름에 욕설·광고 문구(주소, 연락처, 홍보 단어)가 있으면 앉을 수 없어요 (`realtime/src/filter.js`).
- 한강 하늘은 서울 시간(새벽·낮·노을·밤)과 실제 날씨(맑음·구름·흐림·안개·비·눈·뇌우)를 따라가요. 날씨는 화면이 Open-Meteo 에서 15분마다 직접 받아요.
- 물소리를 켜면 강물 소리(비 오는 날은 빗소리까지)를 브라우저에서 합성해 들려줘요.
- 미리보기: `/?time=17:20&weather=rain` 처럼 시간과 날씨를 정해서 볼 수 있어요. `/?og=1` 은 공유 이미지(`web/public/og.png`)를 찍는 화면이에요.

## 구조 (모두 무료 요금제)

```
브라우저 ──(정적 파일)──▶ Vercel           web/       React + Vite 화면
        ──(웹소켓)────▶ Cloudflare Worker  realtime/  Durable Object 하나가 한강 전체를 맡음
        ──(HTTPS)─────▶ Open-Meteo         서울 날씨
```

- `web/` — React + Vite + Tailwind + shadcn/ui
  - Motion: 패널 전환, 사람이 앉고 일어나는 움직임, 앉아 있을 때 천천히 다가가는 카메라
  - Anime.js: 문장 등장, 카운트다운, 결과 시간 카운트업, 순위 등장
  - Bklit UI: 지금 멍때리는 사람 수 실시간 선 차트 (`src/components/charts/`, shadcn 레지스트리로 받은 코드)
  - 한강 장면은 `src/components/Scene.tsx` 에서 캔버스로 그려요
- `realtime/` — Cloudflare Workers + Durable Objects (SQLite)
  - 무료 한도(하루 요청 10만, 실행 시간 13,000 GB-s)를 넘으면 **과금 대신 요청이 거절**돼요
  - 한도를 아끼려고: 웹소켓 휴면(아무 일 없으면 잠듦), 인원은 바뀔 때만 방송, 확인·자정 초기화는 알람 하나, 연결 유지 ping 은 자동 응답
- `test/` — `wrangler dev` 로 실시간 서버를 띄워 실제 웹소켓으로 확인하는 테스트

## 내 PC 에서 실행

```bash
npm run setup                                # 세 폴더 의존성 설치
npm --prefix realtime run dev                # 실시간 서버 http://127.0.0.1:8787 (파일 감시: 다 쓰면 끄기)
npm run build && npx --prefix web vite preview --port 4173   # 화면 http://127.0.0.1:4173
npm test
```

화면은 `VITE_REALTIME_URL` 이 없으면 `ws://127.0.0.1:8787/ws` 로 붙어요. 같은 PC 에서 여러 탭으로 시험하려면 `--var ONE_PER_IP:0` 으로 IP 제한을 끄세요.

## 배포 (처음 한 번)

1. **Cloudflare (실시간 서버)**
   ```bash
   cd realtime
   npx wrangler login      # 브라우저에서 Cloudflare 계정으로 로그인 (무료 계정)
   npx wrangler deploy     # 끝나면 https://mungseok-realtime.<계정>.workers.dev 주소가 나와요
   ```
2. **Vercel (화면)** — vercel.com → Add New → Project → GitHub 의 `minu0508/mungseok` 가져오기
   - Root Directory: `web`
   - Environment Variables: `VITE_REALTIME_URL` = `wss://mungseok-realtime.<계정>.workers.dev/ws`
   - Deploy
3. **허용 주소 잠그기** — `realtime/wrangler.jsonc` 의 `ALLOWED_ORIGINS` 에 Vercel 주소(예: `https://mungseok.vercel.app`)를 넣고 `npx wrangler deploy` 를 한 번 더 해요. 다른 사이트가 멍석 서버에 몰래 붙는 걸 막아요.

이후에는 GitHub 에 올리면 Vercel 이 화면을 자동으로 다시 배포하고, 실시간 서버는 `realtime/` 에서 `npx wrangler deploy` 로 올려요.

## 실시간 서버 설정 (`realtime/wrangler.jsonc` 의 vars)

| 이름 | 기본값 | 뜻 |
|---|---|---|
| `MIN_RECORD_SECS` | 10 | 순위에 오르는 최소 초 |
| `CHECK_MIN_MS` / `CHECK_MAX_MS` | 20분 / 40분 | "아직 계세요?"를 묻는 간격 (그 사이 무작위) |
| `CHECK_TIMEOUT_MS` | 60000 | 답을 기다리는 시간 |
| `ONE_PER_IP` | `1` | `0` 이면 IP 제한을 끈다 (테스트·시험용) |
| `ALLOWED_ORIGINS` | 비어 있음 | 접속을 허용할 화면 주소들(쉼표로 구분). 비우면 어디서든 받는다 |

## 알려진 한계

- Durable Object 하나가 모든 둔치를 맡아요. 동시 접속이 수천 명을 넘으면 둔치별로 나눠야 해요.
- 시간 측정은 브라우저가 "움직였다"고 알려주는 것을 믿어요. 스크립트로 조작하면 기록을 꾸밀 수 있어요.
- IP 제한 때문에 같은 와이파이·회사망, 그리고 통신사가 IP 를 여러 사람에게 나눠 주는 모바일망에서는 서로 다른 사람이 서로를 밀어낼 수 있어요.
- 이름 필터는 목록 기반이라 새로운 변형은 놓칠 수 있어요.
- 화면 번들이 gzip 기준 약 180KB 예요.
