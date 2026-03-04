import { describe, test, expect } from 'vitest'
import * as uiPhone from '@scalemule/ui/phone'
import * as sdk from './index'

const PHONE_EXPORTS = [
  'PHONE_COUNTRIES',
  'normalizePhoneNumber',
  'normalizeAndValidatePhone',
  'composePhoneNumber',
  'isValidE164Phone',
  'findPhoneCountryByCode',
  'findPhoneCountryByDialCode',
  'detectCountryFromE164',
  'countryFlag',
]

describe('SDK phone re-export parity', () => {
  test.each(PHONE_EXPORTS)('sdk re-exports %s from @scalemule/ui/phone', (name) => {
    expect((sdk as Record<string, unknown>)[name]).toBe(
      (uiPhone as Record<string, unknown>)[name]
    )
  })
})
