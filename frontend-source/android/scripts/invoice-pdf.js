/* Offline invoice PDF export. Financial values are read from the saved document. */
(function () {
  'use strict';
  let libraryPromise, activeJob = null;
  const pending = new Map();
  const nativeCallback = window.onNativeDownloadResult;
  window.onNativeDownloadResult = function (id, ok, message) {
    const request = pending.get(id);
    if (request) {
      pending.delete(id); clearTimeout(request.timer);
      if (ok) request.resolve(message); else request.reject(new Error(message || 'File could not be saved.'));
    } else if (typeof nativeCallback === 'function') nativeCallback(id, ok, message);
  };
  function loadLibrary() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (libraryPromise) return libraryPromise;
    libraryPromise = new Promise(function (resolve, reject) {
      const script = document.createElement('script');
      script.src = 'assets/vendor/pdf-lib.min.js';
      const timer = setTimeout(fail, 15000);
      function fail() { clearTimeout(timer); script.remove(); libraryPromise = null; reject(new Error('PDF engine could not load. Try again.')); }
      script.onload = function () { clearTimeout(timer); if (window.PDFLib) resolve(window.PDFLib); else fail(); };
      script.onerror = fail; document.head.appendChild(script);
    });
    return libraryPromise;
  }
  function value(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function clean(v) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim(); }
  function filename(number) { return ('Invoice-' + clean(number || 'document')).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').slice(0,100) + '.pdf'; }
  function splitText(text, maxWidth, measure) {
    const lines = [];
    clean(text).split(/\r?\n/).forEach(function (paragraph) {
      let line = '';
      paragraph.split(/\s+/).forEach(function (word) {
        const candidate = line ? line + ' ' + word : word;
        if (measure(candidate) <= maxWidth) { line = candidate; return; }
        if (line) { lines.push(line); line = ''; }
        for (const letter of Array.from(word)) {
          if (line && measure(line + letter) > maxWidth) { lines.push(line); line = ''; }
          line += letter;
        }
      });
      lines.push(line);
    });
    return lines;
  }
  function status(message, error) {
    if (typeof window.premiumToast === 'function') window.premiumToast(message, error ? 'error' : 'success');
    else if (typeof window.showGlassToast === 'function') window.showGlassToast(message);
    else if (error) window.alert(message);
  }
  async function generate(model, providedLibrary) {
    model=JSON.parse(JSON.stringify(model || {}));
    const lib = providedLibrary || await loadLibrary();
    const pdf = await lib.PDFDocument.create();
    const regular = await pdf.embedFont(lib.StandardFonts.Helvetica);
    const bold = await pdf.embedFont(lib.StandardFonts.HelveticaBold);
    // Copy the document so a later edit cannot change an in-flight export.
    const tx = model.transaction || {}, business = model.business || {}, s = model.settings || {};
    const currency = clean(tx.currency || business.baseCurrency || 'INR');
    const money = n => currency + ' ' + value(n).toFixed(2);
    const thermal = !!model.thermal;
    let size = thermal ? [s.thermalWidth === '58' ? 164.41 : 226.77, 650] : s.paperSize === 'A5' ? [419.53,595.28] : [595.28,841.89];
    if (!thermal && s.orientation === 'landscape') size.reverse();
    const [width,height] = size, margin = thermal ? 10 : s.paperSize==='A5'?22:30, usable = width - margin * 2;
    const fontSize = thermal ? 8 : s.fontSize === 'small' ? 9 : s.fontSize === 'large' ? 12 : s.paperSize==='A5'?9:10;
    const rowGap = fontSize * (s.theme==='compact'?1.25:1.4), bottom = thermal?26:32;
    const summaryStep=thermal || s.paperSize==='A5' || s.theme==='compact'?18:22;
    const cellPadding=thermal || s.paperSize==='A5'?8:12;
    const rgb = lib.rgb, ink = rgb(.08,.10,.13), muted = rgb(.35,.38,.43), line = rgb(.84,.86,.89);
    const accent = /^#[0-9a-f]{6}$/i.test(s.accent || '') ? s.accent : '#273449';
    const tint = rgb(parseInt(accent.slice(1,3),16)/255,parseInt(accent.slice(3,5),16)/255,parseInt(accent.slice(5),16)/255);
    const pages = []; let page,y,logo;
    const ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    function unicode(text) { try { regular.encodeText(text); return false; } catch (_) { return true; } }
    function measure(text,size,strong) {
      const textValue=clean(text); if(!textValue)return 0;
      if(!unicode(textValue)) return (strong?bold:regular).widthOfTextAtSize(textValue,size);
      if(!ctx) throw new Error('Unicode invoice text requires a canvas-capable browser.');
      ctx.font=(strong?'600 ':'400 ')+size+'px sans-serif'; return ctx.measureText(textValue).width;
    }
    async function text(textValue,x,top,size=fontSize,strong=false,color=ink,maxWidth) {
      textValue=clean(textValue); if(!textValue)return;
      let actual=size;
      if(maxWidth && measure(textValue,actual,strong)>maxWidth) actual=Math.max(6,actual*maxWidth/measure(textValue,actual,strong));
      if(!unicode(textValue)) { page.drawText(textValue,{x,y:height-top-actual,size:actual,font:strong?bold:regular,color}); return; }
      // Canvas uses the device's font shaping for Hindi/Unicode; no missing-glyph substitution.
      const canvas=document.createElement('canvas'),scale=3;
      const w=measure(textValue,actual,strong),h=actual*1.6;
      canvas.width=Math.ceil(w*scale+4);canvas.height=Math.ceil(h*scale+4);
      const c=canvas.getContext('2d');c.scale(scale,scale);c.font=(strong?'600 ':'400 ')+actual+'px sans-serif';c.fillStyle='#171a21';c.textBaseline='top';c.fillText(textValue,0,actual*.1);
      const image=await pdf.embedPng(canvas.toDataURL('image/png'));
      page.drawImage(image,{x,y:height-top-h,width:canvas.width/scale,height:canvas.height/scale});
      canvas.width=canvas.height=1;
    }
    function rule(top) { page.drawLine({start:{x:margin,y:height-top},end:{x:width-margin,y:height-top},thickness:.6,color:line}); }
    if(s.showLogo !== false && business.logo && /^data:image\/(png|jpeg);base64,/i.test(business.logo)) {
      try { logo=/^data:image\/png/i.test(business.logo)?await pdf.embedPng(business.logo):await pdf.embedJpg(business.logo); } catch (_) { /* Optional damaged logo must not prevent invoice export. */ }
    }
    const label = tx.type === 'SALE' || !tx.type ? 'INVOICE' : clean(tx.type).replace(/_/g,' ');
    async function newPage(copy, table) {
      page=pdf.addPage(size);pages.push(page);y=margin;
      await text(business.name || 'Vyapar AI',margin,y,thermal?13:20,true,tint,usable-(logo?45:0));
      if(logo) { const dims=logo.scaleToFit(38,38);page.drawImage(logo,{x:width-margin-dims.width,y:height-y-dims.height,width:dims.width,height:dims.height}); }
      y+=thermal?24:32;
      await text(label+'  '+clean(tx.number),margin,y,fontSize,true,ink,usable);y+=rowGap;
      await text(clean(tx.date)+(copy?'  |  '+copy:''),margin,y,fontSize,false,muted,usable);y+=rowGap;
      if(table) { rule(y+3); y+=12; await tableHeader(); }
    }
    async function paragraph(content,strong=false,color=ink) {
      const lines=splitText(content,usable,t=>measure(t,fontSize,strong));
      for(const part of lines) { if(y+rowGap>height-bottom) await newPage(copyLabel,false);await text(part,margin,y,fontSize,strong,color);y+=rowGap; }
    }
    let columns=[];
    const short=thermal || width<450;
    function buildColumns() {
      const numerical=short ? [['Qty',.12],['Rate',.23],['Amount',.27]] : [['Qty',.07],...(s.showMRP?[['MRP',.12]]:[]),['Rate',.14],...(s.showTax!==false?[['Tax',.09]]:[]),['Amount',.18]];
      const itemWidth=thermal?usable:usable*(1-numerical.reduce((a,c)=>a+c[1],0));
      let x=margin;columns=[{label:'Item',x,width:itemWidth}];x+=itemWidth;
      if(thermal) { columns=[{label:'Item',x:margin,width:usable}];return; }
      numerical.forEach(c=>{columns.push({label:c[0],x,width:usable*c[1]});x+=usable*c[1];});
    }
    buildColumns();
    async function tableHeader() {
      page.drawRectangle({x:margin,y:height-y-22,width:usable,height:22,color:rgb(.94,.95,.97)});
      for(const col of columns) await text(thermal?'Item / Qty x Rate':col.label,col.x+3,y+5,Math.min(fontSize,9),true,ink,col.width-6);
      y+=26;
    }
    async function items() {
      if(y+60>height-bottom) await newPage(copyLabel,false);
      await tableHeader();
      const rows=Array.isArray(tx.items)?tx.items:[];
      if(!rows.length) await paragraph('No item lines on this document.');
      for(let index=0;index<rows.length;index++) {
        const item=rows[index],qty=value(item.qty),rate=value(item.rate==null?item.price:item.rate);
        const heading=(index+1)+'. '+clean(item.name || item.product || 'Item');
        const description=[heading,s.showDescription!==false?clean(item.description):'',s.showHSN!==false && item.hsn?'HSN/SAC: '+clean(item.hsn):'',item.size?'Size: '+clean(item.size):'',item.color?'Colour: '+clean(item.color):'',value(item.discount)?'Line discount: '+value(item.discount)+'%':''].filter(Boolean).join('\n');
        const wraps=splitText(description,columns[0].width-7,t=>measure(t,fontSize,false));
        let lineIndex=0;
        while(lineIndex<wraps.length) {
          if(y+rowGap+cellPadding>height-bottom) await newPage(copyLabel,true);
          const available=Math.max(1,Math.floor((height-bottom-y-cellPadding)/rowGap));
          const chunk=wraps.slice(lineIndex,lineIndex+available),rowHeight=chunk.length*rowGap+cellPadding;
          for(let l=0;l<chunk.length;l++) await text(chunk[l],margin+3,y+5+l*rowGap,fontSize);
          if(lineIndex===0) {
            const amount=item.total != null ? value(item.total) : item.amount != null ? value(item.amount) : qty*rate;
            const vals={Qty:String(qty),MRP:value(item.mrp).toFixed(2),Rate:rate.toFixed(2),Tax:(tx.tax!=null && value(tx.tax)===0?0:value(item.tax ?? item.gst ?? item.taxRate ?? tx.gstPercent))+'%',Amount:amount.toFixed(2)};
            for(const col of columns.slice(1)) {
              const val=vals[col.label];const fs=Math.min(fontSize,9);const w=measure(val,fs,false);
              await text(val,Math.max(col.x+3,col.x+col.width-w-3),y+5,fs,false,ink,col.width-6);
            }
          }
          y+=rowHeight;lineIndex+=chunk.length;
          if(!thermal) rule(y);
        }
        if(thermal) {
          if(y+rowGap+8>height-bottom) await newPage(copyLabel,true);
          const amount=item.total!=null?value(item.total):item.amount!=null?value(item.amount):qty*rate;
          const label=qty+' x '+rate.toFixed(2),amountText=amount.toFixed(2);
          await text(label,margin+3,y,fontSize,false,muted,usable*.52);
          await text(amountText,Math.max(margin+usable*.55,width-margin-measure(amountText,fontSize,true)-3),y,fontSize,true,ink,usable*.45-3);
          y+=rowGap+8;rule(y);
        }
        if(index%12===0) await new Promise(resolve=>setTimeout(resolve,0));
      }
    }
    let copyLabel='';
    const copies=s.originalDuplicate && !thermal ? ['CUSTOMER COPY','OFFICE COPY'] : [''];
    for(const copy of copies) {
      copyLabel=copy;await newPage(copy,false);
      for(const field of [['Address','address','showAddress'],['Phone','phone','showPhone'],['Email','email','showEmail'],['GSTIN','gstin','showGSTIN']]) {
        if(s[field[2]]!==false && business[field[1]]) await paragraph((field[0]==='Address'?'':field[0]+': ')+clean(business[field[1]]),false,muted);
      }
      y+=8;rule(y);y+=12;
      await paragraph('Bill to: '+clean(tx.partyName || tx.customer || 'Walk-in Customer'),true);
      if(tx.eWayBillNo) await paragraph('E-Way Bill: '+clean(tx.eWayBillNo));
      for(const field of model.customFields || []) if(field.enabled!==false) await paragraph(clean(field.label)+': '+clean(field.value));
      y+=10;await items();y+=14;
      const lineSubtotal=(tx.items||[]).reduce((sum,item)=>sum+value(item.qty)*value(item.rate ?? item.price),0);
      const subtotal=tx.subtotal==null?lineSubtotal:value(tx.subtotal);
      // Platform transactions store invoice discount as a percentage. Legacy bills
      // store discountAmount. Preserve both schemas without changing the ledger.
      const lineDiscount=(tx.items||[]).reduce((sum,item)=>sum+value(item.qty)*value(item.rate ?? item.price)*value(item.discount)/100,0);
      const discount=tx.discountAmount==null?lineDiscount+subtotal*value(tx.discountPercent ?? tx.discount)/100:value(tx.discountAmount);
      const received=value(tx.receivedPaid ?? tx.paid);
      const balance=tx.balance==null?Math.max(0,value(tx.total)-received):value(tx.balance);
      const taxParts=[['CGST',tx.cgst],['SGST',tx.sgst],['IGST',tx.igst]].filter(part=>value(part[1])!==0);
      const taxes=taxParts.length && Math.abs(taxParts.reduce((sum,part)=>sum+value(part[1]),0)-value(tx.tax))<.01?taxParts:[['GST',tx.tax]];
      const summary=[['Subtotal',subtotal],...(discount?[['Discount',-discount]]:[]),
        ...(s.showTax!==false?[...taxes,...(value(tx.cess)?[['CESS',tx.cess]]:[])]:[]),
        ...(value(tx.additionalCharges)?[['Other charges',tx.additionalCharges]]:[]),['Total',tx.total],
        ...(s.showReceived!==false?[['Received',received]]:[]),...(s.showBalance!==false?[['Balance',balance]]:[])];
      if(y+summary.length*summaryStep>height-bottom) await newPage(copy,false);
      for(const [label,amount] of summary) {
        if(y+summaryStep>height-bottom) await newPage(copy,false);
        const strong=label==='Total'; if(strong)rule(y-3);
        const display=money(amount),space=measure(display,fontSize,strong);
        const labelX=thermal?margin:Math.max(margin,width-margin-250);
        await text(label,labelX,y,fontSize,strong);await text(display,Math.max(labelX+65,width-margin-space),y,fontSize,strong,ink,width-margin-labelX-65);y+=summaryStep;
      }
      if(s.showPaymentMode!==false && tx.paymentMode) await paragraph('Payment: '+clean(tx.paymentMode));
      if(s.showAmountWords!==false && model.amountWords) await paragraph('Amount in words: '+clean(model.amountWords));
      y+=8;
      if(tx.notes) await paragraph('Notes: '+clean(tx.notes),false,muted);
      if(s.showTerms!==false && s.terms) await paragraph('Terms: '+clean(s.terms),false,muted);
      if(s.showSignature!==false) { y+=s.paperSize==='A5'?6:14;await paragraph(clean(s.signatureText || 'Authorized Signatory'),true); }
    }
    if(s.showPageNumbers!==false) {
      for(let i=0;i<pages.length;i++) { page=pages[i];await text('Page '+(i+1)+' of '+pages.length,margin,height-22,8,false,muted); }
    }
    pdf.setTitle('Invoice '+clean(tx.number));pdf.setAuthor(clean(business.name || 'Vyapar AI'));pdf.setCreator('Vyapar AI');
    return { bytes:await pdf.save(),name:filename(tx.number),pageCount:pages.length };
  }
  function base64(bytes) { let result='';for(let i=0;i<bytes.length;i+=8192)result+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192));return btoa(result); }
  async function save(result) {
    const bridge=window.AndroidDownloads;
    if(bridge && typeof bridge.saveBase64WithResult==='function') {
      const id='invoice-'+Date.now();
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Save confirmation timed out. Check Downloads before retrying.'));},180000);
        pending.set(id,{resolve,reject,timer});
        try { bridge.saveBase64WithResult(result.name,'application/pdf',base64(result.bytes),id); }
        catch(error){clearTimeout(timer);pending.delete(id);reject(error);}
      });
    }
    if(bridge && typeof bridge.saveBase64==='function') {bridge.saveBase64(result.name,'application/pdf',base64(result.bytes));return 'Save requested. Check Downloads/Vyapar AI.';}
    const url=URL.createObjectURL(new Blob([result.bytes],{type:'application/pdf'}));
    const a=document.createElement('a');a.href=url;a.download=result.name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);return 'PDF download started.';
  }
  function download(model) {
    if(activeJob)return activeJob;
    status('Preparing invoice PDF…');
    activeJob=generate(model).then(save).then(message=>{status(message);return true;}).catch(error=>{status(error.message || 'PDF could not be saved. Please try again.',true);return false;}).finally(()=>{activeJob=null;});
    return activeJob;
  }
  window.VyaparInvoicePDF={generate,download,filename,splitText};
})();
