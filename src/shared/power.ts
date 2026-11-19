// The computer's power draw as a small meter beside the composer shows it.
//
// A separate desktop meter (C:\Tools\PowerMeter) reads the hardware sensors, since that needs a
// kernel driver and administrator rights, and writes the newest reading to a file; main reads it
// and hands it to the page. When that meter is not running the reading is null and nothing shows.

export interface PowerReading {
  /** The whole machine, in watts: what was measured plus a baseline for what cannot be. */
  total: number
  /** The processor's package power, in watts, when a sensor reports it. */
  cpu: number | null
  /** The graphics card's power, in watts, when a sensor reports it. */
  gpu: number | null
  /** The parts no sensor reports (board, memory, disks, fans, losses), in watts. */
  baseline: number
  /** When it was read, in milliseconds since the epoch. */
  at: number
}
