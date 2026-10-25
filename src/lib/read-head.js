// Read the first N bytes of a file and nothing more.
//
// A photo set asks each picture for its dimensions, which live in the first
// few dozen bytes of the header. readFileSync would pull a 6MB frame into
// memory to read 24 of them, once per picture, per set, on every load in
// development.

import { closeSync, openSync, readSync } from 'node:fs'

/**
 * @param {string} path
 * @param {number} bytes
 * @returns {Buffer|null} the leading bytes, or null when the file cannot be read
 */
export function readFileHead(path, bytes) {
  let fd
  try {
    fd = openSync(path, 'r')
    const buf = Buffer.alloc(bytes)
    const read = readSync(fd, buf, 0, bytes, 0)
    return buf.subarray(0, read)
  } catch {
    return null
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}
