/** Keys to sign when listing the library vs opening a single file. */
export function mediaKeysToSign(input: {
  previewKey: string | null;
  isImage: boolean;
  signAllPreviews: boolean;
}): string[] {
  if (!input.previewKey) return [];
  if (input.signAllPreviews || input.isImage) return [input.previewKey];
  return [];
}
