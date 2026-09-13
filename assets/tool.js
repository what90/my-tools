(() => {
  'use strict';
  const mode=document.body.dataset.tool;
  if(!mode)return;
  const $=id=>document.getElementById(id);
  const E=window.FastImg;
  let lang='en',files=[],decodedResize=null,busy=false,generation=0;
  const urls=new Set();
  const quality=$('qualityInput'),format=$('formatSelect'),run=$('runButton');
  const say=(key,vars={})=>{
    let text=window.FastImgMessages[lang][key] || window.FastImgMessages.en[key] || key;
    for(const [k,v] of Object.entries(vars))text=text.replaceAll('{'+k+'}',String(v));
    return text;
  };
  function translate(){
    lang=$('langSelect').value;
    document.documentElement.lang=lang;
    document.title=say('title_'+mode)+' | FastImgConvert';
    document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=say(el.dataset.i18n,JSON.parse(el.dataset.i18nVars||'{}')));
    document.querySelectorAll('[data-i18n-alt]').forEach(el=>el.alt=say(el.dataset.i18nAlt)+' — '+el.dataset.filename);
    run.textContent=say('run_'+mode);
    if(files.length) $('fileSummary').textContent=say('selected',{count:files.length})+' · '+files.map(f=>f.name).join(', ');
    updateQuality();
  }
  $('langSelect').addEventListener('change',translate);
  const objectURL=blob=>{const url=URL.createObjectURL(blob);urls.add(url);return url;};
  function clearResults(){for(const url of urls)URL.revokeObjectURL(url);urls.clear();$('resultsList').replaceChildren();}
  function localize(el,key,vars={}){el.dataset.i18n=key;el.dataset.i18nVars=JSON.stringify(vars);el.textContent=say(key,vars);return el;}
  function notice(key='',vars={},error=false){
    const status=$('status');
    if(key)localize(status,key,vars);
    else{status.textContent='';delete status.dataset.i18n;delete status.dataset.i18nVars;}
    status.classList.toggle('error',error);
  }
  function setBusy(value){
    busy=value;
    for(const id of ['chooseButton','sampleButton','clearButton','runButton','formatSelect','langSelect','widthInput','heightInput','lockRatio']){
      if($(id))$(id).disabled=value;
    }
    $('dropZone').setAttribute('aria-disabled',String(value));
    $('resultsList').setAttribute('aria-busy',String(value));
    updateQuality();
  }
  function targetType(file){return format.value==='original'?E.sourceType(file):format.value;}
  function updateQuality(){
    $('qualityValue').textContent=quality.value;
    let allPNG=format.value==='image/png';
    if(format.value==='original'&&files.length)allPNG=files.every(f=>{try{return E.sourceType(f)==='image/png';}catch{return false;}});
    quality.disabled=busy||allPNG;
    $('qualityHelp').textContent=say(allPNG?'pngHelp':format.value==='original'?'mixedHelp':'qualityHelp');
  }
  quality.addEventListener('input',updateQuality);
  format.addEventListener('change',updateQuality);
  const reset=()=>{
    if(busy)return;
    generation++;files=[];decodedResize=null;
    clearResults();$('fileInput').value='';$('fileSummary').textContent='';$('controls').hidden=true;notice();updateQuality();
  };
  $('clearButton').addEventListener('click',reset);
  $('chooseButton').addEventListener('click',()=>{if(!busy)$('fileInput').click();});
  $('fileInput').addEventListener('change',event=>{selectFiles(event.target.files);event.target.value='';});
  const zone=$('dropZone');
  zone.addEventListener('dragover',e=>{e.preventDefault();if(!busy)zone.classList.add('dragging');});
  zone.addEventListener('dragleave',()=>zone.classList.remove('dragging'));
  zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('dragging');if(!busy)selectFiles(e.dataTransfer.files);});
  async function selectFiles(selected){
    if(busy)return;
    const list=Array.from(selected);
    reset();
    if(!list.length)return;
    if(list.length>20){notice('batchLimit',{},true);return;}
    if(mode==='resizer'&&list.length!==1){notice('oneOnly',{},true);return;}
    files=list;
    $('fileSummary').textContent=say('selected',{count:files.length})+' · '+files.map(f=>f.name).join(', ');
    if(mode==='resizer'){
      const request=++generation;
      setBusy(true);notice('loading');
      try {
        validateMode(files[0]);
        decodedResize=await E.decode(files[0]);
        if(request!==generation)return;
        $('widthInput').value=decodedResize.width;$('heightInput').value=decodedResize.height;
        $('originalDimensions').textContent=decodedResize.width+' × '+decodedResize.height+' px · '+bytes(files[0].size);
        $('controls').hidden=false;notice();
      }catch(error){files=[];decodedResize=null;notice(error.code||'decode',{},true);}
      finally{setBusy(false);}
    }else{$('controls').hidden=false;}
    updateQuality();
  }
  function validateMode(file){
    const type=E.sourceType(file);
    if(mode!=='converter'&&!['image/jpeg','image/png','image/webp'].includes(type))throw Object.assign(new Error('unsupported'),{code:'unsupported'});
  }
  $('sampleButton').addEventListener('click',async()=>{
    if(busy)return;
    reset();setBusy(true);notice('loading');
    try {
      // Only the bundled public sample is fetched. Selected user files are never sent.
      const response=await fetch('/assets/examples/test-chart.png');
      if(!response.ok)throw new Error('sample');
      const blob=await response.blob();
      setBusy(false);
      await selectFiles([new File([blob],'fastimg-test-chart.png',{type:'image/png'})]);
    }catch{notice('sampleError',{},true);}
    finally{setBusy(false);}
  });
  if(mode==='resizer'){
    for(const side of ['width','height']){
      $(side+'Input').addEventListener('input',()=>{
        if(!decodedResize||!$('lockRatio').checked)return;
        const value=Number($(side+'Input').value);
        if(!Number.isInteger(value)||value<1)return;
        const ratio=decodedResize.width/decodedResize.height;
        $(side==='width'?'heightInput':'widthInput').value=Math.max(1,Math.round(side==='width'?value/ratio:value*ratio));
      });
    }
    $('lockRatio').addEventListener('change',()=>{
      if($('lockRatio').checked&&decodedResize)$('widthInput').dispatchEvent(new Event('input'));
    });
  }
  function bytes(value){
    if(value<1024)return value+' B';
    if(value<1024**2)return (value/1024).toFixed(1)+' KiB';
    return (value/1024**2).toFixed(2)+' MiB';
  }
  function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
  function downloadLink(url,name,key){const a=localize(node('a',undefined,'button small'),key);a.href=url;a.download=name;return a;}
  function errorCard(file,error){const card=node('article',undefined,'result-card');card.append(node('h3',file.name),localize(node('p',undefined,'notice error'),error.code||'encode'));$('resultsList').append(card);}
  function resultCard(file,blob,decoded,width,height,type){
    const card=node('article',undefined,'result-card');
    const name=E.filename(file,type,mode==='resizer'?`-${width}x${height}`:mode==='compressor'?'-compressed':'-converted');
    card.append(node('h3',name));
    card.append(node('p',`${decoded.width} × ${decoded.height} px → ${width} × ${height} px · ${bytes(file.size)} → ${bytes(blob.size)}`,'result-meta'));
    const change=(blob.size/file.size-1)*100;
    card.append(localize(node('p',undefined,change<0?'positive':'warning'),Math.abs(change)<.05?'same':change<0?'smaller':'larger',{percent:Math.abs(change).toFixed(1)}));
    const originalURL=objectURL(file),outputURL=objectURL(blob);
    const previews=node('div',undefined,'comparison');
    for(const [url,key] of [[originalURL,'original'],[outputURL,'output']]){
      const figure=node('figure'),well=node('div',undefined,'image-well'),img=node('img');
      img.src=url;img.dataset.i18nAlt=key;img.dataset.filename=file.name;img.alt=say(key)+' — '+file.name;
      well.append(img);figure.append(well,localize(node('figcaption'),key));previews.append(figure);
    }
    const actions=node('div',undefined,'result-actions');
    actions.append(downloadLink(outputURL,name,'download'),downloadLink(originalURL,file.name,'downloadOriginal'));
    card.append(previews,actions);$('resultsList').append(card);
  }
  run.addEventListener('click',async()=>{
    if(busy||!files.length)return;
    let width,height;
    if(mode==='resizer'){
      width=Number($('widthInput').value);height=Number($('heightInput').value);
      try{E.validateDimensions(width,height);}catch(error){notice(error.code,{},true);return;}
    }
    clearResults();setBusy(true);
    const selection=[...files],qualityValue=Number(quality.value)/100;
    let ok=0,bad=0;
    try {
      for(let i=0;i<selection.length;i++){
        const file=selection[i];notice('processing',{current:i+1,total:selection.length});
        try {
          validateMode(file);
          const decoded=mode==='resizer'?decodedResize:await E.decode(file);
          const type=targetType(file),w=width||decoded.width,h=height||decoded.height;
          const blob=await E.encode(decoded,{type,quality:qualityValue,width:w,height:h});
          resultCard(file,blob,decoded,w,h,type);ok++;
        }catch(error){errorCard(file,error);bad++;}
      }
      notice('ready',{ok,bad},bad>0);
    }finally{setBusy(false);}
  });
  window.addEventListener('pagehide',clearResults);
  translate();
})();
