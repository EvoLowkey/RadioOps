export function parseRadioCode(value){
  const s=String(value??'').trim().toUpperCase();
  const m=/^WT-(\d{2})$/.exec(s);
  if(!m) return null;
  const n=Number(m[1]);
  return n>=1&&n<=40?`WT-${String(n).padStart(2,'0')}`:null;
}

export function isAppleMobileScannerDevice(navigatorLike=globalThis.navigator){
  const ua=String(navigatorLike?.userAgent||'');
  const platform=String(navigatorLike?.platform||'');
  const touchPoints=Number(navigatorLike?.maxTouchPoints||0);
  return /iPad|iPhone|iPod/i.test(ua)||(platform==='MacIntel'&&touchPoints>1);
}

export function getScannerMode({
  hasBarcodeDetector=typeof globalThis.BarcodeDetector!=='undefined',
  hasZxing=Boolean(globalThis.ZXing?.BrowserMultiFormatReader),
  hasGetUserMedia=Boolean(globalThis.navigator?.mediaDevices?.getUserMedia),
  isAppleMobile=isAppleMobileScannerDevice()
}={}){
  if(!hasGetUserMedia) return null;
  if(hasBarcodeDetector) return 'native';
  if(typeof globalThis.jsQR==='function') return 'jsqr';
  if(hasZxing) return 'zxing';
  return null;
}

export function canUseBarcodeDetector(){ return typeof globalThis.BarcodeDetector!=='undefined'; }
export function canUseCameraQrScanner(){ return Boolean(getScannerMode()); }

export function matchesAssignedRadio(scannedValue, assignedRadioId){
  const scanned=parseRadioCode(scannedValue);
  const assigned=parseRadioCode(assignedRadioId);
  return Boolean(scanned&&assigned&&scanned===assigned);
}

export function getPreferredCameraConstraints(){
  return {video:{facingMode:{ideal:'environment'}},audio:false};
}

export function cameraErrorMessage(err){
  const denied=err?.name==='NotAllowedError'||err?.name==='SecurityError';
  if(denied){
    return 'Allow camera access to scan the radio barcode. On iPhone/iPad, open Safari settings for this website and set Camera to Allow, then try again.';
  }
  if(err?.name==='NotFoundError'||err?.name==='OverconstrainedError'){
    return 'No usable camera was found. Close other apps using the camera, confirm camera access is enabled, and try again.';
  }
  return 'Camera could not be started. Close other apps using the camera, confirm browser camera permission, and try again.';
}

export function decodeFrameWithJsQr(video, canvas, decoder=globalThis.jsQR){
  if(typeof decoder!=='function'||!video||!canvas||video.readyState<2) return null;
  const width=video.videoWidth||0, height=video.videoHeight||0;
  if(!width||!height) return null;
  canvas.width=width; canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx) return null;
  ctx.drawImage(video,0,0,width,height);
  const image=ctx.getImageData(0,0,width,height);
  const result=decoder(image.data,width,height,{inversionAttempts:'dontInvert'});
  return result?.data??null;
}

export function decodeFrameWithZxing(video, canvas, reader){
  if(!reader||!video||!canvas||video.readyState<2) return null;
  const width=video.videoWidth||0, height=video.videoHeight||0;
  if(!width||!height) return null;
  canvas.width=width; canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx) return null;
  ctx.drawImage(video,0,0,width,height);
  try{
    const result=reader.decodeFromCanvas(canvas);
    return result?.getText?.() ?? result?.text ?? null;
  }catch{return null;}
}

export function createCode128ZxingReader(ZXingLib=globalThis.ZXing){
  if(!ZXingLib?.BrowserMultiFormatReader) throw new Error('ZXing barcode scanner is unavailable.');
  const hints=new Map();
  if(ZXingLib.DecodeHintType?.POSSIBLE_FORMATS&&ZXingLib.BarcodeFormat?.CODE_128){
    hints.set(ZXingLib.DecodeHintType.POSSIBLE_FORMATS,[ZXingLib.BarcodeFormat.CODE_128]);
  }
  if(ZXingLib.DecodeHintType?.TRY_HARDER) hints.set(ZXingLib.DecodeHintType.TRY_HARDER,true);
  return new ZXingLib.BrowserMultiFormatReader(hints,300);
}
