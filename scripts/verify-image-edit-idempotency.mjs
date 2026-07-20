import assert from "node:assert/strict";

process.env.ENCRYPTION_KEY = "image-edit-idempotency-verification-key";

const {
  imageEditAssetId,
  normalizeImageEditOperationKey,
  runImageEditSingleFlight,
} = await import("../src/lib/server/image-edit-idempotency.ts");
const { messageHasImageUrl, replaceMessageImageParts } = await import(
  "../src/lib/message-image.ts"
);

const key = "android-123456789012345678901234567890123456789012345678";
assert.equal(normalizeImageEditOperationKey(key), key);
assert.equal(normalizeImageEditOperationKey("short"), null);
assert.equal(normalizeImageEditOperationKey("bad key with spaces"), null);

const firstId = imageEditAssetId("user-a", key);
assert.match(firstId, /^med-edit-[a-f0-9]{24}$/);
assert.equal(imageEditAssetId("user-a", key), firstId);
assert.notEqual(imageEditAssetId("user-b", key), firstId);

let executions = 0;
const results = await Promise.all(
  Array.from({ length: 32 }, () =>
    runImageEditSingleFlight(firstId, async () => {
      executions += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { url: `/api/media/${firstId}` };
    })
  )
);
assert.equal(executions, 1);
assert.ok(results.every((result) => result.url === `/api/media/${firstId}`));

await assert.rejects(
  runImageEditSingleFlight("failed-operation", async () => {
    throw new Error("expected failure");
  }),
  /expected failure/
);
assert.equal(
  await runImageEditSingleFlight("failed-operation", async () => "retry-ok"),
  "retry-ok"
);

const originalParts = [
  { type: "text", text: "原图" },
  { type: "image", url: "/api/media/old" },
];
const replaced = replaceMessageImageParts(
  originalParts,
  "/api/media/old",
  "/api/media/new",
  "换背景"
);
assert.equal(replaced.replaced, true);
assert.equal(messageHasImageUrl(replaced.parts, "/api/media/new"), true);
const replay = replaceMessageImageParts(
  replaced.parts,
  "/api/media/old",
  "/api/media/new",
  "换背景"
);
assert.equal(replay.replaced, false);
assert.equal(messageHasImageUrl(replay.parts, "/api/media/new"), true);

console.log("image edit idempotency verification passed");
