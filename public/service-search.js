function normalizeSearchText(value) {
  return String(value ?? '')
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesServiceQuery(service, query) {
  const terms = normalizeSearchText(query).split(' ').filter(Boolean);
  if (!terms.length) return true;
  const searchableText = normalizeSearchText([
    service?.name,
    service?.name_en,
    service?.description,
    service?.description_en
  ].join(' '));
  return terms.every(term => searchableText.includes(term));
}
