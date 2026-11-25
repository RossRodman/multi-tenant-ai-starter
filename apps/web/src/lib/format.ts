const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

export const formatDate = (value: string) => dateFormat.format(new Date(value));

export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[1]] : Array.from(words[0] ?? "?").slice(0, 2);
  return letters
    .map((part) => Array.from(part ?? "")[0] ?? "")
    .join("")
    .toUpperCase();
}

export function personInitials(name: string | null, email: string) {
  return name ? initials(name) : emailInitials(email);
}

export function emailInitials(email: string) {
  return Array.from(email.split("@")[0] ?? "")
    .filter((char) => /[\p{L}\p{N}]/u.test(char))
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function memberCountLabel(count: number) {
  return `${String(count)} ${count === 1 ? "member" : "members"}`;
}
