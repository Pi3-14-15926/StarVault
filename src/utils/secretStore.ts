/**
 * 浏览器端密钥加密工具（Web Crypto API · AES-GCM 256）
 *
 * 用途：在 localStorage 中加密存储敏感字段（WebDAV 密码等）
 *
 * ⚠️ 安全说明（重要）：
 * 1. 前端加密**不能防 XSS**——攻击者拿到 JS 执行权就能调用 decrypt
 * 2. 本工具只是增加"被静态分析/离线 dump 后破解"的难度
 * 3. 真正的安全需要：服务端代理持有凭据 / 启用 2FA / 短时 token
 * 4. 建议配合 CSP (#4) + 输入消毒
 *
 * 实现：
 * - 密钥派生：PBKDF2(navigator.userAgent + language, 固定 salt, 10k 轮) → AES-GCM 256
 * - 每次加密随机 IV
 * - 密文格式：base64(IV ‖ ciphertext)
 *
 * 注意：所有同源浏览器共享同一密钥（userAgent + language 在同设备同浏览器下不变），
 *       仅在切换浏览器/设备时才需要重新输入明文。
 */

const SALT = 'sh-webdav-encryption-salt-v1'
const PBKDF2_ITERATIONS = 10000

let cachedKey: CryptoKey | null = null

function enc() { return new TextEncoder() }
function dec() { return new TextDecoder() }

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey
  const material = `${navigator.userAgent}|${navigator.language}|${(navigator as any).userAgentData?.platform || ''}`
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc().encode(material),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )
  cachedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc().encode(SALT),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  return cachedKey
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin)
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** 加密明文 → 密文（base64，IV 在前） */
export async function encryptSecret(plain: string): Promise<string> {
  if (!plain) return ''
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc().encode(plain),
  )
  const out = new Uint8Array(iv.length + cipher.byteLength)
  out.set(iv, 0)
  out.set(new Uint8Array(cipher), iv.length)
  return toBase64(out.buffer)
}

/** 解密密文（base64） → 明文 */
export async function decryptSecret(cipherText: string): Promise<string> {
  if (!cipherText) return ''
  try {
    const key = await getKey()
    const raw = fromBase64(cipherText)
    const iv = raw.slice(0, 12)
    const cipher = raw.slice(12)
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      cipher,
    )
    return dec().decode(plain)
  } catch (e) {
    // 解密失败（key 变了、密文损坏、跨浏览器访问）→ 返回空串
    return ''
  }
}

/** 标记字符串是否像加密后的密文（base64 长度 > 24 且不含可打印中文字符） */
export function isEncrypted(s: string | undefined | null): boolean {
  if (!s) return false
  return s.length > 24 && /^[A-Za-z0-9+/=]+$/.test(s)
}
