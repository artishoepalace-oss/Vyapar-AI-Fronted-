/* Choose → preview → import. Parsing never mutates the live business data. */
(function (root) {
  'use strict';
  let draft = null, reading = false, generation = 0, photoUrl = '';
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const size = bytes => bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
  function status(text, bad) {
    const el = document.getElementById('uploadStatus');
    if (el) { el.textContent = text; el.className = 'notice' + (bad ? ' bad' : ''); }
  }
  function render() {
    const el = document.getElementById('screen-upload'); if (!el || el.querySelector('.upload-workspace')) return;
    el.innerHTML = `<div class="upload-workspace">
      <div class="workspace-heading"><div><span class="workspace-eyebrow">ADD YOUR DATA</span><h1>Import & scan</h1><p class="muted">Bring records in. Review before saving.</p></div></div>
      <div class="workspace-tabs" role="tablist" aria-label="Upload method">
        <button type="button" role="tab" aria-selected="true" aria-controls="recordImportPanel" onclick="VyaparUpload.tab('import',this)">Import records</button>
        <button type="button" role="tab" aria-selected="false" aria-controls="labelScanPanel" onclick="VyaparUpload.tab('scan',this)">Scan label</button>
      </div>
      <section id="recordImportPanel" class="card upload-panel" role="tabpanel">
        <h2>Choose a file</h2><p class="muted">JSON, CSV or TXT · up to 64 MB</p>
        <label class="file-drop"><input id="uploadFile" type="file" accept=".json,.csv,.txt,application/json,text/csv,text/plain" onchange="VyaparUpload.fileSelected(this)"><span class="file-drop-icon" aria-hidden="true">↥</span><strong id="uploadFileName">Tap to choose a file</strong><span id="uploadFileSize">From your device or Downloads</span></label>
        <label for="uploadType">Record type</label><select id="uploadType" onchange="VyaparUpload.clearPreview()"><option value="auto">Detect automatically</option><option value="profit">Monthly profit</option><option value="stock">Stock</option><option value="sale">Sales</option></select>
        <button id="uploadReview" type="button" class="btn primary upload-main-action" onclick="analyzeFile()">Review file</button>
        <div id="uploadStatus" class="notice" role="status" aria-live="polite">Choose a file to see a preview.</div><div id="uploadPreview"></div>
        <details class="upload-help"><summary>Sample files & accepted fields</summary><p class="muted">Profit: year, month, profit<br>Stock: product, qty<br>Sales: date, product, purchasePrice, sellingPrice, qty</p><div class="actions"><button type="button" class="btn" onclick="downloadSampleJson()">Sample JSON</button><button type="button" class="btn" onclick="downloadSampleCsv()">Sample CSV</button></div><p class="muted">A full backup opens the restore flow.</p></details>
      </section>
      <section id="labelScanPanel" class="card upload-panel" role="tabpanel" hidden>
        <h2>Scan a product label</h2><p class="muted">Choose a clear photo, then review the detected stock.</p>
        <input id="scanMode" type="hidden" value="box"><div class="workspace-tabs" role="group" aria-label="Label type"><button type="button" aria-pressed="true" onclick="VyaparUpload.scanMode('box',this)">Box</button><button type="button" aria-pressed="false" onclick="VyaparUpload.scanMode('carton',this)">Carton</button><button type="button" aria-pressed="false" onclick="VyaparUpload.scanMode('manual',this)">Manual qty</button></div>
        <label class="file-drop photo-drop"><input id="boxLabelFile" type="file" accept="image/*" capture="environment" onchange="VyaparUpload.photoSelected(this)"><span class="file-drop-icon" aria-hidden="true">▧</span><strong id="scanFileName">Take or choose a photo</strong><span>Keep the full label in the frame</span><img id="scanPhotoPreview" alt="Selected product label" hidden></label>
        <div id="scanQtyBox"><label for="scanQty">Quantity / pairs</label><input id="scanQty" type="number" min="1" max="10000" inputmode="numeric" value="1"></div>
        <button type="button" class="btn primary upload-main-action" onclick="scanBoxLabel()">Scan label</button><div id="boxScanStatus" class="notice" role="status" aria-live="polite">Your photo preview will appear above.</div><div id="stockPreviewArea"></div>
      </section></div>`;
  }
  function clearPreview() {
    draft = null; generation++;
    const el = document.getElementById('uploadPreview'); if (el) el.innerHTML = '';
  }
  function fileSelected(input) {
    clearPreview(); const file = input.files && input.files[0];
    document.getElementById('uploadFileName').textContent = file ? file.name : 'Tap to choose a file';
    document.getElementById('uploadFileSize').textContent = file ? size(file.size) : 'From your device or Downloads';
    status(file ? 'File selected. Tap Review file to continue.' : 'Choose a file to see a preview.');
  }
  function rowsFrom(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    const rows = root.normalizeRows(data).slice();
    if (Array.isArray(data.sales)) data.sales.forEach(row => rows.push({...row, type:'sale'}));
    const stocks = data.stock || data.stocks;
    if (Array.isArray(stocks)) stocks.forEach(row => rows.push({...row, type:'stock'}));
    return rows;
  }
  async function review() {
    if (reading) return;
    const input = document.getElementById('uploadFile'), file = input && input.files && input.files[0];
    if (!file) { status('Choose a JSON, CSV or TXT file first.', true); return; }
    clearPreview(); const token = generation; reading = true;
    const button = document.getElementById('uploadReview'); button.disabled = true;
    status('Reading your file…');
    try {
      const text = await root.VyaparFiles.readText(file);
      let rows, data = null, backup = false;
      if (/^[\[{]/.test(text)) {
        data = root.VyaparFiles.parse(text);
        try { root.VyaparFiles.backupData(data); backup = true; } catch (_) {}
        backup = backup || root.VyaparFiles.isEncrypted(data);
        if (!backup) rows = rowsFrom(data);
      } else {
        rows = root.csvTextToObjects(text);
        if (!rows.length && /\.txt$/i.test(file.name || '')) {
          rows = text.split(/\r?\n/).map(line => {
            const m = line.match(/(\d{4}).{0,12}(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*.{0,30}?(-?[\d,]+(?:\.\d+)?)/i);
            return m ? {year:m[1],month:m[2],profit:m[3]} : null;
          }).filter(Boolean);
        }
      }
      if (generation !== token) return;
      if (backup) {
        draft = { file, backup: true };
        status('Full backup detected. Restoring will replace your current business records.');
        document.getElementById('uploadPreview').innerHTML = '<button type="button" class="btn primary upload-main-action" onclick="VyaparUpload.confirmImport()">Restore this backup</button>';
        return;
      }
      rows = (rows || []).filter(row => row && typeof row === 'object' && !Array.isArray(row));
      if (!rows.length) throw new Error('No records found. Check the sample format below.');
      let fingerprint = null;
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
        fingerprint = Array.from(hash, b => b.toString(16).padStart(2, '0')).join('');
      }
      if (generation !== token) return;
      const type = document.getElementById('uploadType').value;
      draft = { rows, file, type, fingerprint };
      const repeated = fingerprint && (Array.isArray(root.state.fileImports) ? root.state.fileImports : []).some(x => x.hash === fingerprint && x.type === type);
      status(rows.length.toLocaleString('en-IN') + ' rows ready to review.' + (repeated ? ' This file was imported before.' : ''));
      const preview = rows.slice(0, 4).map(row => '<li><strong>' + escape(row.product || row.name || row.item || [row.year, row.month].filter(Boolean).join(' · ') || 'Record') + '</strong><span>' + escape(row.date || row.month || row.type || type) + '</span><small>' + escape(row.profit !== undefined ? 'Profit ' + row.profit : row.qty !== undefined ? 'Qty ' + row.qty : '') + '</small></li>').join('');
      document.getElementById('uploadPreview').innerHTML = '<div class="import-preview"><div class="workspace-heading"><h3>Preview</h3><span>First ' + Math.min(4, rows.length) + ' rows</span></div><ul>' + preview + '</ul><p class="muted">Valid rows will be added. Matching manual profit months will be updated.</p><button type="button" class="btn primary upload-main-action" onclick="VyaparUpload.confirmImport()">Import ' + rows.length.toLocaleString('en-IN') + ' rows</button><button type="button" class="btn upload-main-action" onclick="VyaparUpload.clearPreview()">Cancel</button></div>';
    } catch (error) { status(error.message, true); }
    finally { reading = false; button.disabled = false; }
  }
  async function confirmImport() {
    if (!draft || reading) return;
    const next = draft;
    if (next.backup) {
      reading = true;
      try { if (await root.restoreBackup(next.file)) { clearPreview(); status('Backup restored. Your records are ready.'); } }
      finally { reading = false; } return;
    }
    if (next.fingerprint && (Array.isArray(root.state.fileImports) ? root.state.fileImports : []).some(x => x.hash === next.fingerprint && x.type === next.type)) {
      const accepted = await root.showGlassDialog({ title:'Import again?', message:'This file was already imported. Importing again can create duplicate sales or stock.', confirm:true, okText:'Import again', cancelText:'Cancel' });
      if (!accepted) return;
    }
    reading = true;
    try {
      root.VyaparWorkspace.setBusy(true, 'Importing records…');
      const original = root.state;
      const staged = { ...original, sales: original.sales.slice(), stocks: original.stocks.slice(), monthly: original.monthly.map(row => ({...row})) };
      const counts = { profit:0, updated:0, sales:0, stock:0, skipped:0 };
      for (let i = 0; i < next.rows.length; i += 500) {
        // Existing validated import routines work against a staged state only.
        // Restore the live reference before yielding to Android's event loop.
        try {
          root.state = staged;
          const result = root.importDataByType(next.rows.slice(i, i + 500), next.type, 'file-import');
          Object.keys(counts).forEach(key => { counts[key] += result[key] || 0; });
        } finally { root.state = original; }
        root.VyaparWorkspace.busyMessage('Importing ' + Math.min(i + 500, next.rows.length).toLocaleString('en-IN') + ' / ' + next.rows.length.toLocaleString('en-IN') + ' rows…');
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      const changed = counts.profit + counts.updated + counts.sales + counts.stock;
      if (!changed) throw new Error('No valid records found. Check the record type and sample fields.');
      staged.fileImports = (Array.isArray(original.fileImports) ? original.fileImports : []).slice(-99).concat({ hash:next.fingerprint, type:next.type, name:next.file.name, at:new Date().toISOString(), counts });
      await root.VyaparStorage.replace(staged, () => { root.state = staged; root.VyaparInsights.invalidate(); root.render(); });
      clearPreview();
      status(changed.toLocaleString('en-IN') + ' records saved · ' + counts.sales + ' sales · ' + counts.stock + ' stock · ' + (counts.profit + counts.updated) + ' profit · ' + counts.skipped + ' skipped');
      const input = document.getElementById('uploadFile'); if (input) { input.value = ''; document.getElementById('uploadFileName').textContent = 'Tap to choose another file'; document.getElementById('uploadFileSize').textContent = 'Import saved'; }
    } catch (error) { status('Import was not saved: ' + error.message, true); }
    finally { reading = false; root.VyaparWorkspace.setBusy(false); }
  }
  root.VyaparUpload = {
    render, review, clearPreview, fileSelected, confirmImport, rowsFrom,
    tab(value, button) {
      document.getElementById('recordImportPanel').hidden = value !== 'import';
      document.getElementById('labelScanPanel').hidden = value !== 'scan';
      button.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b === button)));
    },
    scanMode(value, button) {
      root.setScanMode(value);
      button.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    },
    photoSelected(input) {
      const file = input.files && input.files[0], image = document.getElementById('scanPhotoPreview');
      if (photoUrl) { URL.revokeObjectURL(photoUrl); photoUrl = ''; }
      image.hidden = !file;
      document.getElementById('scanFileName').textContent = file ? file.name : 'Take or choose a photo';
      if (file) { photoUrl = URL.createObjectURL(file); image.src = photoUrl; }
    }
  };
})(window);
