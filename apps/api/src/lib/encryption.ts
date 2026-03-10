import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// ── AES-256-GCM encryption ────────────────────────────────────────────────────
//
// Format: base64(iv):base64(authTag):base64(ciphertext)
//
// Uses AES_KEY env var (must be 32-byte hex string = 64 hex chars).

function getKey(): Buffer {
  const hexKey = process.env.AES_KEY;
  if (!hexKey) throw new Error('AES_KEY environment variable is required');
  if (hexKey.length !== 64) {
    throw new Error('AES_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(hexKey, 'hex');
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns a string of the form: `<iv_b64>:<authTag_b64>:<ciphertext_b64>`
 */
export function encrypt(text: string): string {
  const key = getKey();
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

/**
 * Decrypt a string produced by `encrypt()`.
 */
export function decrypt(encryptedString: string): string {
  const key = getKey();
  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted string format. Expected iv:authTag:ciphertext');
  }

  const [ivB64, authTagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Mask an API key for display (show first 3 chars and last 4 chars).
 * e.g. "sk-abcdefghij1234" → "sk-...j1234"
 */
export function maskApiKey(key: string): string {
  if (key.length <= 10) return '***';
  const prefix = key.slice(0, 6);
  const suffix = key.slice(-4);
  return `${prefix}...${suffix}`;
}
