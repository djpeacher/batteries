/**
 * Download naming: the file Download saves is called after the file last
 * opened or dropped, exactly as it was named, whatever its text is labelled;
 * pasted text is `pretty-print` with the language label's extension. Name
 * clashes are left to the browser (`data (1).py`).
 */
import type { Language } from "./_format";

const EXTENSION: Record<Language, string> = { JSON: "json", Python: "py" };

/** The download's name, from the opened file's name (null when none) and the language label at the moment of the click. */
export function downloadName(opened: string | null, language: Language): string {
  return opened ?? `pretty-print.${EXTENSION[language]}`;
}
