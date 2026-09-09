/* Bound DOM work without truncating saved data. Search runs over the full list. */
(function(root){
  'use strict';
  const size=40, pages={}, queries={}, selectedYears={}, cache={}; let timer;
  const escape=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function get(kind){
    if(cache[kind])return cache[kind];
    const source=root.state[kind]||[], q=String(queries[kind]||'').trim().toLowerCase(), year=selectedYears[kind]||'';
    let all=source;
    if(q||year)all=source.filter(row=>(!year||String(row.month||row.date||'').startsWith(year))&&(!q||[row.date,row.month,row.item,row.product,row.name,row.source].join(' ').toLowerCase().includes(q)));
    if(kind==='monthly')all=all.slice().sort((a,b)=>String(b.month).localeCompare(String(a.month)));
    const count=all.length, max=Math.max(0,Math.ceil(count/size)-1), page=pages[kind]=Math.max(0,Math.min(pages[kind]||0,max));
    const rows=kind==='daily'||kind==='sales'?all.slice(Math.max(0,count-(page+1)*size),count-page*size).reverse():all.slice(page*size,page*size+size);
    return cache[kind]={rows,count,max,page};
  }
  function controls(kind){
    const data=get(kind), years=[...new Set((root.state[kind]||[]).map(x=>String(x.month||x.date||'').slice(0,4)).filter(x=>/^\d{4}$/.test(x)))].sort().reverse();
    return '<div class="record-controls"><label class="record-search"><span class="sr-only">Search '+kind+'</span><input type="search" id="recordSearch-'+kind+'" placeholder="Search '+kind+'…" value="'+escape(queries[kind]||'')+'" oninput="VyaparRecords.search(\''+kind+'\',this.value)"></label>'+(kind==='monthly'?'<select aria-label="Record year" onchange="VyaparRecords.year(\''+kind+'\',this.value)"><option value="">All years</option>'+years.map(y=>'<option'+(selectedYears[kind]===y?' selected':'')+'>'+y+'</option>').join('')+'</select>':'')+'<div class="workspace-pager"><button type="button" class="btn" '+(!data.page?'disabled':'')+' onclick="VyaparRecords.page(\''+kind+'\',-1)">Previous</button><span>'+data.count.toLocaleString('en-IN')+' records · '+(data.page+1)+' / '+(data.max+1)+'</span><button type="button" class="btn" '+(data.page===data.max?'disabled':'')+' onclick="VyaparRecords.page(\''+kind+'\',1)">Next</button></div></div>';
  }
  function render(kind){delete cache[kind];kind==='stocks'?root.renderStock():root.renderSales();}
  root.VyaparRecords={get,controls,invalidate(){Object.keys(cache).forEach(k=>delete cache[k]);},page(kind,delta){pages[kind]=(pages[kind]||0)+delta;render(kind);},year(kind,value){selectedYears[kind]=value;pages[kind]=0;render(kind);},search(kind,value){queries[kind]=value;pages[kind]=0;clearTimeout(timer);timer=setTimeout(()=>{render(kind);const input=document.getElementById('recordSearch-'+kind);if(input){input.focus();input.setSelectionRange(value.length,value.length);}},200);}};
})(window);
