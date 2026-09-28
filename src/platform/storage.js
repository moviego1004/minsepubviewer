// Keep the existing synchronous reader model while serializing durable writes.
// Failed writes remain dirty and can be retried with flush().
export async function createPersistentStorage({ read, write, onError = () => {} }) {
  const values = { ...await read() };
  let revision = 0;
  let savedRevision = 0;
  let pending = null;

  function flush() {
    if (pending) return pending;
    if (revision === savedRevision) return Promise.resolve();
    pending = (async () => {
      while (savedRevision !== revision) {
        const writingRevision = revision;
        await write({ ...values });
        savedRevision = writingRevision;
      }
    })().finally(() => { pending = null; });
    return pending;
  }

  function changed() {
    revision += 1;
    // Coalesce the library and its backup into a single snapshot.
    queueMicrotask(() => { void flush().catch(onError); });
  }

  return {
    getItem(key) { return Object.hasOwn(values, key) ? values[key] : null; },
    setItem(key, value) {
      const serialized = String(value);
      if (values[key] === serialized) return;
      values[key] = serialized;
      changed();
    },
    removeItem(key) {
      if (!Object.hasOwn(values, key)) return;
      delete values[key];
      changed();
    },
    flush
  };
}
