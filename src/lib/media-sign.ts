/** Keys to sign when listing the library vs opening a single file. */
export function mediaKeysToSign(input: {
  previewKey: string | null;
  thumbnailKey?: string | null;
  isImage: boolean;
  signAllPreviews: boolean;
}): string[] {
  const keys: string[] = [];
  const poster = input.thumbnailKey ?? (input.isImage ? input.previewKey : null);
  if (poster) keys.push(poster);
  const shouldSignPreview = Boolean(input.previewKey) && (input.signAllPreviews || input.isImage);
  if (shouldSignPreview && input.previewKey && input.previewKey !== poster) {
    keys.push(input.previewKey);
  }
  return keys;
}
