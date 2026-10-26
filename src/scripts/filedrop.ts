/**
 * Files dragged over the page, shared by both batteries. Only drags that
 * carry files count; text or links dragged within the page are left alone.
 * Dropping a file never lets the browser open it in place of the page.
 */
type Handlers = {
  /** A drag of files is over the page (on), moved (on again), or gone (off). `e` is the event, while on. */
  onDrag(on: boolean, e?: DragEvent): void;
  /** Whether dropping where the event is would be taken; sets the pointer. Everywhere, if absent. */
  accepts?(e: DragEvent): boolean;
  /** A file was dropped. The page decides from `e` whether to take it. */
  onDrop(file: File | undefined, e: DragEvent): void;
};

export function wireFileDrop({ onDrag, accepts = () => true, onDrop }: Handlers) {
  // Enter and leave fire for every element crossed; the depth says when the
  // drag has really left the page.
  let depth = 0;
  const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes("Files");
  addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    onDrag(true, e);
  });
  addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = accepts(e) ? "copy" : "none";
    onDrag(true, e);
  });
  addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    if (--depth <= 0) {
      depth = 0;
      onDrag(false);
    }
  });
  addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    onDrag(false);
    onDrop(e.dataTransfer!.files[0], e);
  });
}
