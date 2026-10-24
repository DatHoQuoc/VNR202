import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cá Ngựa Cách Mạng · VNR202',
  description: 'Trò chơi cá ngựa 6 đội ôn tập Chương I: Đảng Cộng sản Việt Nam ra đời và Cương lĩnh chính trị đầu tiên.'
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
