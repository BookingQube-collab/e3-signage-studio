import assert from "node:assert/strict";
import test from "node:test";

import { parseS3ListBucketResult } from "./r2-list.ts";

test("ListObjects XML yields storage keys without a HEAD per file", () => {
  const xml = `<?xml version="1.0"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <IsTruncated>false</IsTruncated>
  <Contents><Key>org/media-a/v1/aaa.jpg</Key><Size>12</Size></Contents>
  <Contents><Key>org/media-b/v1/bbb.jpg</Key><Size>34</Size></Contents>
</ListBucketResult>`;
  const page = parseS3ListBucketResult(xml);
  assert.deepEqual(page.keys, ["org/media-a/v1/aaa.jpg", "org/media-b/v1/bbb.jpg"]);
  assert.equal(page.nextContinuationToken, null);
});

test("truncated listings expose the continuation token", () => {
  const xml = `<ListBucketResult>
  <IsTruncated>true</IsTruncated>
  <NextContinuationToken>page-2&amp;more</NextContinuationToken>
  <Contents><Key>org/a.jpg</Key></Contents>
</ListBucketResult>`;
  const page = parseS3ListBucketResult(xml);
  assert.deepEqual(page.keys, ["org/a.jpg"]);
  assert.equal(page.nextContinuationToken, "page-2&more");
});
