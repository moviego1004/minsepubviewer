import test from "node:test";
import assert from "node:assert/strict";
import { createPersistentStorage } from "../../src/platform/storage.js";

test("native storage loads saved data and coalesces library plus backup writes", async () => {
  const writes = [];
  const storage = await createPersistentStorage({ read: async () => ({ theme: "dark" }), write: async (data) => writes.push(data) });
  assert.equal(storage.getItem("theme"), "dark");
  assert.equal(storage.getItem("missing"), null);
  storage.setItem("library", "book-1");
  storage.setItem("backup", "book-1");
  await storage.flush();
  assert.deepEqual(writes, [{ theme: "dark", library: "book-1", backup: "book-1" }]);
});

test("a location changed during an in-flight write is persisted in order", async () => {
  let finishFirst;
  const writes = [];
  const storage = await createPersistentStorage({
    read: async () => ({}),
    write: async (data) => {
      writes.push(data);
      if (writes.length === 1) await new Promise((resolve) => { finishFirst = resolve; });
    }
  });
  storage.setItem("location", "chapter-1");
  const completed = storage.flush();
  storage.setItem("location", "chapter-2");
  finishFirst();
  await completed;
  assert.deepEqual(writes.map((data) => data.location), ["chapter-1", "chapter-2"]);
});

test("failed saves keep dirty state and retry without losing the newest position", async () => {
  let fail = true;
  let saved;
  const storage = await createPersistentStorage({
    read: async () => ({ location: "old" }),
    write: async (data) => { if (fail) throw new Error("disk full"); saved = data; }
  });
  storage.setItem("location", "new");
  await assert.rejects(storage.flush(), /disk full/);
  assert.equal(storage.getItem("location"), "new");
  fail = false;
  await storage.flush();
  assert.deepEqual(saved, { location: "new" });
  storage.removeItem("location");
  await storage.flush();
  assert.deepEqual(saved, {});
});

test("unreadable native state aborts initialization instead of silently overwriting user data", async () => {
  let writes = 0;
  await assert.rejects(createPersistentStorage({
    read: async () => { throw new Error("corrupt state"); },
    write: async () => { writes++; }
  }), /corrupt state/);
  assert.equal(writes, 0);
});
