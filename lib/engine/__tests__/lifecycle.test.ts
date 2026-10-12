import { describe, expect, it } from 'vitest'
import { canReopen, canTransition, nextSteps, reviewDateFor, validateStep, type StepInput } from '@/lib/engine/lifecycle'

const base: StepInput = {
  from: 'approved',
  to: 'awaiting_review',
  today: '2026-10-12',
  approvedAt: '2026-10-05',
  owner: 'Marcela',
  executedAt: '2026-10-08',
  learning: null,
  reviewDate: null,
}

describe('lifecycle transitions', () => {
  it('only human steps after approval', () => {
    expect(nextSteps('open')).toEqual([])
    expect(canTransition('approved', 'in_progress')).toBe(true)
    expect(canTransition('approved', 'completed')).toBe(false)
    expect(canTransition('awaiting_review', 'completed')).toBe(true)
    expect(canTransition('completed', 'cancelled')).toBe(false)
  })

  it('executed work cannot be reopened', () => {
    expect(canReopen('approved')).toBe(true)
    expect(canReopen('awaiting_review')).toBe(false)
    expect(canReopen('completed')).toBe(false)
  })

  it('review window starts on execution date with a 3-day floor', () => {
    expect(reviewDateFor('2026-10-08', 7)).toBe('2026-10-15')
    expect(reviewDateFor('2026-10-30', 1)).toBe('2026-11-02')
  })
})

describe('validateStep', () => {
  it('accepts a valid execution', () => {
    expect(validateStep(base)).toBeNull()
  })

  it('requires owner and execution date', () => {
    expect(validateStep({ ...base, owner: null })).toMatch(/responsável/)
    expect(validateStep({ ...base, executedAt: null })).toMatch(/data/)
  })

  it('rejects future or pre-approval execution dates', () => {
    expect(validateStep({ ...base, executedAt: '2026-10-13' })).toMatch(/futuro/)
    expect(validateStep({ ...base, executedAt: '2026-10-04' })).toMatch(/anterior/)
  })

  it('completion requires learning and an elapsed evaluation period', () => {
    const done = { ...base, from: 'awaiting_review', to: 'completed' as const, reviewDate: '2026-10-15' }
    expect(validateStep({ ...done, learning: null })).toMatch(/aprendizado/)
    expect(validateStep({ ...done, learning: 'Subiu' })).toMatch(/15\/10\/2026/)
    expect(validateStep({ ...done, learning: 'Subiu', reviewDate: '2026-10-12' })).toBeNull()
  })

  it('full flow approved → in_progress → awaiting_review → completed', () => {
    expect(validateStep({ ...base, to: 'in_progress', executedAt: null })).toBeNull()
    expect(validateStep({ ...base, from: 'in_progress' })).toBeNull()
    const review = reviewDateFor(base.executedAt!, 4)
    expect(validateStep({ ...base, from: 'awaiting_review', to: 'completed', learning: 'ok', reviewDate: review })).toBeNull()
  })
})
