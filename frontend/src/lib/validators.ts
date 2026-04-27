const SLUG_REGEX = /^[a-z0-9-]{2,80}$/

export function isValidSlug(value: string) {
  return SLUG_REGEX.test(value)
}
