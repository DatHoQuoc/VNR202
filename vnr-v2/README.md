# Cá Ngựa Cách Mạng · VNR202 · phiên bản 2

Game cá ngựa **tối đa 6 người chơi, mỗi người một con ngựa** ôn tập *Chương I – Đảng Cộng sản Việt Nam ra đời và Cương lĩnh chính trị đầu tiên (2/1930)*. Phát triển từ game thẻ bài "Đấu Trường Tri Thức" (v1, thư mục gốc của repo): v1 là 2 đội đấu máu (HP), v2 là cuộc đua 6 đội về đích.

## Luật chơi (đã đối chiếu luật cờ cá ngựa / Ludo phổ biến)

Nguồn luật tham khảo: [mytour.vn](https://mytour.vn/vi/blog/bai-viet/co-dua-ngua.html), [fptshop.com.vn](https://fptshop.com.vn/tin-tuc/thu-thuat/cach-choi-co-ca-ngua-156472), [Wikipedia: Ludo](https://en.wikipedia.org/wiki/Ludo), [rarepike.com](https://rarepike.com/ludo/articles/rules-for-beginners/). Các nguồn khác nhau ở vài chi tiết nên bản này chọn như dưới đây.

0. **Đội và ngựa:** có 6 đội, màu cố định (Đỏ, Cam, Vàng, Lục, Lam, Tím). Vào phòng, mỗi người nhập tên rồi chọn một đội (1-6 người/đội). **Mỗi đội có 2 hoặc 3 ngựa dùng chung** (quản trị chọn khi tạo phòng). Các thành viên lần lượt đến lượt đổ xúc xắc và trả lời; thẻ kỹ năng là của cả đội.
1. **Bản đồ:** hình sao 6 cánh, vòng đua chung **30 ô**, mỗi đội có **chuồng**, **ô xuất phát ★** ở đầu cánh và **đường về nhà 3 ô** riêng (tổng 33 bước mỗi ngựa). Hai xúc xắc đặt giữa bàn. Ngựa đi một vòng đầy đủ rồi rẽ vào đường về nhà.
2. **Hai xúc xắc:** ngựa đi theo **tổng hai viên**. Mỗi đội bắt đầu với **1 ngựa đã ở ô xuất phát**; ngựa trong chuồng cần **ít nhất một viên ra 1 hoặc 6** để xuất chuồng (phòng có thể chọn "chỉ 6" – luật cổ điển). Lượt xuất chuồng không đi thêm bước.
3. **Mỗi lượt:** (tuỳ chọn) dùng **1 thẻ kỹ năng** → **đổ xúc xắc** → trả lời **1 câu hỏi 4 đáp án** (mặc định 25 giây) → **chọn ngựa đi** (12 giây; hết giờ hệ thống chọn: ưu tiên đá ngựa, về đích, xuất chuồng, ngựa dẫn đầu; chỉ có một lựa chọn thì tự đi). **Đúng**: nhận **1 thẻ kỹ năng**. **Sai / hết giờ**: không có thẻ nhưng ngựa **vẫn đi tiếp**. Màn chọn ngựa hiện trước kết quả: ô đi tới, "ĐÁ n ngựa", "VỀ ĐÍCH".
4. **Đá ngựa:** đáp xuống ô có ngựa đội khác (trừ 6 ô ★ an toàn) thì **ngựa đó bị đá về chuồng** (hiệu ứng "ĐÁ!"). Ngựa cùng đội đứng chung ô được. Không cần tung đúng số để về đích.
5. **Tung thêm lượt:** hai viên giống nhau (đôi), đá được ngựa, hoặc đưa ngựa về đích → cùng người đó tung tiếp (tối đa 2 lần liên tiếp).
6. **Thắng:** đội đầu tiên đưa đủ số ngựa về đích (mặc định **2**; chọn 1-3 khi tạo phòng) thắng. **Ván có giới hạn thời gian 10-20 phút** (mặc định 18, có đồng hồ ⏱ trên đầu trang, tạm dừng thì dừng đồng hồ); hết giờ, đội có nhiều ngựa về đích nhất (rồi đến tổng bước đi) thắng. Tay tối đa 5 thẻ.
7. Ngựa đi qua mỗi chặng sẽ bật một **mốc lịch sử** (1858, 1911, 1920, 1925, 1929) lấy từ chương.

**Nhịp ván (mô phỏng 40 ván với bot, 6 đội × 2 ngựa, ~18 giây/lượt):** trung vị 49 lượt ≈ 15 phút, p90 61 lượt ≈ 18 phút. 3 ngựa/đội: trung vị 64 lượt ≈ 19 phút. Số lượt tăng theo số đội, nên ít đội thì ván ngắn hơn; giới hạn thời gian bảo đảm không bao giờ vượt quá mức đã chọn.

### 10 thẻ kỹ năng (26 thẻ trong bộ bài)

| Thẻ | Loại | Hiệu ứng | Gắn với nội dung bài |
|---|---|---|---|
| ✂️ Chia Để Trị ×3 | Chặn đối thủ | **Cả đội** của ngựa được chọn mất lượt kế tiếp | Pháp chia ba kỳ |
| 🚧 Thuế Khóa Nặng Nề ×3 | Chặn đối thủ | Lần đi kế tiếp của **con ngựa được chọn** tối đa 3 bước | Thuế khóa, bóc lột |
| ⏪ Đàn Áp Khởi Nghĩa ×3 | Chặn đối thủ | **Ngựa được chọn lùi 5 ô** (chỉ khi còn trên vòng đua) | Khởi nghĩa Yên Bái bị dập |
| 🔄 Hoán Đổi Vận Mệnh ×2 | Chặn đối thủ | **Đổi chỗ** ngựa dẫn đầu vòng đua của bạn với ngựa được chọn | Đổi thay khi có đường lối đúng |
| 🕵️ Mua Chuộc ×2 | Chặn đối thủ | **Lấy ngẫu nhiên 1 thẻ** từ tay đội của ngựa được chọn | Sarraut mua chuộc Nguyễn Ái Quốc |
| 🚩 Đường Cách Mệnh ×3 | Tự thân | Lần đi kế tiếp **+4 bước** | Tác phẩm *Đường cách mệnh* |
| 🎲 Nhãn Quan Sắc Bén ×2 | Tự thân | Tung hai lần, lấy tổng cao hơn | Nhãn quan chính trị sắc bén |
| 🛡️ Chủ Nghĩa Làm Cốt ×3 | Tự thân | **Khiên**: chặn kỹ năng đối kháng kế tiếp nhắm vào mình | "Đảng muốn vững thì phải có chủ nghĩa làm cốt" |
| 💡 Soi Sáng ×3 | Hỗ trợ khi trả lời | Mở gợi ý | |
| 🎯 Thu Hẹp Vòng Vây ×2 | Hỗ trợ khi trả lời | Loại 2 đáp án sai | |

**Chọn mục tiêu:** khi bấm một thẻ chặn đối thủ, màn hình “Chọn mục tiêu” hiện tất cả ngựa của các đội khác (vị trí, số thẻ của đội, có khiên hay không, lý do không chọn được); rê chuột lên ngựa nào thì ngựa đó sáng lên trên bàn cờ. **Ai dùng thẻ gì** hiện cho cả phòng bằng hiệu ứng lá bài lớn giữa bàn, ô “Thẻ vừa dùng” dưới bàn và bảng “Thẻ kỹ năng đã dùng”. **Số thẻ** của mỗi đội hiện trên bàn cờ (🃏n) và trong bảng xếp hạng. Thẻ chặn đối thủ dùng **trước khi đổ xúc xắc** (1 thẻ/lượt). Thẻ hỗ trợ dùng **trong lúc trả lời**.

**Xem thẻ và câu hỏi:** `/cards` hiển thị cả 10 lá bài kích thước lớn (công khai). `/admin/rooms/<mã>/cards` thêm ngân hàng câu hỏi kèm đáp án, có tìm kiếm và tải JSON; **chỉ quản trị đã đăng nhập** xem được (API trả 401 với người khác). Trong trang điều khiển phòng có liên kết “Thẻ & câu hỏi”.

**Giao diện 2.5D (chỉ tối ưu cho laptop/PC, không có bố cục điện thoại):** bàn diorama bãi cỏ nghiêng trên nền trời (CSS perspective) với bản đồ 6 cánh, ô gạch kem, ô xuất phát ★ màu đội, đường về nhà đánh số, chuồng ngựa, cây cối đứng thẳng; quân ngựa hình đầu ngựa nhảy khi đến lượt, bị đá thì bay về chuồng kèm chữ “ĐÁ!” và rung bàn; xúc xắc ở giữa bàn; bàn thẻ dưới bàn cờ (bộ bài, thẻ vừa dùng, luật xuất chuồng); thẻ trên tay xòe như bộ bài, đối thủ chỉ thấy lưng bài.

## Màn hình và phân quyền

| Địa chỉ | Dành cho | Nội dung |
|---|---|---|
| `/` | Mọi người | Giới thiệu luật, 10 thẻ, hai cổng vào: người chơi / quản trị |
| `/play` (và `/join?code=`) | **Người chơi** | Nhập mã phòng → vào phòng |
| `/rooms/<mã>` | **Người chơi** | Nhập tên, chọn đội, chơi (đổ xúc xắc, trả lời, dùng thẻ). Không có quyền điều khiển |
| `/admin` | **Quản trị** (mật khẩu) | Đăng nhập, **tạo phòng**, danh sách phòng đang mở (trạng thái, số người), mở/xóa phòng |
| `/admin/rooms/<mã>` | **Quản trị** | Điều khiển phòng: xóa người chơi, bắt đầu, tạm dừng, kết thúc, chơi lại; không chơi |
| `/admin/rooms/<mã>/cards` | **Quản trị** | Thẻ kỹ năng và ngân hàng câu hỏi kèm đáp án |
| `/rooms/<mã>/board` | Màn chiếu lớp | Chỉ xem, không đáp án, không bài trên tay |
| `/cards` | Mọi người | 10 lá bài kỹ năng |

Mật khẩu quản trị là biến môi trường `ADMIN_PASSWORD` của backend (từ 6 ký tự). Nếu bỏ trống, backend tự sinh mật khẩu tạm và in ra log khi khởi động. Phiên đăng nhập là cookie httpOnly có chữ ký, hết hạn sau 12 giờ; nhập sai quá 8 lần trong 5 phút thì bị chặn tạm thời. API quản trị nằm dưới `/api/admin/*` và trả 401 nếu chưa đăng nhập; API người chơi `/api/rooms/*` không có lệnh tạo phòng hay điều khiển.

## Kiến trúc: Next.js (giao diện) + NestJS (backend)

```
vnr-v2/
├─ src/app, src/components   Next.js 16: trang chủ, /play, /admin, phòng, màn chiếu
├─ src/game                  Luật chơi thuần TypeScript (engine, 10 thẻ, 40 câu hỏi), dùng chung FE/BE/test
├─ src/shared/room-core.ts   Logic phòng/đội/phân quyền, projectRoom (ẩn đáp án và tay bài đối thủ)
├─ backend/                  NestJS 11: AdminModule (đăng nhập, quản lý phòng), RoomsModule (người chơi), ErrorFilter
├─ slides/                   Bộ slide showcase 12 trang theo template FA26 + đánh giá
└─ tests/                    engine.test.ts (22 test), load.mjs (30 client)
```

* Trình duyệt chỉ nói chuyện với Next; Next **rewrite `/api/*` sang NestJS** (`BACKEND_URL`, mặc định `http://localhost:4000`) nên cookie là first-party, không cần CORS.
* NestJS giữ phòng trong bộ nhớ và xử lý mọi lệnh **đồng bộ, tuần tự**, nên không có race giữa các đội. Phòng tự dọn sau 12 giờ.
* Đáp án đúng **không bao giờ rời server** trước khi lượt kết thúc; tay bài chỉ gửi cho chính đội đó; lệnh ghi đòi `Content-Type: application/json` (chặn CSRF cross-site).
* Client lấy trạng thái bằng polling 1 giây. Đo thử 6 đội + 24 khán giả (30 client) qua proxy Next: p50 ≈ 4 ms, p99 ≈ 100 ms (`ADMIN_PASSWORD=... node tests/load.mjs`). Nếu cần đẩy tức thời hoặc hơn 100 người, thêm NestJS WebSocket Gateway và đổi `useRoom` ở `src/components/client.ts`.
* Muốn chạy nhiều instance: thay `Map` trong `RoomsService` bằng Redis, giữ nguyên các method.

## Chạy

Cần Node.js ≥ 22.13.

```bash
cd vnr-v2
npm install
export ADMIN_PASSWORD='mat-khau-cua-ban'            # Windows PowerShell: $env:ADMIN_PASSWORD='...'
npm run backend:build && npm run backend:start     # terminal 1: NestJS ở :4000
npm run dev                                        # terminal 2: Next ở :3000
```

Production: `npm run build:all`, rồi `npm run backend:start` và `npm start`. Máy khác trong cùng Wi-Fi vào `http://<IP-máy-chủ>:3000`. Nếu backend ở máy khác: `BACKEND_URL=http://host:4000 npm run build`.

Một buổi chơi: quản trị vào `/admin` → đăng nhập → **Tạo phòng** → mở `/rooms/<mã>/board` lên màn hình lớp → người chơi vào `/play`, nhập mã, chọn đội → quản trị bấm **Bắt đầu**. Quản trị có thể tạm dừng, kết thúc sớm (đội dẫn đầu thắng) hoặc chơi lại.

`npm test` chạy 22 test luật chơi (gồm 2 bài kiểm tra nhịp ván bằng bot); `npm run typecheck` kiểm tra cả Next và NestJS.

## Mô phỏng Playwright chạy từ đầu (`e2e/simulate.cjs`)

Kịch bản đóng vai khách, quản trị, 8 người chơi, khán giả và màn chiếu: đăng nhập sai/đúng, tạo phòng, vào đội (tên trùng, tên chứa HTML, đội đầy 6 người, chuyển đội, rời đội, bị admin xóa), bắt đầu, đổ xúc xắc → câu hỏi → trả lời, tạm dừng, tải lại trang, dùng thẻ (chọn mục tiêu, hiệu ứng, bảng thẻ đã dùng), đá ngựa, khán giả vào muộn, chơi đến hết ván, chơi lại, kết thúc sớm, hết giờ, mất kết nối, xóa phòng khi người chơi còn trong phòng, đăng xuất, màn hình 1280×720; kèm các phép thử tấn công (gọi API quản trị khi chưa đăng nhập, người chơi gửi lệnh `start/end/…`, CSRF, đoán mật khẩu, rò rỉ khóa/đáp án trong JSON).

```bash
# backend và frontend đang chạy như phần "Chạy"
ADMIN_PASSWORD=mat-khau BASE=http://localhost:3000 npm run e2e
```

Kết quả nằm trong `screen/`: mỗi màn hình một ảnh `NN-ten.png` và `screen/REPORT.md` (các bước đạt/không đạt, danh sách phát hiện theo mức độ, lỗi console, mục lục ảnh). Cần gói `playwright` (có sẵn trong container đám mây, nơi khác chạy `npm i -D playwright`). Một lần chạy mất khoảng 3-4 phút.

## Ngân hàng câu hỏi

`src/game/questions.ts`: 40 câu trắc nghiệm 4 đáp án, mỗi câu có gợi ý, lời giải thích và số trang (`ref`) theo bản trích Chương I. **Hãy đối chiếu số trang với giáo trình bản của nhóm** trước khi nộp (08_Source_Verification_Log). Thêm câu mới bằng cách thêm một dòng vào mảng `rows`.
