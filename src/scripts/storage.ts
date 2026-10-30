/**
 * localStorage that never throws. Storage can be unavailable (private mode)
 * or full; then a read finds nothing and a write lasts for this page only.
 */

/** The saved value, or null when there is none or storage is unavailable. */
export function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Saves a value; does nothing when storage is unavailable or full. */
export function save(key: string, value: string) {
  // When it isn't kept, the value lasts for this page only.
  void trySave(key, value);
}

/**
 * Saves a value and reports whether it was kept: false when storage is
 * unavailable or full, in which case any earlier saved value is left as is.
 */
export function trySave(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Removes a saved value; does nothing when storage is unavailable. */
export function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing saved to remove.
  }
}
