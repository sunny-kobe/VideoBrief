import { createHash } from 'node:crypto';
import { openSync, readSync, closeSync } from 'node:fs';

// Always read current bytes; do not cache a hash by path, size or modification time.
export function hashMediaFile(path) {
  const fd = openSync(path, 'r');
  try {
    const hash = createHash('sha256');
    const chunk = Buffer.allocUnsafe(1024 * 1024);
    let bytesRead;
    while ((bytesRead = readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      hash.update(chunk.subarray(0, bytesRead));
    }
    return hash.digest('hex');
  } finally {
    closeSync(fd);
  }
}
