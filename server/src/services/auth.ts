import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import { getSettings, updateSettings } from './settings.js';
import { config } from '../config.js';

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

/** Mật khẩu mặc định khi cài đặt — dùng được ngay, không cần bước setup. */
export const DEFAULT_PASSWORD = '123456';
export const MIN_PASSWORD_LEN = 6;

/** So sánh chuỗi an toàn về timing (cho override pass dạng plaintext). */
function safeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** scrypt$<saltHex>$<hashHex> */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/**
 * Luôn true: hệ thống luôn có mật khẩu đăng nhập hiệu dụng (tối thiểu là mặc
 * định 123456). Giữ lại cho `/auth/status` và endpoint setup legacy.
 */
export async function isPasswordSet(): Promise<boolean> {
  return true;
}

/** Đã đổi pass khỏi mặc định chưa? */
export async function hasCustomPassword(): Promise<boolean> {
  const s = await getSettings();
  return Boolean(s.auth.userPasswordHash);
}

/** Lưu mật khẩu người dùng mới (ghi đè pass mặc định/pass cũ). */
export async function setUserPassword(password: string): Promise<void> {
  if (password.length < MIN_PASSWORD_LEN) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LEN} characters`);
  }
  const hash = await hashPassword(password);
  await updateSettings((d) => {
    d.auth.userPasswordHash = hash;
  });
}

/**
 * True when an operator override password is configured — WEBOBSIDIAN_PASSWORD
 * (env) or a manually-set auth.passwordHash. The login route uses this to refuse
 * the well-known default (123456) once auth has been deliberately set up.
 */
export async function hasOverridePassword(): Promise<boolean> {
  const s = await getSettings();
  return Boolean(config.initialPassword) || Boolean(s.auth.passwordHash);
}

/**
 * Kiểm tra mật khẩu đăng nhập. Chấp nhận:
 *  1) Mật khẩu người dùng (userPasswordHash), hoặc mặc định 123456 nếu chưa đổi
 *     (chỉ khi `allowDefault`).
 *  2) Mật khẩu override để khôi phục: auth.passwordHash (hash, sửa tay) hoặc
 *     env WEBOBSIDIAN_PASSWORD (plaintext) — luôn được chấp nhận.
 *
 * `allowDefault` gates the well-known fallback (123456). The login route passes
 * false once an override exists, so an internet-exposed instance can't be logged
 * into with the default. It stays true for change-password's current-password
 * check, so the first-run "set a password" flow still works under an override —
 * that path is already behind requireAuth, so accepting 123456 there is safe.
 */
export async function checkPassword(
  password: string,
  opts: { allowDefault?: boolean } = {},
): Promise<boolean> {
  const { allowDefault = true } = opts;
  const s = await getSettings();

  // (1) Mật khẩu đăng nhập hiệu dụng.
  if (s.auth.userPasswordHash) {
    if (await verifyPassword(password, s.auth.userPasswordHash)) return true;
  } else if (allowDefault && safeEqualStr(password, DEFAULT_PASSWORD)) {
    return true;
  }

  // (2) Mật khẩu override (recovery) — luôn kiểm tra, kể cả khi đã đổi pass.
  if (s.auth.passwordHash && (await verifyPassword(password, s.auth.passwordHash))) return true;
  if (config.initialPassword && safeEqualStr(password, config.initialPassword)) return true;

  return false;
}

/** Đổi mật khẩu: xác minh pass hiện tại rồi lưu pass mới. */
export async function changePassword(current: string, next: string): Promise<void> {
  if (!(await checkPassword(current))) throw new Error('Current password is incorrect');
  await setUserPassword(next);
}

const TOKEN_TTL = '30d';

export async function issueToken(): Promise<string> {
  const s = await getSettings();
  return jwt.sign({ sub: 'owner' }, s.auth.jwtSecret, {
    expiresIn: TOKEN_TTL,
    algorithm: 'HS256',
  });
}

/**
 * Xác minh token phiên CHỦ SỞ HỮU. Ngoài chữ ký hợp lệ, token bắt buộc phải có
 * `sub === 'owner'` và dùng đúng thuật toán HS256. Điều này ngăn các token khác
 * cũng ký bằng cùng `jwtSecret` (ví dụ unlock-cookie của share công khai, mang
 * `sub: 'share'`) bị tái sử dụng như một phiên owner đầy đủ.
 */
export async function verifyToken(token: string): Promise<boolean> {
  try {
    const s = await getSettings();
    const payload = jwt.verify(token, s.auth.jwtSecret, { algorithms: ['HS256'] });
    return typeof payload === 'object' && payload !== null && payload.sub === 'owner';
  } catch {
    return false;
  }
}

/** ---- API keys ----------------------------------------------------------- */

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Returns { raw, record-fields }. `raw` is shown to the user exactly once. */
export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = `wok_${randomBytes(24).toString('base64url')}`;
  return { raw, hash: hashApiKey(raw), prefix: raw.slice(0, 12) };
}
