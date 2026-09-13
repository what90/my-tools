/* FastImgConvert: local-only image decoding and encoding. No upload requests. */
(() => {
  'use strict';
  const MAX_BYTES = 25 * 1024 * 1024;
  const MAX_PIXELS = 24_000_000;
  const MAX_DIMENSION = 12000;
  const kinds = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/bmp':'bmp','image/avif':'avif'};
  const fail = code => Object.assign(new Error(code), {code});
  function sourceType(file) {
    if (kinds[file.type]) return file.type;
    if (file.type && file.type !== 'application/octet-stream') throw fail('unsupported');
    const ext = file.name.split('.').pop().toLowerCase();
    const found = Object.entries(kinds).find(([,v]) => v === ext || v === 'jpg' && ext === 'jpeg');
    if (!found) throw fail('unsupported');
    return found[0];
  }
  function validateDimensions(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw fail('dimensions');
    if (width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) throw fail('pixels');
  }
  async function decode(file) {
    const type = sourceType(file);
    if (!file.size) throw fail('decode');
    if (file.size > MAX_BYTES) throw fail('large');
    const url = URL.createObjectURL(file);
    const img = new Image();
    try {
      await new Promise((resolve,reject) => {
        const timer = setTimeout(() => {img.src='';reject(fail('decode'));},15000);
        img.onload = () => {clearTimeout(timer);resolve();};
        img.onerror = () => {clearTimeout(timer);reject(fail('decode'));};
        img.src = url;
      });
      validateDimensions(img.naturalWidth,img.naturalHeight);
      return {img,type,width:img.naturalWidth,height:img.naturalHeight};
    } finally {URL.revokeObjectURL(url);}
  }
  async function encode(decoded, {type, quality=.85, width=decoded.width, height=decoded.height}) {
    validateDimensions(width,height);
    if (!['image/jpeg','image/png','image/webp'].includes(type)) throw fail('unsupported');
    const canvas = document.createElement('canvas');
    try {
      canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d');
      if(!ctx)throw fail('encode');
      if(type==='image/jpeg'){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);}
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      ctx.drawImage(decoded.img,0,0,width,height);
      const blob=await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(fail('encode')),20000);
        try {canvas.toBlob(b=>{clearTimeout(timer);b?resolve(b):reject(fail('encode'));},type,quality);}
        catch(error){clearTimeout(timer);reject(fail('encode'));}
      });
      if(blob.type!==type)throw fail('encoderUnsupported');
      return blob;
    } finally {canvas.width=0;canvas.height=0;}
  }
  function filename(file,type,suffix='') {
    const base=file.name.replace(/\.[^.]+$/,'') || 'image';
    return `${base}${suffix}.${kinds[type]}`;
  }
  window.FastImg={decode,encode,sourceType,validateDimensions,filename,MAX_BYTES,MAX_PIXELS,MAX_DIMENSION};
})();
