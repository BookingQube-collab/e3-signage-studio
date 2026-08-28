export type S3ListBucketPage = {
  keys: string[];
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

/** Parse ListObjectsV2 XML so resync can match keys without a per-file HEAD. */
export function parseS3ListBucketResult(xml: string): S3ListBucketPage {
  const keys: string[] = [];
  for (const match of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) {
    const key = decodeXmlText(match[1] ?? "").trim();
    if (key) keys.push(key);
  }
  const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml);
  const tokenMatch = xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/);
  const token = tokenMatch?.[1] ? decodeXmlText(tokenMatch[1]).trim() : "";
  return {
    keys,
    nextContinuationToken: truncated && token ? token : null,
  };
}
