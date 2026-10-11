type Handler = () => boolean;
let handler: Handler | null = null;

// Home registers a function here. It returns true if it handled the back press
// (for example by switching from another category back to Trending).
export function setHomeBackHandler(next: Handler | null) {
  handler = next;
}

export function runHomeBackHandler(): boolean {
  try {
    return handler ? handler() : false;
  } catch {
    return false;
  }
}
