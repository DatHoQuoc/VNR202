# Cá Ngựa Cách Mạng · VNR202 · phiên bản 2

Game cá ngựa **tối đa 6 đội** ôn tập *Chương I – Đảng Cộng sản Việt Nam ra đời và Cương lĩnh chính trị đầu tiên (2/1930)*. Phát triển từ game thẻ bài "Đấu Trường Tri Thức" (v1, thư mục gốc của repo): v1 là 2 đội đấu máu (HP), v2 là cuộc đua 6 đội về đích.

## Luật chơi

1. Mỗi đội một ngựa, xuất phát từ chuồng, chạy **1 vòng đua chung 24 ô** rồi rẽ vào **đường về nhà 4 ô** (an toàn) và tới **ĐÍCH (28 bước)**. Ai về đích trước thắng.
2. Đến lượt: (tuỳ chọn) dùng **1 thẻ kỹ năng** → **đổ xúc xắc** → trả lời **1 câu hỏi 4 đáp án** (mặc định 30 giây).
3. **Trả lời đúng**: đi đúng số ô xúc xắc **và nhận 1 thẻ kỹ năng**. **Sai hoặc hết giờ**: *vẫn đi tiếp* nhưng **không nhận thẻ**.
4. Đáp xuống ô có ngựa đội khác (trừ 6 ô ★) → ngựa đó bị **húc lùi 3 ô**.
5. Tay tối đa 5 thẻ; nhận thẻ thứ 6 thì thẻ cũ nhất bị bỏ.
6. Ngựa đi qua mỗi chặng sẽ bật một **mốc lịch sử** (1858, 1911, 1920, 1925, 1929) lấy từ chương.

### 10 thẻ kỹ năng (26 thẻ trong bộ bài)

| Thẻ | Loại | Hiệu ứng | Gắn với nội dung bài |
|---|---|---|---|
| ✂️ Chia Để Trị ×3 | Chặn đối thủ | Đội bị chọn **mất lượt** kế tiếp | Pháp chia ba kỳ |
| 🚧 Thuế Khóa Nặng Nề ×3 | Chặn đối thủ | Lần đi kế tiếp của đối thủ **tối đa 2 bước** | Thuế khóa, bóc lột |
| ⏪ Đàn Áp Khởi Nghĩa ×3 | Chặn đối thủ | **Lùi 4 ô** (chỉ khi còn trên vòng đua) | Khởi nghĩa Yên Bái bị dập |
| 🔄 Hoán Đổi Vận Mệnh ×2 | Chặn đối thủ | **Đổi chỗ** với một ngựa (cả hai trên vòng đua) | Đổi thay khi có đường lối đúng |
| 🕵️ Mua Chuộc ×2 | Chặn đối thủ | **Lấy ngẫu nhiên 1 thẻ** trên tay đối thủ | Sarraut mua chuộc Nguyễn Ái Quốc |
| 🚩 Đường Cách Mệnh ×3 | Tự thân | Lần đi kế tiếp **+3 bước** | Tác phẩm *Đường cách mệnh* |
| 🎲 Nhãn Quan Sắc Bén ×2 | Tự thân | Đổ 2 xúc xắc, lấy số cao | Nhãn quan chính trị sắc bén |
| 🛡️ Chủ Nghĩa Làm Cốt ×3 | Tự thân | **Khiên**: chặn kỹ năng đối kháng kế tiếp nhắm vào mình | "Đảng muốn vững thì phải có chủ nghĩa làm cốt" |
| 💡 Soi Sáng ×3 | Hỗ trợ khi trả lời | Mở gợi ý | |
| 🎯 Thu Hẹp Vòng Vây ×2 | Hỗ trợ khi trả lời | Loại 2 đáp án sai | |

Thẻ chặn đối thủ dùng **trước khi đổ xúc xắc** (1 thẻ/lượt). Thẻ hỗ trợ dùng **trong lúc trả lời**.

## Kiến trúc: Next.js (giao diện) + NestJS (backend)

```
vnr-v2/
├─ src/app, src/components   Next.js 16: trang chủ, phòng chờ, bàn cờ SVG, màn chiếu (/rooms/<mã>/board)
├─ src/game                  Luật chơi thuần TypeScript (engine, 10 thẻ, 40 câu hỏi), dùng chung FE/BE/test
├─ src/shared/room-core.ts   Logic phòng/đội/phân quyền, projectRoom (ẩn đáp án và tay bài đối thủ)
├─ backend/                  NestJS 11: RoomsModule (controller + service), ErrorFilter
├─ slides/                   Bộ slide showcase 12 trang theo template FA26 + đánh giá
└─ tests/                    engine.test.ts (17 test), load.mjs (30 client)
```

* Trình duyệt chỉ nói chuyện với Next; Next **rewrite `/api/*` sang NestJS** (`BACKEND_URL`, mặc định `http://localhost:4000`) nên cookie là first-party, không cần CORS.
* NestJS giữ phòng trong bộ nhớ và xử lý mọi lệnh **đồng bộ, tuần tự**, nên không có race giữa các đội. Phòng tự dọn sau 12 giờ.
* API: `POST /api/rooms`, `GET /api/rooms/:code`, `POST /api/rooms/:code/join`, `POST /api/rooms/:code/command`.
* Đáp án đúng **không bao giờ rời server**; tay bài chỉ gửi cho chính đội đó; lệnh ghi đòi `Content-Type: application/json` (chặn CSRF cross-site).
* Client lấy trạng thái bằng polling 1 giây. Đo thử 6 đội + 24 khán giả (30 client) qua proxy Next: p50 ≈ 6 ms, p99 ≈ 90 ms (`node tests/load.mjs`). Nếu cần đẩy tức thời hoặc hơn 100 người, thêm NestJS WebSocket Gateway và đổi `useRoom` ở `src/components/client.ts`.
* Muốn chạy nhiều instance: thay `Map` trong `RoomsService` bằng Redis, giữ nguyên các method.

## Chạy

Cần Node.js ≥ 22.13.

```bash
cd vnr-v2
npm install
npm run backend:build && npm run backend:start     # terminal 1: NestJS ở :4000
npm run dev                                        # terminal 2: Next ở :3000
```

Production: `npm run build:all`, rồi `npm run backend:start` và `npm start`. Máy khác trong cùng Wi-Fi vào `http://<IP-máy-chủ>:3000`. Nếu backend ở máy khác: `BACKEND_URL=http://host:4000 npm run build`.

Một buổi chơi: người điều khiển mở trang chủ → **Tạo phòng** → chiếu `/rooms/<mã>/board` lên màn hình lớp → mỗi đội vào bằng mã/liên kết (2–6 đội) → **Bắt đầu**. Người điều khiển có thể tạm dừng, kết thúc sớm (đội dẫn đầu thắng) hoặc chơi lại.

`npm test` chạy 17 test luật chơi; `npm run typecheck` kiểm tra cả Next và NestJS.

## Ngân hàng câu hỏi

`src/game/questions.ts`: 40 câu trắc nghiệm 4 đáp án, mỗi câu có gợi ý, lời giải thích và số trang (`ref`) theo bản trích Chương I. **Hãy đối chiếu số trang với giáo trình bản của nhóm** trước khi nộp (08_Source_Verification_Log). Thêm câu mới bằng cách thêm một dòng vào mảng `rows`.
