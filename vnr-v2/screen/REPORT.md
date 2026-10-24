# Báo cáo mô phỏng Playwright

Chạy lúc 14:22:29 24/10/2026 · 53 ảnh chụp · 31/31 bước đạt

## Các bước

| # | Bước | Kết quả | Thời gian |
|---|---|---|---|
| 1 | Trang chủ hiển thị hai cổng vào | ✅ | 0.4s |
| 2 | /cards công khai hiển thị 10 lá bài | ✅ | 0.3s |
| 3 | /play: mã phòng không tồn tại báo lỗi rõ ràng | ✅ | 0.3s |
| 4 | /rooms/ZZZZZ (mã sai gõ thẳng) không bị trắng trang | ✅ | 0.2s |
| 5 | Admin: đăng nhập sai mật khẩu bị từ chối, đúng thì vào bảng điều khiển | ✅ | 0.7s |
| 6 | Admin: tạo phòng và vào trang điều khiển (phòng chờ trống) | ✅ | 0.4s |
| 7 | Admin mở màn chiếu và trang thẻ & câu hỏi | ✅ | 0.8s |
| 8 | Bảo mật: API quản trị không dùng được khi chưa đăng nhập | ✅ | 0.1s |
| 9 | Bảo mật: giới hạn đăng nhập sai liên tiếp | ✅ | 0.0s |
| 10 | Người chơi chưa chọn đội thấy phòng chờ; tên quá ngắn không bấm được | ✅ | 0.5s |
| 11 | Người chơi: tên trùng, tên chứa HTML, chuyển đội, rời đội | ✅ | 3.6s |
| 12 | Phòng chờ: 8 người vào 6 đội (2,2,1,1,1,1) bằng giao diện | ✅ | 6.5s |
| 13 | Admin xóa một người chơi; người đó thấy mình bị gỡ | ✅ | 3.8s |
| 14 | Phòng đầy 6 người: người thứ 7 bị từ chối | ✅ | 2.9s |
| 15 | Bảo mật: người chơi không gửi được lệnh quản trị | ✅ | 0.1s |
| 16 | Admin bắt đầu ván; người chơi và màn chiếu tự chuyển sang bàn cờ | ✅ | 2.9s |
| 17 | Chỉ người đến lượt mới có nút đổ xúc xắc / đáp án | ✅ | 0.6s |
| 18 | Một vòng chơi bằng giao diện: đổ xúc xắc → câu hỏi → trả lời → kết quả | ✅ | 4.0s |
| 19 | Admin tạm dừng: người chơi không thao tác được, tiếp tục thì chơi lại được | ✅ | 2.3s |
| 20 | Tải lại trang giữa ván: người chơi vẫn giữ đội (cookie) và thấy bài của mình | ✅ | 0.6s |
| 21 | Dùng thẻ kỹ năng: chọn mục tiêu, hiệu ứng lá bài, bảng thẻ đã dùng | ✅ | 15.1s |
| 22 | Thẻ hỗ trợ khi trả lời (Soi Sáng / Thu Hẹp) dùng được đúng lúc | ✅ | 7.7s |
| 23 | Đá ngựa: hiệu ứng "ĐÁ!" và ngựa bị đá về chuồng | ✅ | 5.4s |
| 24 | Khán giả vào giữa ván chỉ xem được, không có điều khiển | ✅ | 4.6s |
| 25 | Chơi đến hết ván: màn hình người thắng cho người chơi / admin / màn chiếu | ✅ | 7.5s |
| 26 | Admin chơi lại ván mới với cùng các đội | ✅ | 1.1s |
| 27 | Admin kết thúc sớm: đội dẫn đầu thắng | ✅ | 2.8s |
| 28 | Hết giờ: không đổ xúc xắc → hệ thống đổ thay; không trả lời → tính là hết giờ (phòng riêng) | ✅ | 39.7s |
| 29 | Mất kết nối: người đến lượt thoát giữa chừng thì hệ thống tự chơi thay (không treo cả bàn) | ✅ | 30.1s |
| 30 | Admin đăng xuất: trang điều khiển phòng yêu cầu đăng nhập lại | ✅ | 0.5s |
| 31 | Màn hình laptop nhỏ 1280x720: bàn cờ và bảng điều khiển không bị cắt | ✅ | 1.3s |

## Phát hiện (0)

Không phát hiện vấn đề.

## Lỗi console / pageerror (10)

- [khách] console: Failed to load resource: the server responded with a status of 404 (Not Found)
- [admin] console: Failed to load resource: the server responded with a status of 401 (Unauthorized)
- [tên trùng] console: Failed to load resource: the server responded with a status of 400 (Bad Request)
- [Lan] console: Failed to load resource: the server responded with a status of 400 (Bad Request)
- [Minh] console: Failed to load resource: the server responded with a status of 400 (Bad Request)
- [Hà] console: Failed to load resource: the server responded with a status of 400 (Bad Request)
- [khán giả muộn] console: Failed to load resource: the server responded with a status of 400 (Bad Request)
- [hết giờ 1] console: Failed to load resource: the server responded with a status of 404 (Not Found)
- [hết giờ 0] console: Failed to load resource: the server responded with a status of 404 (Not Found)
- [offline 1] console: Failed to load resource: the server responded with a status of 404 (Not Found)

## Ảnh chụp

- 01-trang-chu.png
- 02-cards-cong-khai.png
- 03-play-trong.png
- 04-play-ma-sai.png
- 05-phong-khong-ton-tai.png
- 06-admin-dang-nhap.png
- 07-admin-sai-mat-khau.png
- 08-admin-bang-dieu-khien.png
- 09-admin-phong-cho-trong.png
- 10-man-chieu-phong-cho.png
- 11-admin-the-va-cau-hoi.png
- 12-nguoi-choi-phong-cho-chua-ten.png
- 13-nguoi-choi-da-vao-doi-ten-html.png
- 14-ten-trung-bao-loi.png
- 15-nguoi-choi-chuyen-doi.png
- 16-nguoi-choi-roi-doi.png
- 17-admin-phong-cho-day-du.png
- 18-nguoi-choi-phong-cho-day-du.png
- 19-man-chieu-phong-cho-day-du.png
- 20-nguoi-bi-xoa-nhin-thay-gi.png
- 21-admin-doi-day-6-nguoi.png
- 22-admin-bat-dau-van.png
- 23-nguoi-choi-bat-dau-van.png
- 24-man-chieu-bat-dau-van.png
- 25-cho-luot-nguoi-khac.png
- 26-den-luot-ban-truoc-khi-do.png
- 27-dang-tra-loi-cau-hoi.png
- 28-nguoi-khac-xem-cau-hoi.png
- 29-man-chieu-dang-hoi.png
- 30-ket-qua-luot.png
- 31-tam-dung-nhin-tu-nguoi-choi.png
- 32-tam-dung-nhin-tu-admin.png
- 33-tai-lai-trang-giua-van.png
- 34-tay-bai-co-the.png
- 35-chon-muc-tieu-skill.png
- 36-hieu-ung-lat-the-tren-ban.png
- 37-man-chieu-hieu-ung-the.png
- 38-bang-the-da-dung.png
- 39-dung-the-ho-tro-khi-tra-loi.png
- 40-da-ngua-hieu-ung.png
- 41-man-chieu-da-ngua.png
- 42-khan-gia-vao-muon.png
- 43-ket-thuc-admin.png
- 44-ket-thuc-nguoi-choi.png
- 45-ket-thuc-man-chieu.png
- 46-choi-lai-van-moi.png
- 47-admin-ket-thuc-som.png
- 48-het-gio-ket-qua.png
- 49-phong-bi-xoa-nhin-tu-nguoi-choi.png
- 50-mat-ket-noi-he-thong-choi-thay.png
- 51-admin-danh-sach-phong.png
- 52-admin-het-phien.png
- 53-laptop-1280x720.png