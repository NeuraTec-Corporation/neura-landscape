import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { phoneCountry, nationalPhone, internationalPhone } from '../src/shared/ui/phone.mjs';
test('address country supplies calling code for national input',()=>{
  assert.equal(phoneCountry('','US'),'US');
  assert.equal(internationalPhone('201 555 0123','US'),'+1201 555 0123');
  assert.equal(parsePhoneNumberFromString(internationalPhone('201 555 0123','US')).number,'+12015550123');
  assert.equal(phoneCountry('','EC'),'EC');
  assert.equal(internationalPhone('99 123 4567','EC'),'+59399 123 4567');
  assert.equal(internationalPhone('','US'),'');
});
test('saved and pasted international numbers survive a different address country',()=>{
  const saved='+442079460018';
  assert.equal(phoneCountry(saved,'US'),'GB');
  assert.equal(phoneCountry(saved,'EC'),'GB');
  assert.equal(nationalPhone(saved,'GB'),'2079460018');
  assert.equal(internationalPhone(saved,'US'),saved);
  assert.equal(internationalPhone(nationalPhone(saved,'GB'),'GB'),saved);
  assert.equal(internationalPhone('2079460018','GB'),saved);
});
