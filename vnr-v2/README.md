# Cá Ngựa Cách Mạng · VNR202 · phiên bản 2

Game cá ngựa **tối đa 6 người chơi, mỗi người một con ngựa** ôn tập *Chương I – Đảng Cộng sản Việt Nam ra đời và Cương lĩnh chính trị đầu tiên (2/1930)*. Phát triển từ game thẻ bài "Đấu Trường Tri Thức" (v1, thư mục gốc của repo): v1 là 2 đội đấu máu (HP), v2 là cuộc đua 6 đội về đích.

## Luật chơi (đã đối chiếu luật cờ cá ngựa / Ludo phổ biến)

Nguồn luật tham khảo: [mytour.vn](https://mytour.vn/vi/blog/bai-viet/co-dua-ngua.html), [fptshop.com.vn](https://fptshop.com.vn/tin-tuc/thu-thuat/cach-choi-co-ca-ngua-156472), [Wikipedia: Ludo](https://en.wikipedia.org/wiki/Ludo), [rarepike.com](https://rarepike.com/ludo/articles/rules-for-beginners/). Các nguồn khác nhau ở vài chi tiết nên bản này chọn như dưới đây.

0. **Đội và ngựa:** có 6 đội, màu cố định (Đỏ, Cam, Vàng, Lục, Lam, Tím). Vào phòng, mỗi người nhập tên rồi chọn một đội; **mỗi người có một con ngựa riêng** (đội 1-6 người). Thành viên trong đội lần lượt đến lượt; thẻ kỹ năng là của cả đội.
1. **Bản đồ:** hình sao 6 cánh, vòng đua chung **42 ô**, mỗi đội có **chuồng** (đặt ngựa), **ô xuất phát ★** ở đầu cánh và **đường về nhà 4 ô** riêng. Xúc xắc đặt ở giữa bàn. Ngựa đi một vòng đầy đủ rồi rẽ vào đường về nhà.
2. **Xuất chuồng:** ngựa ở chuồng phải tung **1 hoặc 6** mới ra ô xuất phát (phòng có thể chọn "chỉ 6" – luật cổ điển). Không ra được vẫn được trả lời câu hỏi để nhận thẻ.
3. **Mỗi lượt:** (tuỳ chọn) dùng **1 thẻ kỹ năng** → **đổ xúc xắc** → trả lời **1 câu hỏi 4 đáp án** (mặc định 30 giây). **Đúng**: nhận **1 thẻ kỹ năng**. **Sai / hết giờ**: không có thẻ nhưng ngựa **vẫn đi tiếp**.
4. **Đá ngựa:** đáp xuống ô có ngựa đội khác (trừ 6 ô ★ an toàn) thì **ngựa đó bị đá về chuồng** (hiệu ứng "ĐÁ!"). Ngựa cùng đội đứng chung ô được. Không cần tung đúng số để về đích.
5. **Tung thêm lượt:** tung 6, đá được ngựa, hoặc đưa ngựa về đích → cùng người đó tung tiếp (tối đa 2 lần liên tiếp).
6. **Thắng:** đội đầu tiên có đủ số ngựa về đích (mặc định **1**, chọn 1-3 hoặc tất cả khi tạo phòng) thắng. Tay tối đa 5 thẻ.
7. Ngựa đi qua mỗi chặng sẽ bật một **mốc lịch sử** (1858, 1911, 1920, 1925, 1929) lấy từ chương.

### 10 thẻ kỹ năng (26 thẻ trong bộ bài)

| Thẻ | Loại | Hiệu ứng | Gắn với nội dung bài |
|---|---|---|---|
| ✂️ Chia Để Trị ×3 | Chặn đối thủ | Đội bị chọn **mất lượt** kế tiếp | Pháp chia ba kỳ |
| 🚧 Thuế Khóa Nặng Nề ×3 | Chặn đối thủ | Lần đi kế tiếp của đối thủ **tối đa 2 bước** | Thuế khóa, bóc lột |
| ⏪ Đàn Áp Khởi Nghĩa ×3 | Chặn đối thủ | **Ngựa đang dẫn đầu của đội đó lùi 4 ô** (chỉ khi còn trên vòng đua) | Khởi nghĩa Yên Bái bị dập |
| 🔄 Hoán Đổi Vận Mệnh ×2 | Chặn đối thủ | **Đổi chỗ** ngựa đang chơi của bạn với ngựa dẫn đầu của đội đó (cả hai trên vòng đua) | Đổi thay khi có đường lối đúng |
| 🕵️ Mua Chuộc ×2 | Chặn đối thủ | **Lấy ngẫu nhiên 1 thẻ** trên tay đối thủ | Sarraut mua chuộc Nguyễn Ái Quốc |
| 🚩 Đường Cách Mệnh ×3 | Tự thân | Lần đi kế tiếp **+3 bước** | Tác phẩm *Đường cách mệnh* |
| 🎲 Nhãn Quan Sắc Bén ×2 | Tự thân | Đổ 2 xúc xắc, lấy số cao | Nhãn quan chính trị sắc bén |
| 🛡️ Chủ Nghĩa Làm Cốt ×3 | Tự thân | **Khiên**: chặn kỹ năng đối kháng kế tiếp nhắm vào mình | "Đảng muốn vững thì phải có chủ nghĩa làm cốt" |
| 💡 Soi Sáng ×3 | Hỗ trợ khi trả lời | Mở gợi ý | |
| 🎯 Thu Hẹp Vòng Vây ×2 | Hỗ trợ khi trả lời | Loại 2 đáp án sai | |

Thẻ nhắm vào **đội** đối thủ. Thẻ chặn đối thủ dùng **trước khi đổ xúc xắc** (1 thẻ/lượt). Thẻ hỗ trợ dùng **trong lúc trả lời**.

**Xem thẻ và câu hỏi:** `/cards` hiển thị cả 10 lá bài kích thước lớn (công khai). `/rooms/<mã>/cards` thêm ngân hàng câu hỏi kèm đáp án, có tìm kiếm và tải JSON; **chỉ người điều khiển phòng** xem được (API trả 403 với người khác). Trong phòng có liên kết “Thẻ & câu hỏi”.

**Giao diện 2.5D (chỉ tối ưu cho laptop/PC, không có bố cục điện thoại):** bàn diorama bãi cỏ nghiêng trên nền trời (CSS perspective) với bản đồ 6 cánh, ô gạch kem, ô xuất phát ★ màu đội, đường về nhà đánh số, chuồng ngựa, cây cối đứng thẳng; quân ngựa hình đầu ngựa nhảy khi đến lượt, bị đá thì bay về chuồng kèm chữ “ĐÁ!” và rung bàn; xúc xắc ở giữa bàn; bàn thẻ dưới bàn cờ (bộ bài, thẻ vừa dùng, luật xuất chuồng); thẻ trên tay xòe như bộ bài, đối thủ chỉ thấy lưng bài.

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
