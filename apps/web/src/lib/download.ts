/** Offers `contents` to the user as a file download. */
export function downloadText(fileName: string, contents: string, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([contents], { type: `${type};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
