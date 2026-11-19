// Reading the power meter's file: the desktop meter (C:\Tools\PowerMeter) writes the newest
// reading there every couple of seconds, and this only reads it, so the page costs no sensor work.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { PowerReading } from '@shared/power'

/** Where the meter keeps its newest reading: a folder every user of this computer can read. */
export function powerFile(): string {
  return path.join(process.env.PUBLIC ?? 'C:\\Users\\Public', 'KettuPower', 'power.json')
}

/** A reading no older than this is shown; an older one means the meter stopped. */
const FRESH_MS = 15_000

/** The newest reading, or null when the meter is not running or its reading is stale. */
export function readPower(now = Date.now()): PowerReading | null {
  try {
    const value = JSON.parse(readFileSync(powerFile(), 'utf8')) as Partial<PowerReading>
    if (
      typeof value.total !== 'number' ||
      typeof value.at !== 'number' ||
      now - value.at > FRESH_MS
    ) {
      return null
    }
    return {
      total: value.total,
      cpu: typeof value.cpu === 'number' ? value.cpu : null,
      gpu: typeof value.gpu === 'number' ? value.gpu : null,
      baseline: typeof value.baseline === 'number' ? value.baseline : 0,
      at: value.at,
    }
  } catch {
    return null
  }
}
