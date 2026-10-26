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
  try {
    localStorage.setItem(key, value);
  } catch {
    // The value lasts for this page only.
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
