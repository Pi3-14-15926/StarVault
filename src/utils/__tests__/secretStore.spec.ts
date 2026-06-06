import { describe, it, expect } from 'vitest'
import { encryptSecret, decryptSecret, isEncrypted } from '../secretStore'

describe('secretStore', () => {
  it('encryptSecret + decryptSecret roundtrip', async () => {
    const plain = 'webdav-password-测试-123!@#'
    const cipher = await encryptSecret(plain)
    expect(cipher).not.toBe(plain)
    expect(cipher.length).toBeGreaterThan(24)
    const back = await decryptSecret(cipher)
    expect(back).toBe(plain)
  })

  it('encryptSecret returns empty string for empty input', async () => {
    expect(await encryptSecret('')).toBe('')
  })

  it('decryptSecret returns empty string for empty input', async () => {
    expect(await decryptSecret('')).toBe('')
  })

  it('decryptSecret returns empty string on invalid ciphertext', async () => {
    expect(await decryptSecret('not-a-valid-encrypted-string!!')).toBe('')
    expect(await decryptSecret('AAAA')).toBe('')
  })

  it('decryptSecret returns empty string on tampered ciphertext', async () => {
    const cipher = await encryptSecret('hello')
    const tampered = cipher.slice(0, -4) + 'XXXX'
    expect(await decryptSecret(tampered)).toBe('')
  })

  it('isEncrypted returns false for short strings', () => {
    expect(isEncrypted('')).toBe(false)
    expect(isEncrypted(undefined)).toBe(false)
    expect(isEncrypted(null)).toBe(false)
    expect(isEncrypted('short')).toBe(false)
  })

  it('isEncrypted returns false for strings with non-base64 chars', () => {
    expect(isEncrypted('this has spaces and !@#$ characters but very long')).toBe(false)
  })

  it('isEncrypted returns true for typical encrypted output', async () => {
    const cipher = await encryptSecret('something')
    expect(isEncrypted(cipher)).toBe(true)
  })

  it('different calls produce different ciphertexts (random IV)', async () => {
    const a = await encryptSecret('same input')
    const b = await encryptSecret('same input')
    expect(a).not.toBe(b)
    expect(await decryptSecret(a)).toBe('same input')
    expect(await decryptSecret(b)).toBe('same input')
  })
})
