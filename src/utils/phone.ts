/**
 * Phone normalization helpers for registration and OTP flows.
 *
 * Re-exported from @scalemule/ui/phone — this file is the canonical source
 * for phone utilities across all ScaleMule packages.
 */

export {
  PHONE_COUNTRIES,
  normalizePhoneNumber,
  normalizeAndValidatePhone,
  composePhoneNumber,
  isValidE164Phone,
  findPhoneCountryByCode,
  findPhoneCountryByDialCode,
  detectCountryFromE164,
  countryFlag
} from '@scalemule/ui/phone';
export type { PhoneCountry, PhoneNormalizationResult } from '@scalemule/ui/phone';
