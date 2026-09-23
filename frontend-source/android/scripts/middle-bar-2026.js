/* Presentation-only middle bar coordinator.
 * Uses production aria-selected/aria-pressed state; never owns routing, data or storage.
 * CSS transforms move only the thumb, avoiding layout animation on older WebViews.
 */
(function(){
  'use strict';
  var selector='.screen .p1-modebar,.screen .workspace-tabs';
  var cache=new WeakMap(),observed=new WeakSet(),resizeObserver=null;
  var pending=false,first=true;
  function buttons(bar){
    return Array.prototype.filter.call(bar.children,function(node){return node.tagName==='BUTTON';});
  }
  function selectedButton(list){
    for(var i=0;i<list.length;i++){
      if(list[i].getAttribute('aria-selected')==='true'||list[i].getAttribute('aria-pressed')==='true')return list[i];
    }
    for(var j=0;j<list.length;j++)if(list[j].classList.contains('active'))return list[j];
    return list[0];
  }
  function measure(bar){
    if(!bar.isConnected || !bar.getClientRects().length)return;
    var list=buttons(bar);
    if(list.length<2 || list.length>6)return;
    var active=selectedButton(list),track=bar.getBoundingClientRect(),rect=active.getBoundingClientRect();
    if(!track.width||!rect.width)return;
    var x=Math.round((rect.left-track.left)*100)/100;
    var width=Math.round(rect.width*100)/100;
    var old=cache.get(bar);
    if(old && old.x===x && old.width===width && old.active===active)return;
    var instant=!old || old.width!==width || first;
    if(instant)bar.classList.add('vy-middle-instant');
    bar.style.setProperty('--vy-middle-x',x+'px');
    bar.style.setProperty('--vy-middle-width',width+'px');
    bar.classList.add('vy-middle-ready');
    cache.set(bar,{x:x,width:width,active:active});
    if(resizeObserver&&!observed.has(bar)){
      resizeObserver.observe(bar);observed.add(bar);
    }
    if(instant)requestAnimationFrame(function(){bar.classList.remove('vy-middle-instant');});
  }
  function flush(){
    pending=false;
    var bars=document.querySelectorAll(selector);
    for(var i=0;i<bars.length;i++)measure(bars[i]);
    first=false;
  }
  function schedule(){
    if(pending)return;
    pending=true;
    requestAnimationFrame(flush);
  }
  function relevant(change){
    if(change.type==='attributes'){
      return change.attributeName==='aria-selected'||change.attributeName==='aria-pressed'||
        (change.attributeName==='class'&&change.target.classList.contains('screen'));
    }
    if(change.target.matches&&change.target.matches('.screen,.p1-modebar,.workspace-tabs'))return true;
    for(var i=0;i<change.addedNodes.length;i++){
      var node=change.addedNodes[i];
      if(node.nodeType===1&&((node.matches&&node.matches(selector))||(node.querySelector&&node.querySelector(selector))))return true;
    }
    return false;
  }
  function init(){
    if(!document.querySelector('.app'))return;
    if('ResizeObserver' in window)resizeObserver=new ResizeObserver(schedule);
    var root=document.querySelector('.app');
    if('MutationObserver' in window)new MutationObserver(function(changes){
      for(var i=0;i<changes.length;i++)if(relevant(changes[i])){schedule();break;}
    }).observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-selected','aria-pressed','class']});
    /* A click may reveal a previously hidden workspace without rebuilding its bar. */
    document.addEventListener('click',schedule,true);
    window.addEventListener('resize',schedule,{passive:true});
    window.addEventListener('orientationchange',schedule,{passive:true});
    document.addEventListener('visibilitychange',function(){if(!document.hidden)schedule();});
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
