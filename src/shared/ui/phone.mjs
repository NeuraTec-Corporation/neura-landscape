import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from 'libphonenumber-js';
const countries = new Set(getCountries());
export function phoneCountry(value, fallback = 'US') {
  return parsePhoneNumberFromString(value)?.country || (countries.has(fallback.toUpperCase()) ? fallback.toUpperCase() : 'US');
}
export function nationalPhone(value, country) {
  const prefix = `+${getCountryCallingCode(country)}`;
  return value.startsWith(prefix) ? value.slice(prefix.length).trim() : value;
}
export function internationalPhone(value, country) {
  const number = value.trim();
  return !number || number.startsWith('+') ? number : `+${getCountryCallingCode(country)}${number}`;
}
