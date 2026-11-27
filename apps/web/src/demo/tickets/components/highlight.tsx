import { Fragment } from "react";

const WORD = /(\p{L}[\p{L}\p{N}'’]*|\p{N}+)/u;

const matches = (word: string, term: string) =>
  word.startsWith(term) || (word.length >= 4 && term.startsWith(word));

export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return text;
  return text.split(WORD).map((part, index) =>
    terms.some((term) => matches(part.toLowerCase(), term)) ? (
      <mark
        key={index}
        className="rounded-[3px] bg-amber-200/80 px-0.5 text-foreground dark:bg-amber-400/30"
      >
        {part}
      </mark>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}
