function createTtlCache({ ttlMs = 5 * 60 * 1000, maxEntries = 250 } = {}) {
  const entries = new Map();

  function prune(now = Date.now()) {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
    }

    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value;
      entries.delete(oldestKey);
    }
  }

  function getOrSet(key, factory) {
    const now = Date.now();
    const existing = entries.get(key);

    if (existing && existing.expiresAt > now) {
      return existing.value;
    }

    const value = Promise.resolve()
      .then(factory)
      .catch((error) => {
        entries.delete(key);
        throw error;
      });

    entries.set(key, {
      value,
      expiresAt: now + ttlMs,
    });
    prune(now);

    return value;
  }

  function clear() {
    entries.clear();
  }

  return {
    getOrSet,
    clear,
  };
}

module.exports = {
  createTtlCache,
};
