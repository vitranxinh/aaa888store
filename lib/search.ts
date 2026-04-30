export function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getSearchScore(haystack: string, query: string) {
  const rawHaystack = haystack.toLowerCase().trim();
  const rawQuery = query.toLowerCase().trim();
  const normalizedHaystack = normalizeSearchText(haystack);
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) return 0;

  const rawWords = rawHaystack.split(/\s+/).filter(Boolean);
  if (rawQuery) {
    if (rawHaystack.includes(rawQuery)) return 7;
    if (rawHaystack.startsWith(rawQuery)) return 6;
    if (rawWords.some((word) => word.startsWith(rawQuery))) return 5;
    if (rawHaystack.includes(rawQuery)) return 4;
  }

  const words = normalizedHaystack.split(/\s+/).filter(Boolean);
  const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);
  if (normalizedHaystack.includes(normalizedQuery)) return 4;

  if (
    queryWords.length > 1 &&
    queryWords.every((queryWord) => words.some((word) => word.startsWith(queryWord)))
  ) {
    return 3;
  }

  if (normalizedHaystack.startsWith(normalizedQuery)) return 3;
  if (words.some((word) => word.startsWith(normalizedQuery))) return 2;
  if (
    queryWords.length > 1 &&
    queryWords.every((queryWord) => normalizedHaystack.includes(queryWord))
  ) {
    return 2;
  }
  if (normalizedHaystack.includes(normalizedQuery)) return 1;
  return 0;
}

export function compareSearchResults(
  a: { label: string; score: number; searchText?: string },
  b: { label: string; score: number; searchText?: string },
  query: string
) {
  if (b.score !== a.score) return b.score - a.score;

  const normalizedQuery = normalizeSearchText(query);
  const aHaystack = normalizeSearchText(a.searchText ?? a.label);
  const bHaystack = normalizeSearchText(b.searchText ?? b.label);

  const aIndex = aHaystack.indexOf(normalizedQuery);
  const bIndex = bHaystack.indexOf(normalizedQuery);
  if (aIndex !== bIndex) return aIndex - bIndex;

  if (a.label.length !== b.label.length) return a.label.length - b.label.length;
  return a.label.localeCompare(b.label, "vi");
}
