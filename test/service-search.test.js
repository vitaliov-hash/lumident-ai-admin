import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesServiceQuery } from '../public/service-search.js';

const services = [
  { name: 'Лечение кариеса', name_en: 'Cavity treatment', description: 'Лечение зуба', description_en: 'Decay repair' },
  { name: 'Профессиональная гигиена', name_en: 'Professional cleaning', description: 'Чистка зубов', description_en: 'Teeth cleaning' },
  { name: 'Имплантация одного зуба', name_en: 'Single-tooth implant', description: 'Восстановление зуба', description_en: 'Dental implant placement' }
];

test('service search matches Russian names and descriptions without case sensitivity', () => {
  assert.equal(matchesServiceQuery(services[0], 'ЛЕЧЕНИЕ'), true);
  assert.equal(matchesServiceQuery(services[1], 'чистка зубов'), true);
});

test('service search matches English names and descriptions while the Russian catalog is active', () => {
  assert.equal(matchesServiceQuery(services[0], 'cavity treatment'), false);
  assert.equal(matchesServiceQuery(services[2], 'dental implant'), true);
});

test('multiword queries require every term and tolerate extra whitespace', () => {
  assert.equal(matchesServiceQuery(services[0], '  лечение   зуба '), true);
  assert.equal(matchesServiceQuery(services[0], 'лечение коронки'), false);
});

test('search normalizes Russian ё and English diacritics', () => {
  assert.equal(matchesServiceQuery({ name: 'Приём врача' }, 'прием'), true);
  assert.equal(matchesServiceQuery({ name_en: 'Café restoration' }, 'cafe restoration'), true);
});

test('empty query keeps the whole catalog visible and missing fields are safe', () => {
  assert.equal(matchesServiceQuery(services[0], '   '), true);
  assert.equal(matchesServiceQuery({}, 'cavity'), false);
  assert.equal(matchesServiceQuery(null, ''), true);
});
