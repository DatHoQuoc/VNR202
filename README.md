# VNR202 — backend

Realtime backend for the N07 gallery game ("1930: Bài toán lựa chọn"), laptop version.
NestJS + Socket.IO. Design source: `GameDesign_v05` + the laptop changes (no QR/phone, V0 by show of hands, join at the end of station 9A).

## Run

```bash
npm install
HOST_KEY=choose-a-secret ROOM_CODE=ABCDE npm run dev     # or: npm run build && npm start
npm test
```

| Env | Default | Meaning |
|---|---|---|
| `HOST_KEY` | required in production | secret for the MC / controller (`x-host-key` header) |
| `ROOM_CODE` | random 5 chars | code players type to join (printed at startup) |
| `TEAMS` | 6 | number of teams |
| `PORT` | 3000 | |
| `DATA_FILE` | `./data/game.json` | state snapshot after every change (restart-safe); empty = off |
| `CORS_ORIGIN` | any | comma-separated allowed origins |
| `REFLECTION_MAX` | 300 | max reflection length |

State is in memory (one class = one room) with a JSON snapshot. If the snapshot cannot be read the server refuses to start instead of silently starting an empty game.

## Session flow

`lobby` → `joining` → `rounds` (1..4: **pick → guess → revealed**) → `announce` → `ended`

1. Station 0: MC asks V0 by show of hands, then `POST /host/opening {"percent": 40}` (12 of 30 chose D).
2. End of 9A (~min 27): `POST /host/joining/open`; class opens the `/play` page, types the room code, picks a team.
3. 9B, for n = 1..4: `open-pick` → `open-guess` → `reveal`.
4. After round 4: `announce/start`, then `announce/next` once per team (rank 6 → 1; rank 1 includes per-round scores).
5. `reflection/open`, moderate with `reflections/:id/approve`, show `GET /wall`, `end`.

## Host API (`x-host-key` header)

| | |
|---|---|
| `GET /host/state` | live counts (joined/online per team, picks, guesses). Never shows the distribution before reveal |
| `GET /host/players`, `/host/rounds/:n`, `/host/ranking`, `/host/results` | details; `results` is the export for F08 |
| `POST /host/joining/open` | open the room |
| `POST /host/opening {percent}` | the x% from station 0 |
| `POST /host/rounds/:n/open-pick` · `open-guess` · `reveal` | rounds must go in order |
| `POST /host/rounds/:n/void {voided?}` | cancel an odd round (excluded from scores) |
| `POST /host/rounds/:n/excuse {playerId, excused?}` | excuse a player; recomputes a revealed round |
| `POST /host/announce/start` · `announce/next` | winner reveal |
| `POST /host/reflection/open` · `close`, `GET /host/reflections`, `POST /host/reflections/:id/approve {approved}` | moderation |
| `POST /host/end` | |

Public: `GET /health`, `GET /state`, `GET /wall` (approved reflections only).

## Socket.IO events

Client → server (each returns an ack `{ok, data}` or `{ok:false, error}`):

- `player:join {code, name, team, playerId?}` → `{playerId, team, joinedRound, state}`. Store `playerId` in `localStorage` and send it again to rejoin after a dropped connection.
- `answer:pick {round, option}`, `answer:guess {round, value}` (0–100; may be overwritten while the step is open)
- `reflection:submit {text}` (one per player)
- `host:join {key}` → then receives `host:stats`

Server → client: `state` (public state to everyone), `round:reveal` (personal result: your guess, the real %, your score, class distribution, opening x→y comparison, correct option), `host:stats`.

## Rules implemented (and where they came from)

- Only step 2 is scored: `score = max(0, 100 − |guess − actual|)`; `actual` counts **other teams only**.
- Personal score = mean of scored rounds; team score = mean of its members.
- Late joiner is scored from the first round they could still pick in (`joinedRound`). Excused rounds are dropped, not counted as 0.
- **Decision I took (you had not chosen yet):** in the room and **online** when the guess step closes but no guess → **0**; **offline** at that moment → **excused automatically**. The MC can still excuse anyone (`excuse`).
- Tie-break: deviation at decision 2, then overall mean deviation, then team number. **The "câu đoán nhanh" tie-break from v03b is not implemented** (I do not have its rules).
- Reflections are stored without any player id; only approved ones are public.
- Round texts live in `src/content/content.json` (mirrors script v03, station 9B); edit it when the script changes.
