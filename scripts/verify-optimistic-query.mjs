import assert from "node:assert/strict";
import {
  optimisticInsertRecord,
  optimisticPatchQuery,
  optimisticPatchRecords,
  optimisticRemoveRecord,
} from "../src/lib/optimistic-query.ts";

const keyId = (key) => JSON.stringify(key);

class FakeQueryClient {
  data = new Map();

  getQueryCache() {
    return {
      findAll: ({ queryKey }) =>
        [...this.data.keys()]
          .map(JSON.parse)
          .filter((candidate) =>
            queryKey.every((part, index) => candidate[index] === part)
          )
          .map((queryKey) => ({ queryKey })),
    };
  }

  getQueryData(key) {
    return this.data.get(keyId(key));
  }

  setQueryData(key, updater) {
    const id = keyId(key);
    const previous = this.data.get(id);
    this.data.set(id, typeof updater === "function" ? updater(previous) : updater);
  }
}

{
  const client = new FakeQueryClient();
  client.setQueryData(["projects"], [
    { id: "p1", name: "旧名称", color: "red" },
  ]);
  const transaction = optimisticPatchRecords(
    client,
    [["projects"]],
    "p1",
    { name: "新名称" }
  );
  client.setQueryData(["projects"], (items) =>
    items.map((item) => (item.id === "p1" ? { ...item, color: "blue" } : item))
  );
  transaction.rollback();
  assert.deepEqual(client.getQueryData(["projects"]), [
    { id: "p1", name: "旧名称", color: "blue" },
  ]);
}

{
  const client = new FakeQueryClient();
  client.setQueryData(["skills"], [{ id: "s1", name: "已有" }]);
  const transaction = optimisticInsertRecord(
    client,
    [["skills"]],
    { id: "temp", name: "保存中" }
  );
  assert.equal(client.getQueryData(["skills"])[0].id, "temp");
  transaction.reconcile({ id: "s2", name: "已保存" });
  assert.deepEqual(client.getQueryData(["skills"]), [
    { id: "s2", name: "已保存" },
    { id: "s1", name: "已有" },
  ]);
}

{
  const client = new FakeQueryClient();
  client.setQueryData(["files"], [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
  ]);
  const transaction = optimisticRemoveRecord(client, [["files"]], "b");
  assert.deepEqual(
    client.getQueryData(["files"]).map((item) => item.id),
    ["a", "c"]
  );
  transaction.rollback();
  assert.deepEqual(
    client.getQueryData(["files"]).map((item) => item.id),
    ["a", "b", "c"]
  );
}

{
  const client = new FakeQueryClient();
  client.setQueryData(["settings"], {
    registrationEnabled: true,
    siteName: "LinHub",
  });
  const transaction = optimisticPatchQuery(client, ["settings"], {
    registrationEnabled: false,
  });
  client.setQueryData(["settings"], (settings) => ({
    ...settings,
    siteName: "新名称",
  }));
  transaction.rollback();
  assert.deepEqual(client.getQueryData(["settings"]), {
    registrationEnabled: true,
    siteName: "新名称",
  });
}

console.log("乐观事务回归验证通过");
