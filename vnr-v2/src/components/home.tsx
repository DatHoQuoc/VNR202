import Link from 'next/link';
import { SKILLS } from '@/game/skills';

/** Public front page: explains the game and sends people to the player or admin entrance. */
export function Home() {
  return (
    <main className="shell landing">
      <header className="topbar"><span className="brand"><span className="brand-mark">♞</span> CÁ NGỰA CÁCH MẠNG</span><span className="muted">VNR202 · Chương I · phiên bản 2</span></header>
      <section className="hero">
        <div>
          <p className="eyebrow">LỊCH SỬ ĐẢNG CỘNG SẢN VIỆT NAM · ÔN TẬP THEO ĐỘI</p>
          <h1>Đưa ngựa về đích <em>3/2/1930</em></h1>
          <p className="lead">Sáu đội cùng đua trên một bản đồ cá ngựa. Mỗi người có một con ngựa, mỗi lượt đổ xúc xắc và trả lời một câu hỏi về sự ra đời của Đảng và Cương lĩnh chính trị đầu tiên. Đúng thì nhận <b>thẻ kỹ năng</b> để tăng tốc hoặc chặn đường đối thủ.</p>
        </div>
        <div className="stack entrances">
          <Link href="/play" className="entrance player"><span className="entrance-icon">🐴</span><b>Tôi là người chơi</b><small>Nhập mã phòng, chọn đội và điều khiển ngựa của bạn.</small></Link>
          <Link href="/admin" className="entrance admin"><span className="entrance-icon">🛠️</span><b>Tôi là quản trị</b><small>Đăng nhập, tạo phòng, bắt đầu và điều khiển ván đấu, mở màn chiếu.</small></Link>
          <Link href="/cards" className="text-link">Xem 10 thẻ kỹ năng →</Link>
        </div>
      </section>
      <section className="rules">
        <div className="panel">
          <h2>Luật chơi</h2>
          <ol>
            <li><b>6 đội</b> (màu cố định). Mỗi người vào đội có <b>một con ngựa riêng</b>, tối đa 6 người mỗi đội. Các thành viên trong đội lần lượt đến lượt.</li>
            <li><b>Xuất chuồng:</b> tung <b>1 hoặc 6</b> (hoặc chỉ 6 nếu chọn luật cổ điển) mới đưa ngựa ra ô xuất phát ★.</li>
            <li>Mỗi lượt: (tuỳ chọn) dùng <b>1 thẻ kỹ năng</b> → <b>đổ xúc xắc</b> → trả lời <b>1 câu hỏi</b>. <b>Đúng</b>: nhận <b>1 thẻ</b>. <b>Sai / hết giờ</b>: không có thẻ nhưng ngựa vẫn đi.</li>
            <li><b>Đá ngựa:</b> đáp xuống ô có ngựa đội khác (trừ ô ★ an toàn) thì ngựa đó bị <b>đá về chuồng</b>. Tung 6, đá ngựa hoặc về đích được <b>tung thêm lượt</b> (tối đa 2 lần liên tiếp).</li>
            <li>Đi hết một vòng rồi rẽ vào <b>đường về nhà</b> (không ai đá được). Đội có đủ số ngựa về đích trước (mặc định 1) thắng.</li>
          </ol>
        </div>
        <div className="panel">
          <h2>10 thẻ kỹ năng</h2>
          <ul className="skill-legend">
            {SKILLS.map((s) => <li key={s.kind}><span>{s.icon}</span><div><b>{s.name}</b> <small>×{s.copies}</small><br /><small>{s.description}</small></div></li>)}
          </ul>
        </div>
      </section>
    </main>
  );
}
