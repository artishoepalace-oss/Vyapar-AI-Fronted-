/* One reader for Android document providers, plain and password backups. */
(function (root) {
  'use strict';
  const MAX_BYTES = 64 * 1024 * 1024;
  const arrays = ['sales', 'stocks', 'monthly', 'daily', 'products', 'transactions611', 'invoices', 'purchases', 'expenses', 'customers', 'suppliers', 'accounts611', 'ledgerEntries611', 'stockMoves611', 'parties611', 'products611', 'businesses611', 'warehouses611', 'stockLedger', 'cashbook', 'gstRecords', 'auditLog', 'staff', 'notifications', 'paymentReconciliations', 'priceHistory', 'reorderRules', 'purchaseReturns', 'salesReturns', 'barcodeCatalog', 'customerStatements', 'supplierStatements', 'productImports', 'fileImports', 'imports'];
  function parse(text) {
    return JSON.parse(String(text).replace(/^\uFEFF/, '').trim(), (key, value) => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error('Unsupported keys in this file.');
      return value;
    });
  }
  async function readText(file) {
    if (!file) throw new Error('Choose a file first.');
    if (file.size > MAX_BYTES) throw new Error('Choose a file smaller than 64 MB.');
    let text;
    if (typeof FileReader === 'function' && typeof FileReader.prototype.readAsArrayBuffer === 'function') {
      text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Cannot read this file. Save it to Downloads and select it again.'));
        reader.onabort = () => reject(new Error('File reading was cancelled.'));
        reader.onload = () => {
          try {
            const bytes = new Uint8Array(reader.result);
            const encoding = bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le' : bytes[0] === 254 && bytes[1] === 255 ? 'utf-16be' : 'utf-8';
            resolve(new TextDecoder(encoding, { fatal: true }).decode(bytes));
          } catch (_) { reject(new Error('File encoding is invalid. Export it as UTF-8 or UTF-16.')); }
        };
        reader.readAsArrayBuffer(file);
      });
    } else if (typeof file.text === 'function') text = await file.text();
    else text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Cannot read this file. Select a local copy from Downloads.'));
      reader.readAsText(file, 'UTF-8');
    });
    text = String(text).replace(/^\uFEFF/, '').trim();
    if (!text) throw new Error('This file is empty.');
    return text;
  }
  function isEncrypted(value) { return Boolean(value && value.v === 1 && value.s && value.i && value.d); }
  function backupData(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Select a Vyapar AI backup JSON file.');
    let candidate = value;
    if (value.format === 'vyapar-ai-backup') candidate = value.state;
    else if (value.state && typeof value.state === 'object') candidate = value.state;
    else if (value.data && !Array.isArray(value.data) && typeof value.data === 'object') candidate = value.data;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) ||
        !arrays.some(key => Array.isArray(candidate[key])) ||
        !(candidate.profile || candidate.settings || candidate.subscription || arrays.filter(key => Array.isArray(candidate[key])).length >= 3)) {
      throw new Error('This is a data import, not a full Vyapar backup. Use AI Upload to import records.');
    }
    ['profile','settings','subscription'].forEach(key => {
      if(candidate[key] !== undefined && (!candidate[key] || typeof candidate[key] !== 'object' || Array.isArray(candidate[key]))) throw new Error('Invalid backup ' + key + '.');
    });
    arrays.forEach(key => {
      if (candidate[key] !== undefined && (!Array.isArray(candidate[key]) || candidate[key].some(row => !row || typeof row !== 'object' || Array.isArray(row))))
        throw new Error('Invalid ' + key + ' records. The backup was not restored.');
    });
    return candidate;
  }
  async function decrypt(value, password) {
    const bytes = (v, len) => Array.isArray(v) && (!len || v.length === len) && v.every(n => Number.isInteger(n) && n >= 0 && n <= 255);
    if (!value || value.v !== 1 || !bytes(value.s, 16) || !bytes(value.i, 12) || !bytes(value.d) || value.d.length < 16 || value.d.length > MAX_BYTES)
      throw new Error('Invalid encrypted backup.');
    if (typeof crypto === 'undefined' || !crypto.subtle) throw new Error('Encrypted backup support is unavailable on this device.');
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: new Uint8Array(value.s), iterations: 150000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    try { return parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(value.i) }, key, new Uint8Array(value.d)))); }
    catch (_) { throw new Error('Wrong password or corrupted backup.'); }
  }
  root.VyaparFiles = { readText, parse, backupData, isEncrypted, decrypt, maxBytes: MAX_BYTES };
})(window);
