'use strict';
// Read the actual shipped bundle when this release has removed standalone aliases.
const fs=require('node:fs');
const path=require('node:path');
module.exports=function readSource(file,encoding){
  if(fs.existsSync(file))return fs.readFileSync(file,encoding);
  const name=path.basename(file),directory=path.dirname(file);
  const scripts=name.endsWith('.js');
  const marker='/* ===== '+(scripts?'SCRIPT':'STYLE')+' SOURCE: '+name+' ===== */';
  for(const bundle of (scripts?['vyapar-app.js']:['vyapar-core.css','vyapar-ui.css'])){
    const bundled=path.join(directory,bundle);if(!fs.existsSync(bundled))continue;
    const text=fs.readFileSync(bundled,'utf8');const start=text.indexOf(marker);
    if(start<0)continue;
    const body=start+marker.length;const end=text.indexOf('\n\n/* ===== ',body);
    const source=text.slice(body,end<0?undefined:end).trim()+'\n';
    return encoding ? source : Buffer.from(source);
  }
  throw new Error('Missing runtime source '+file);
};
