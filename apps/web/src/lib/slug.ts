export const NAME_MAX = 80;
export const SLUG_MIN = 3;
export const SLUG_MAX = 48;
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isSlug(value: string) {
  return value.length >= SLUG_MIN && value.length <= SLUG_MAX && SLUG_PATTERN.test(value);
}

export function toSlug(name: string) {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
}
