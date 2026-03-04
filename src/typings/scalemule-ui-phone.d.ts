declare module '@scalemule/ui/phone' {
  export interface PhoneCountry {
    code: string;
    dialCode: string;
    name: string;
    flag?: string;
  }
  export interface PhoneNormalizationResult {
    normalized: string;
    country: PhoneCountry | null;
    isValid: boolean;
    error?: string;
  }
  export const PHONE_COUNTRIES: PhoneCountry[];
  export function normalizePhoneNumber(phone: string): string;
  export function normalizeAndValidatePhone(phone: string, countryCode?: string): PhoneNormalizationResult;
  export function composePhoneNumber(dialCode: string, nationalNumber: string): string;
  export function isValidE164Phone(phone: string): boolean;
  export function findPhoneCountryByCode(code: string): PhoneCountry | undefined;
  export function findPhoneCountryByDialCode(dialCode: string): PhoneCountry | undefined;
  export function detectCountryFromE164(phone: string): PhoneCountry | null;
  export function countryFlag(countryCode: string): string;
}
