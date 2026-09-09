/* Durable local state. Records are chunked; a snapshot becomes visible only
 * when the transaction containing both records and its manifest completes. */
(function (root) {
  'use strict';
  const KEY = 'vyapar_ai_prod_v1', MARKER = 'vyapar_storage_backend_v1';
  const CHUNK = 1000;
  let db = null, head = null, attached = false, bootReady = false;
  let queue = Promise.resolve(), revision = 0, replacing = false;
  let status = { mode: 'loading', savedAt: '', error: '', records: 0 };
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  function emit() {
    if (root.dispatchEvent && typeof CustomEvent === 'function')
      root.dispatchEvent(new CustomEvent('vyapar:storage-status', { detail: { ...status } }));
  }
  function fail(error) {
    status.error = error.message || 'Device storage is unavailable.';
    emit();
  }
  function open() {
    return new Promise((resolve, reject) => {
      if (!root.indexedDB) { resolve(null); return; }
      let request, settled = false;
      const timer = setTimeout(() => finish(new Error('Close other Vyapar tabs, then reopen the app.')), 8000);
      function finish(error, value) {
        if (settled) { if (value) value.close(); return; }
        settled = true; clearTimeout(timer); error ? reject(error) : resolve(value);
      }
      try { request = root.indexedDB.open('vyapar_ai_data_v2', 1); }
      catch (error) { finish(error); return; }
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta');
        if (!database.objectStoreNames.contains('records')) database.createObjectStore('records');
      };
      request.onerror = () => finish(request.error || new Error('Cannot open device storage.'));
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        finish(null, request.result);
      };
    });
  }
  function read(database) {
    return new Promise((resolve, reject) => {
      const tx = database.transaction(['meta', 'records'], 'readonly');
      const request = tx.objectStore('meta').get('head');
      let output = null, error = null;
      request.onsuccess = () => {
        head = request.result || null;
        if (!head) return;
        if (head.schema !== 1 || !head.arrays || !head.value) {
          error = new Error('Saved data could not be verified. Your saved copy has been kept.'); tx.abort(); return;
        }
        output = { ...head.value };
        Object.keys(head.arrays).forEach(key => {
          const count = head.arrays[key];
          output[key] = new Array(count);
          for (let offset = 0; offset < count; offset += CHUNK) {
            const r = tx.objectStore('records').get(head.slot + '/' + key + '/' + offset);
            r.onsuccess = () => {
              const rows = r.result;
              if (!Array.isArray(rows) || rows.length !== Math.min(CHUNK, count - offset)) {
                error = new Error('Saved records are incomplete. Your saved copy has been kept.'); tx.abort(); return;
              }
              for (let i = 0; i < rows.length; i++) output[key][offset + i] = rows[i];
            };
          }
        });
      };
      tx.oncomplete = () => resolve(output);
      tx.onabort = tx.onerror = () => reject(error || tx.error || new Error('Cannot read saved records.'));
    });
  }
  function manifest(value, slot) {
    const meta = { schema: 1, slot, savedAt: new Date().toISOString(), arrays: {}, value: {} };
    Object.keys(value).forEach(key => {
      if (Array.isArray(value[key])) meta.arrays[key] = value[key].length;
      else meta.value[key] = value[key];
    });
    return meta;
  }
  function shell(value) {
    // Legacy startup/auth helpers only need preferences and profile. Keep their
    // small synchronous cache, never duplicate the record database in it.
    try {
      localStorage.setItem(KEY, JSON.stringify({ __indexedDB: true, profile: value.profile, settings: value.settings }));
      localStorage.setItem(MARKER, 'indexeddb');
    } catch (_) { /* The committed database remains authoritative. */ }
  }
  function commit(value) {
    if (!db) {
      localStorage.setItem(KEY, JSON.stringify(value));
      status = { mode: 'basic', savedAt: new Date().toISOString(), error: '', records: Object.values(value).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0) };
      revision++; emit(); return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const slot = head ? 1 - head.slot : 0;
      const meta = manifest(value, slot);
      let tx;
      try {
        tx = db.transaction(['meta', 'records'], 'readwrite');
        const records = tx.objectStore('records'), metadata = tx.objectStore('meta');
        // A slot's previous manifest enumerates precisely which chunks to remove.
        const stale = metadata.get('slot-' + slot);
        stale.onsuccess = () => {
          if (stale.result) Object.keys(stale.result.arrays).forEach(key => {
            for (let i = 0; i < stale.result.arrays[key]; i += CHUNK)
              if (i >= (meta.arrays[key] || 0)) records.delete(slot + '/' + key + '/' + i);
          });
        };
        // Clone all chunks synchronously through put(), before another event can
        // edit the live arrays. The stale callback only removes obsolete tails.
        Object.keys(meta.arrays).forEach(key => {
          for (let i = 0; i < meta.arrays[key]; i += CHUNK) records.put(value[key].slice(i, i + CHUNK), slot + '/' + key + '/' + i);
        });
        metadata.put(meta, 'slot-' + slot);
        metadata.put(meta, 'head');
        tx.oncomplete = () => {
          head = meta; shell(value); revision++;
          status = { mode: 'indexeddb', savedAt: meta.savedAt, error: '', records: Object.values(meta.arrays).reduce((a, b) => a + b, 0) };
          emit(); resolve();
        };
        tx.onabort = tx.onerror = () => reject(tx.error || new Error('Data was not saved. Free device space, then retry or download a backup.'));
      } catch (error) { if (tx) try { tx.abort(); } catch (_) {} reject(error); }
    });
  }
  function enqueue(value) {
    const job = queue.catch(() => {}).then(() => commit(value));
    queue = job;
    job.catch(fail);
    return job;
  }
  async function attach(getState, restore) {
    if (attached) return ready;
    attached = true;
    let required = false;
    try { required = localStorage.getItem(MARKER) === 'indexeddb' || JSON.parse(localStorage.getItem(KEY) || '{}').__indexedDB === true; } catch (_) {}
    try {
      db = await open();
      if (!db && required) throw new Error('Device storage is unavailable. Reopen the app to load your records.');
      const saved = db ? await read(db) : null;
      if (required && !saved) throw new Error('Saved data is unavailable. Restore a backup after reopening the app.');
      if (saved) restore(saved);
      // Commit migration before retiring the legacy full-state copy.
      await enqueue(getState());
      bootReady = true; resolveReady();
      if (root.dispatchEvent && typeof CustomEvent === 'function') root.dispatchEvent(new CustomEvent('vyapar:storage-ready'));
    } catch (error) {
      fail(error);
      // Never unlock an empty app over an inaccessible primary database.
      if (required || head) {
        if (root.VyaparWorkspace) root.VyaparWorkspace.storageBlocked(status.error);
      } else {
        // First migration failure leaves the legacy copy and in-memory data intact.
        bootReady = true; resolveReady();
        if (root.dispatchEvent && typeof CustomEvent === 'function') root.dispatchEvent(new CustomEvent('vyapar:storage-ready'));
      }
    }
  }
  root.VyaparStorage = {
    attach, ready,
    save: value => bootReady && !replacing ? enqueue(value) : ready,
    async replace(value, apply) {
      if (!bootReady) await ready;
      if (replacing) throw new Error('Another restore is still running.');
      replacing = true;
      try { await enqueue(value); apply(); }
      finally { replacing = false; }
    },
    flush: () => queue,
    get bootReady() { return bootReady; },
    get revision() { return revision; },
    getStatus: () => ({ ...status }),
    // Pure helper for deterministic chunk-boundary tests.
    manifest
  };
})(window);
