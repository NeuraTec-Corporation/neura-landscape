import type { CountryCode } from 'libphonenumber-js';
export function phoneCountry(value:string,fallback?:string):CountryCode;
export function nationalPhone(value:string,country:CountryCode):string;
export function internationalPhone(value:string,country:CountryCode):string;
