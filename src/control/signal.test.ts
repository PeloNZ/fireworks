import { describe, expect, it } from 'vitest'
import { defaultConfig } from './config.ts'
import { buildSignal } from './signal.ts'
import type { RawInput } from './types.ts'

// Cycle 1 (docs/03_plan_control_layer.md): buildSignal's whole job is
// turning a device-neutral RawInput into a ControlSignal — pass through
// what the adapter observed, stamp what only the core is allowed to decide.

describe('buildSignal', () => {
  const raw: RawInput = { code: 'KeyA', shift: true, timestamp: 1234 }

  it('passes id, shift, and timestamp through from the raw input unchanged', () => {
    const signal = buildSignal(raw, 'keyboard', defaultConfig)

    expect(signal.id).toBe(raw.code)
    expect(signal.shift).toBe(raw.shift)
    expect(signal.timestamp).toBe(raw.timestamp)
  })

  it('always sets intensity from config.defaultIntensity, never invented locally', () => {
    const config = { ...defaultConfig, defaultIntensity: 0.42 }

    const signal = buildSignal(raw, 'keyboard', config)

    expect(signal.intensity).toBe(0.42)
  })

  it('stamps source from the argument passed in, not something it decides itself', () => {
    const signal = buildSignal(raw, 'keyboard', defaultConfig)

    expect(signal.source).toBe('keyboard')
  })

  it('returns exactly the five ControlSignal fields, nothing extra', () => {
    const signal = buildSignal(raw, 'keyboard', defaultConfig)

    expect(Object.keys(signal).sort()).toEqual(
      ['id', 'intensity', 'shift', 'source', 'timestamp'],
    )
  })
})
