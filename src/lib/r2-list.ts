export type S3ListedObject = {
  key: string;
  sizeBytes: number;
};

export type S3ListBucketPage = {
  keys: string[];
  objects: S3ListedObject[];
  totalSizeBytes: number;
  nextContinuationToken: string | null;
};

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseSizeBytes(block: string): number {
  const match = block.match(/<Size>([^<]*)<\/Size>/i);
  if (!match?.[1]) return 0;
  const n = Number(decodeXmlText(match[1]).trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Parse ListObjectsV2 XML so resync can match keys without a per-file HEAD. */
export function parseS3ListBucketResult(xml: string): S3ListBucketPage {
  const objects: S3ListedObject[] = [];
  for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/gi)) {
    const block = match[1] ?? "";
    const keyMatch = block.match(/<Key>([^<]*)<\/Key>/i);
    const key = keyMatch?.[1] ? decodeXmlText(keyMatch[1]).trim() : "";
    if (!key) continue;
    objects.push({ key, sizeBytes: parseSizeBytes(block) });
  }
  // Older callers / odd XML: fall back to bare <Key> nodes if Contents blocks were empty.
  if (objects.length === 0) {
    for (const match of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) {
      const key = decodeXmlText(match[1] ?? "").trim();
      if (key) objects.push({ key, sizeBytes: 0 });
    }
  }
  const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml);
  const tokenMatch = xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/);
  const token = tokenMatch?.[1] ? decodeXmlText(tokenMatch[1]).trim() : "";
  return {
    keys: objects.map((o) => o.key),
    objects,
    totalSizeBytes: objects.reduce((sum, o) => sum + o.sizeBytes, 0),
    nextContinuationToken: truncated && token ? token : null,
  };
}
