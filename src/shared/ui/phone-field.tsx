'use client';
import { useId, useState } from 'react';
import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js';
import { phoneCountry, nationalPhone, internationalPhone } from './phone.mjs';
const names = new Intl.DisplayNames(['es'], {type:'region'});
const countries = getCountries().map(code=>({code,name:names.of(code) ?? code,label:`${code} +${getCountryCallingCode(code)} · ${names.of(code) ?? code}`})).sort((a,b)=>a.name.localeCompare(b.name,'es'));
export function PhoneField({label,value,onChange,defaultCountry,error}:{label:string;value:string;onChange:(value:string)=>void;defaultCountry:string;error?:string}) {
  const id=useId();
  const [selected,setSelected]=useState<CountryCode|undefined>(()=>value ? phoneCountry(value,defaultCountry) : undefined);
  const country=selected ?? phoneCountry(value,defaultCountry);
  return <div className="crm-field phone-field">
    <label htmlFor={id}>{label}</label>
    <div className="phone-controls">
      <select aria-label={`País de ${label.toLowerCase()}`} value={country} onChange={event=>{
        const next=event.target.value as CountryCode;
        setSelected(next);
        onChange(internationalPhone(nationalPhone(value,country),next));
      }}>{countries.map(item=><option key={item.code} value={item.code}>{item.label}</option>)}</select>
      <input id={id} type="tel" inputMode="tel" autoComplete="tel-national" value={nationalPhone(value,country)} maxLength={40} placeholder="Número nacional" aria-invalid={!!error} aria-describedby={error?`${id}-error`:undefined} onChange={event=>{
        const raw=event.target.value;
        setSelected(raw.trim().startsWith('+') ? phoneCountry(raw,country) : country);
        onChange(internationalPhone(raw,country));
      }}/>
    </div>
    {error?<small className="field-error" id={`${id}-error`}>{error}</small>:null}
  </div>;
}
