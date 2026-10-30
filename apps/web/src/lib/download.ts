/** Offers `blob` to the user as a file download. */
export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** Offers `contents` to the user as a file download. */
export function downloadText(fileName: string, contents: string, type = 'text/plain'): void {
  downloadBlob(fileName, new Blob([contents], { type: `${type};charset=utf-8` }));
}
