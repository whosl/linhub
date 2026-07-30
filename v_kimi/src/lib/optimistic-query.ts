import type { QueryClient, QueryKey } from "@tanstack/react-query";

type Identified = { id: string };
type PageLike<T> = { items: T[]; [key: string]: unknown };
type QueryShape<T> = T | T[] | PageLike<T> | undefined;

function deepEqual(left: unknown, right: unknown) {
  if (Object.is(left, right)) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

function mapRecord<T extends Identified>(
  data: QueryShape<T>,
  id: string,
  update: (record: T) => T
): QueryShape<T> {
  if (Array.isArray(data)) {
    return data.map((record) => (record.id === id ? update(record) : record));
  }
  if (data && typeof data === "object" && "items" in data && Array.isArray(data.items)) {
    return {
      ...data,
      items: data.items.map((record) => (record.id === id ? update(record) : record)),
    };
  }
  if (data && "id" in data && data.id === id) return update(data as T);
  return data;
}

function removeRecord<T extends Identified>(data: QueryShape<T>, id: string): QueryShape<T> {
  if (Array.isArray(data)) return data.filter((record) => record.id !== id);
  if (data && typeof data === "object" && "items" in data && Array.isArray(data.items)) {
    return { ...data, items: data.items.filter((record) => record.id !== id) };
  }
  if (data && "id" in data && data.id === id) return undefined;
  return data;
}

function insertRecord<T extends Identified>(
  data: QueryShape<T>,
  record: T,
  position = 0
): QueryShape<T> {
  if (Array.isArray(data)) {
    const without = data.filter((item) => item.id !== record.id);
    const next = [...without];
    next.splice(Math.min(position, next.length), 0, record);
    return next;
  }
  if (data && typeof data === "object" && "items" in data && Array.isArray(data.items)) {
    const without = data.items.filter((item) => item.id !== record.id);
    const next = [...without];
    next.splice(Math.min(position, next.length), 0, record);
    return { ...data, items: next };
  }
  return data;
}

function matchingQueryKeys(queryClient: QueryClient, prefixes: QueryKey[]) {
  const keys = new Map<string, QueryKey>();
  for (const prefix of prefixes) {
    for (const query of queryClient.getQueryCache().findAll({ queryKey: prefix })) {
      keys.set(JSON.stringify(query.queryKey), query.queryKey);
    }
  }
  return [...keys.values()];
}

export function optimisticPatchQuery<T extends object>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  patch: Partial<T>
) {
  const previous = queryClient.getQueryData<T>(queryKey);
  const attempted = previous ? { ...previous, ...patch } : undefined;
  if (attempted) queryClient.setQueryData<T>(queryKey, attempted);
  return {
    reconcile(saved: T) {
      queryClient.setQueryData<T>(queryKey, saved);
    },
    rollback() {
      if (!previous || !attempted) return;
      queryClient.setQueryData<T>(queryKey, (current) => {
        if (!current) return current;
        const next: T = { ...current };
        for (const field of Object.keys(patch) as Array<keyof T>) {
          if (deepEqual(current[field], attempted[field])) {
            next[field] = previous[field];
          }
        }
        return next;
      });
    },
  };
}

export function optimisticPatchRecords<T extends Identified>(
  queryClient: QueryClient,
  prefixes: QueryKey[],
  id: string,
  patch: Partial<T>
) {
  const keys = matchingQueryKeys(queryClient, prefixes);
  const previous = new Map<QueryKey, T>();
  const attempted = new Map<QueryKey, T>();
  for (const key of keys) {
    queryClient.setQueryData<QueryShape<T>>(key, (data) =>
      mapRecord<T>(data, id, (record) => {
        previous.set(key, record);
        const next = { ...record, ...patch };
        attempted.set(key, next);
        return next;
      })
    );
  }
  return {
    reconcile(saved: T) {
      for (const key of keys) {
        queryClient.setQueryData<QueryShape<T>>(key, (data) =>
          mapRecord<T>(data, id, () => saved)
        );
      }
    },
    rollback() {
      for (const key of keys) {
        const before = previous.get(key);
        const optimistic = attempted.get(key);
        if (!before || !optimistic) continue;
        queryClient.setQueryData<QueryShape<T>>(key, (data) =>
          mapRecord<T>(data, id, (current) => {
            const next: T = { ...current };
            for (const field of Object.keys(patch) as Array<keyof T>) {
              if (deepEqual(current[field], optimistic[field])) {
                next[field] = before[field];
              }
            }
            return next;
          })
        );
      }
    },
  };
}

export function optimisticRemoveRecord<T extends Identified>(
  queryClient: QueryClient,
  prefixes: QueryKey[],
  id: string
) {
  const keys = matchingQueryKeys(queryClient, prefixes);
  const removed = new Map<QueryKey, { record: T; index: number }>();
  for (const key of keys) {
    const data = queryClient.getQueryData<QueryShape<T>>(key);
    const list = Array.isArray(data)
      ? data
      : data && typeof data === "object" && "items" in data && Array.isArray(data.items)
        ? data.items
        : data && "id" in data
          ? [data as T]
          : [];
    const index = list.findIndex((record) => record.id === id);
    if (index >= 0) removed.set(key, { record: list[index], index });
    queryClient.setQueryData<QueryShape<T>>(key, (current) =>
      removeRecord<T>(current, id)
    );
  }
  return {
    rollback() {
      for (const key of keys) {
        const snapshot = removed.get(key);
        if (!snapshot) continue;
        queryClient.setQueryData<QueryShape<T>>(key, (data) =>
          insertRecord<T>(data, snapshot.record, snapshot.index)
        );
      }
    },
  };
}

export function optimisticInsertRecord<T extends Identified>(
  queryClient: QueryClient,
  prefixes: QueryKey[],
  temporary: T,
  position = 0
) {
  const keys = matchingQueryKeys(queryClient, prefixes);
  for (const key of keys) {
    queryClient.setQueryData<QueryShape<T>>(key, (data) =>
      insertRecord<T>(data, temporary, position)
    );
  }
  return {
    reconcile(saved: T) {
      for (const key of keys) {
        queryClient.setQueryData<QueryShape<T>>(key, (data) =>
          mapRecord<T>(data, temporary.id, () => saved)
        );
      }
    },
    rollback() {
      for (const key of keys) {
        queryClient.setQueryData<QueryShape<T>>(key, (data) =>
          removeRecord<T>(data, temporary.id)
        );
      }
    },
  };
}
