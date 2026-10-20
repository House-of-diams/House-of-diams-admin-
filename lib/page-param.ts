/** A ?page= search param as a page number; anything invalid means page 1 (HOD-065). */
export function pageParam(value: string | string[] | undefined): number {
  const page = Number(Array.isArray(value) ? value[0] : value ?? 1)
  return Number.isSafeInteger(page) && page >= 1 && page <= 100_000 ? page : 1
}

/** A ?q= search param, trimmed and capped. */
export function queryParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value ?? '').trim().slice(0, 100)
}
