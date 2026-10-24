import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const COOKIE = 'vnr_admin';
const SESSION_MS = 12 * 60 * 60 * 1000;

/** Single shared admin password (ADMIN_PASSWORD). Sessions are stateless HMAC tokens in an httpOnly cookie. */
@Injectable()
export class AdminService {
  private readonly log = new Logger('Admin');
  private readonly password: string;
  private readonly secret = randomBytes(32);
  private readonly attempts = new Map<string, { n: number; reset: number }>();

  constructor() {
    const fromEnv = process.env.ADMIN_PASSWORD?.trim();
    if (fromEnv && fromEnv.length >= 6) this.password = fromEnv;
    else {
      this.password = randomBytes(5).toString('hex');
      this.log.warn(`ADMIN_PASSWORD chưa đặt (hoặc ngắn hơn 6 ký tự). Mật khẩu tạm cho lần chạy này: ${this.password}`);
    }
  }

  static readonly cookieName = COOKIE;
  static readonly maxAgeMs = SESSION_MS;

  private sign(expires: number): string {
    return `${expires}.${createHmac('sha256', this.secret).update(String(expires)).digest('base64url')}`;
  }

  /** Returns a session token when the password is right; throttles guesses per client. */
  login(password: string, client: string): string {
    const now = Date.now();
    const slot = this.attempts.get(client);
    if (slot && slot.reset > now && slot.n >= 8) throw new UnauthorizedException('Nhập sai quá nhiều lần. Thử lại sau vài phút.');
    const a = createHmac('sha256', 'cmp').update(password).digest();
    const b = createHmac('sha256', 'cmp').update(this.password).digest();
    if (!timingSafeEqual(a, b)) {
      this.attempts.set(client, { n: slot && slot.reset > now ? slot.n + 1 : 1, reset: slot && slot.reset > now ? slot.reset : now + 5 * 60_000 });
      throw new UnauthorizedException('Sai mật khẩu quản trị.');
    }
    this.attempts.delete(client);
    return this.sign(now + SESSION_MS);
  }

  isValid(token?: string): boolean {
    if (!token) return false;
    const [exp] = token.split('.');
    const expires = Number(exp);
    if (!Number.isFinite(expires) || expires < Date.now()) return false;
    const want = Buffer.from(this.sign(expires));
    const got = Buffer.from(token);
    return want.length === got.length && timingSafeEqual(want, got);
  }
}
