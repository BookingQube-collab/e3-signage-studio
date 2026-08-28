/** Keys to sign for CMS previews. Videos need HTTPS `src` the same as images. */
export function mediaKeysToSign(input: {
  previewKey: string | null;
  isImage?: boolean;
  signAllPreviews?: boolean;
}): string[] {
  return input.previewKey ? [input.previewKey] : [];
}
