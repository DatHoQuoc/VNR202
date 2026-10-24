import type { SkillKind } from './types.ts';

export interface SkillDefinition {
  kind: SkillKind;
  name: string;
  icon: string;
  /** When it can be played: before rolling, or while the question is open. */
  timing: 'roll' | 'question';
  target: 'enemy' | 'self';
  copies: number;
  description: string;
  /** Link back to the lecture content so the cards teach as well as play. */
  theme: string;
}

export const SKILLS: SkillDefinition[] = [
  { kind: 'stun', name: 'Chia Để Trị', icon: '✂️', timing: 'roll', target: 'enemy', copies: 3,
    description: 'Đội bị chọn mất lượt kế tiếp.', theme: 'Pháp chia ba kỳ để phá khối đoàn kết dân tộc.' },
  { kind: 'barricade', name: 'Thuế Khóa Nặng Nề', icon: '🚧', timing: 'roll', target: 'enemy', copies: 3,
    description: 'Lần di chuyển kế tiếp của đội bị chọn tối đa 2 bước.', theme: 'Chế độ thuế khóa và bóc lột hà khắc của thực dân Pháp.' },
  { kind: 'push-back', name: 'Đàn Áp Khởi Nghĩa', icon: '⏪', timing: 'roll', target: 'enemy', copies: 3,
    description: 'Đẩy ngựa của đội bị chọn lùi 4 ô (chỉ khi còn trên vòng đua).', theme: 'Khởi nghĩa Yên Bái bị dập tắt nhanh chóng.' },
  { kind: 'swap', name: 'Hoán Đổi Vận Mệnh', icon: '🔄', timing: 'roll', target: 'enemy', copies: 2,
    description: 'Đổi vị trí với một ngựa khác (cả hai phải còn trên vòng đua).', theme: 'Vận mệnh dân tộc có thể đổi thay khi có đường lối đúng.' },
  { kind: 'steal', name: 'Mua Chuộc', icon: '🕵️', timing: 'roll', target: 'enemy', copies: 2,
    description: 'Lấy ngẫu nhiên 1 thẻ kỹ năng từ tay đội bị chọn.', theme: 'Albert Sarraut nhiều lần tìm cách mua chuộc Nguyễn Ái Quốc.' },
  { kind: 'boost', name: 'Đường Cách Mệnh', icon: '🚩', timing: 'roll', target: 'self', copies: 3,
    description: 'Lần di chuyển kế tiếp được cộng thêm 3 bước.', theme: 'Tác phẩm Đường cách mệnh (1927) chỉ rõ con đường, mục tiêu, lực lượng.' },
  { kind: 'double-dice', name: 'Nhãn Quan Sắc Bén', icon: '🎲', timing: 'roll', target: 'self', copies: 2,
    description: 'Lần đổ kế tiếp tung 2 xúc xắc, lấy số cao hơn.', theme: 'Nhãn quan chính trị sắc bén của Nguyễn Ái Quốc.' },
  { kind: 'shield', name: 'Chủ Nghĩa Làm Cốt', icon: '🛡️', timing: 'roll', target: 'self', copies: 3,
    description: 'Chặn kỹ năng đối kháng kế tiếp nhắm vào đội mình.', theme: '“Đảng muốn vững thì phải có chủ nghĩa làm cốt.”' },
  { kind: 'hint', name: 'Soi Sáng', icon: '💡', timing: 'question', target: 'self', copies: 3,
    description: 'Mở dòng gợi ý của câu hỏi hiện tại.', theme: 'Chủ nghĩa Mác - Lênin soi đường cho cách mạng.' },
  { kind: 'fifty', name: 'Thu Hẹp Vòng Vây', icon: '🎯', timing: 'question', target: 'self', copies: 2,
    description: 'Loại 2 phương án sai của câu hỏi hiện tại.', theme: 'Loại bỏ các con đường không dẫn tới giải phóng dân tộc.' }
];

export const skillByKind = Object.fromEntries(SKILLS.map((s) => [s.kind, s])) as Record<SkillKind, SkillDefinition>;
