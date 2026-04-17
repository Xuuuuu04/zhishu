/**
 * Shared drag-and-drop utilities.
 *
 * Single source of truth for detecting external (Finder/desktop) drops
 * vs internal ZhiShu drag events.
 */

/**
 * Determine whether a drag event originated from outside the app (Finder, desktop, etc.)
 * as opposed to an internal drag (e.g. file-tree node being dragged to terminal).
 *
 * Internal drags set a custom MIME type starting with "application/x-prism-".
 * External drags provide "Files" in dataTransfer.types.
 *
 * @param {DragEvent} e - The DOM drag event
 * @returns {boolean} True if the drag is from an external source
 */
export function isExternalDrop(e) {
  const hasInternalMime = e.dataTransfer.types.some((t) => t.startsWith('application/x-prism-'));
  const hasFiles = e.dataTransfer.types.includes('Files') || e.dataTransfer.files.length > 0;
  return !hasInternalMime && hasFiles;
}

export function isInternalReorder(e) {
  return e.dataTransfer.types.some((t) => t.startsWith('application/x-prism-'));
}
