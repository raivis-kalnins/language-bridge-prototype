'use strict';

(function () {
  const BOOT = window.READER_BOOTSTRAP || {};
  const I18N = window.READER_I18N || {en:{}};
  const DB_NAME = 'book_reader_device_library_v2';
  const DB_STORE = 'books';
  const GUEST_OWNER = '__guest__';
  const HOUR = 60 * 60 * 1000;
  const TEMP_AUDIO_CACHE = 'book-reader-audio-temp-v1';
  const MP3_SAMPLE_RATE = 16000;
  const MP3_BITRATE_KBPS = 16;

  const LANGUAGES = [
    ['en-GB','English'],['de-DE','Deutsch'],['fr-FR','Français'],['es-ES','Español'],['ru-RU','Русский'],['pl-PL','Polski'],
    ['lv-LV','Latviešu'],['lt-LT','Lietuvių'],['et-EE','Eesti'],['da-DK','Dansk'],['sv-SE','Svenska'],['nb-NO','Norsk (Bokmål)'],
    ['fi-FI','Suomi'],['is-IS','Íslenska'],['uk-UA','Українська']
  ];
  const LANGUAGE_FLAGS = {
    'en-GB':'gb','de-DE':'de','fr-FR':'fr','es-ES':'es','ru-RU':'ru','pl-PL':'pl',
    'lv-LV':'lv','lt-LT':'lt','et-EE':'ee','da-DK':'dk','sv-SE':'se','nb-NO':'no',
    'fi-FI':'fi','is-IS':'is','uk-UA':'ua'
  };
  const NATURAL_FAMILIES = new Set(['en','de','fr','es','ru','pl','lv','lt','et','da','sv','fi','uk']);
  const OCR_LANGUAGES = {en:'eng',de:'deu',fr:'fra',es:'spa',ru:'rus',pl:'pol',lv:'lav',lt:'lit',et:'est',da:'dan',sv:'swe',nb:'nor',fi:'fin',is:'isl',uk:'ukr'};
  const IMAGE_EXTENSIONS = new Set(['jpg','jpeg','png','webp','avif','bmp','gif']);
  const IMAGE_MIME_TYPES = new Set(['image/jpeg','image/png','image/webp','image/avif','image/bmp','image/gif']);
  const TEST_TEXT = {
    'en-GB':'Hello. This is a short natural reading test.',
    'de-DE':'Guten Tag. Dies ist ein kurzer natürlicher Lesetest.',
    'fr-FR':'Bonjour. Ceci est un court test de lecture naturelle.',
    'es-ES':'Hola. Esta es una breve prueba de lectura natural.',
    'ru-RU':'Здравствуйте. Это короткая проверка естественного чтения.',
    'pl-PL':'Dzień dobry. To jest krótki test naturalnego czytania.',
    'lv-LV':'Labdien! Šī ir latviešu valodas lasīšanas pārbaude. Ģimene ķiršu dārzā lēni lasīja ābolus, un bērni ņēma līdzi siltu tēju.',
    'lt-LT':'Laba diena. Tai trumpas natūralaus lietuvių kalbos skaitymo testas.',
    'et-EE':'Tere! See on lühike loomuliku eesti keele lugemistest.',
    'da-DK':'Hej. Dette er en kort naturlig dansk oplæsningstest.',
    'sv-SE':'Hej. Det här är ett kort naturligt svenskt uppläsningstest.',
    'nb-NO':'Hei. Dette er en kort norsk opplesingstest.',
    'fi-FI':'Hei. Tämä on lyhyt luonnollinen suomenkielinen lukutesti.',
    'is-IS':'Halló. Þetta er stutt íslenskt lestrarpróf.',
    'uk-UA':'Добрий день! Це коротка перевірка природного читання українською мовою.'
  };
  const VOICE_STYLES = [['F1','female_1'],['F2','female_2'],['F3','female_3'],['F4','female_4'],['F5','female_5'],['M1','male_1'],['M2','male_2'],['M3','male_3'],['M4','male_4'],['M5','male_5']];
  const VOICE_STYLE_IDS = new Set(VOICE_STYLES.map(x => x[0]));
  const defaultNaturalStyle = locale => family(locale) === 'lv' ? 'F2' : 'F1';
  function preferredNaturalStyle(locale) {
    const perLanguage = localStorage.getItem('tts_style_' + locale);
    if (VOICE_STYLE_IDS.has(perLanguage)) return perLanguage;
    // Latvian intentionally defaults to Female 2 even for users carrying the old
    // global F1 setting from earlier releases. Other languages keep the legacy choice.
    if (family(locale) === 'lv') return 'F2';
    const legacy = localStorage.getItem('tts_style');
    return VOICE_STYLE_IDS.has(legacy) ? legacy : defaultNaturalStyle(locale);
  }
  const naturalStepsForLocale = locale => family(locale) === 'lv' ? 10 : 8;

  const storedUi = localStorage.getItem('ui_lang') || 'en-GB';
  const initialUi = LANGUAGES.some(x => x[0] === storedUi) ? storedUi : 'en-GB';
  const state = {
    uiLocale: initialUi,
    view: new URLSearchParams(location.search).get('view') || 'library',
    plan: Object.assign({authenticated:false,email:'',role:'guest',bookLimit:1,unlimited:false,guestHours:24,baseMonthlyEur:3,baseBooks:3,extraBookMonthlyEur:1}, BOOT.plan || {}),
    books: [], pendingFile:null, pendingCover:'', processing:false, db:null, installPrompt:null,
    reader:{book:null,page:1,pdfDoc:null,pdfPages:new Map(),pdfWarm:new Map(),pdfOrderUpdating:false,theme:localStorage.getItem('reader_theme') || 'paper',font:Number(localStorage.getItem('reader_font') || 18),line:Number(localStorage.getItem('reader_line') || 1.72)},
    tts:{playing:false,paused:false,engine:localStorage.getItem('tts_engine') || 'natural',style:'F1',rate:Number(localStorage.getItem('tts_rate') || 1),units:[],index:0,audio:null,piper:null,piperVoiceId:'',natural:null,naturalCache:new Map(),token:0},
    audioExport:{running:false,token:0},
    voices:[]
  };

  const app = document.getElementById('app');
  let toastTimer = null;
  let pdfModulePromise = null;
  let mammothPromise = null;
  let piperPromise = null;
  let naturalModulePromise = null;
  let lameJsPromise = null;
  let tesseractPromise = null;
  let hcaptchaPromise = null;

  const esc = s => String(s == null ? '' : s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const family = locale => String(locale || '').toLowerCase().split('-')[0];
  const preferredTtsEngine = locale => { const perLanguage=localStorage.getItem('tts_engine_'+locale); return ['natural','native','piper'].includes(perLanguage)?perLanguage:(localStorage.getItem('tts_engine')||'natural'); };
  const uiFamily = () => family(state.uiLocale);
  const langLabel = code => (LANGUAGES.find(x => x[0] === code) || [code,code])[1];
  const nowIso = () => new Date().toISOString();
  const ownerKey = () => state.plan.authenticated ? String(state.plan.email || '').toLowerCase() : GUEST_OWNER;
  const localBooks = () => state.books.filter(b => b.owner === ownerKey());
  const isPdf = b => b && b.kind === 'pdf';
  const formatBytes = n => !Number.isFinite(n) ? '' : n < 1024*1024 ? `${Math.max(1,Math.round(n/1024))} KB` : `${(n/(1024*1024)).toFixed(n > 10*1024*1024 ? 0 : 1)} MB`;

  function t(key, vars) {
    const lang = uiFamily();
    let value = (I18N[lang] && I18N[lang][key]) || (I18N.en && I18N.en[key]) || key;
    if (vars) Object.keys(vars).forEach(k => { value = String(value).replace(new RegExp(`\\{${k}\\}`,'g'), String(vars[k])); });
    return value;
  }
  function setDocumentLanguage() {
    document.documentElement.lang = state.uiLocale;
    document.title = BOOT.appName || 'Book Reader';
  }
  function setUiLanguage(locale) {
    if (!LANGUAGES.some(x => x[0] === locale)) return;
    state.uiLocale = locale;
    localStorage.setItem('ui_lang', locale);
    setDocumentLanguage();
    renderShell();
  }

  function toast(message, error) {
    let el = document.querySelector('.toast');
    if (!el) { el=document.createElement('div'); el.className='toast'; document.body.appendChild(el); }
    el.textContent=message; el.className='toast'+(error?' error':'');
    requestAnimationFrame(()=>el.classList.add('show'));
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),3600);
  }
  function icon(name) {
    const map={back:'<svg class="back-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',play:'▶',pause:'Ⅱ',stop:'■',settings:'Aa',trash:'×',edit:'✎',download:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v10m0 0 4-4m-4 4-4-4M6 18h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'};
    return map[name] || '•';
  }

  function openDb() {
    if (state.db) return Promise.resolve(state.db);
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,1);
      req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(DB_STORE)){const s=db.createObjectStore(DB_STORE,{keyPath:'id'});s.createIndex('owner','owner',{unique:false});}};
      req.onsuccess=()=>{state.db=req.result;resolve(state.db)}; req.onerror=()=>reject(req.error);
    });
  }
  async function idbGetAll(){const db=await openDb();return new Promise((resolve,reject)=>{const r=db.transaction(DB_STORE,'readonly').objectStore(DB_STORE).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)});}
  async function idbPut(book){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(book);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});}
  async function idbDelete(id){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});}
  async function loadBooks(){
    const all=await idbGetAll(), now=Date.now();
    for(const b of all){if(b.owner===GUEST_OWNER && b.expiresAt && Date.parse(b.expiresAt)<=now)await idbDelete(b.id);}
    state.books=await idbGetAll();
    if(state.plan.authenticated)await adoptGuestBooks();
  }
  async function adoptGuestBooks(){
    const guest=state.books.filter(b=>b.owner===GUEST_OWNER&&(!b.expiresAt||Date.parse(b.expiresAt)>Date.now()));
    if(!guest.length)return;
    const owned=state.books.filter(b=>b.owner===ownerKey()).length,limit=state.plan.unlimited?Infinity:Number(state.plan.bookLimit||3);
    let room=Math.max(0,limit-owned);
    for(const b of guest){if(room<=0)break;b.owner=ownerKey();b.expiresAt=null;await idbPut(b);room--;}
    state.books=await idbGetAll();
  }
  function quotaInfo(){const used=localBooks().length,limit=state.plan.unlimited?Infinity:Number(state.plan.bookLimit||(state.plan.authenticated?3:1));return{used,limit,remaining:limit===Infinity?Infinity:Math.max(0,limit-used)};}

  function cleanupTextString(s){
    return String(s||'').normalize('NFC').replace(/\u00a0/g,' ').replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g,'')
      .replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n').replace(/[ \t]{2,}/g,' ').replace(/\s+([,.;:!?])/g,'$1')
      .replace(/([,.;:!?])([^\s\n”’"')\]])/g,'$1 $2').replace(/\n{3,}/g,'\n\n').trim();
  }
  function cleanSpeechText(s){
    return cleanupTextString(s)
      .replace(/(^|\n)([A-ZĀČĒĢĪĶĻŅŠŪŽĄĘĖĮŲŪÕÄÖÜІЇЄҐ])\s+([a-zāčēģīķļņšūžąęėįųūõäöüіїєґ]{2,})/gu,'$1$2$3')
      .replace(/https?:\/\/\S+/gi,' ')
      .replace(/\b\d{1,2}\/\d{1,2}\/\d{4},?\s+\d{1,2}:\d{2}\b[^\n]*/g,' ')
      .replace(/\b\d+\s*\/\s*\d+\b/g,' ')
      .replace(/[ \t]{2,}/g,' ')
      .trim();
  }
  function sanitizeHtml(html){
    const doc=new DOMParser().parseFromString(String(html||''),'text/html');
    doc.querySelectorAll('script,style,iframe,object,embed,form,input,button,textarea,select,meta,link').forEach(n=>n.remove());
    doc.querySelectorAll('*').forEach(el=>[...el.attributes].forEach(a=>{const n=a.name.toLowerCase(),v=String(a.value||'');if(n.startsWith('on')||n==='style'||(['href','src'].includes(n)&&/^javascript:/i.test(v)))el.removeAttribute(a.name)}));
    const w=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT),nodes=[];while(w.nextNode())nodes.push(w.currentNode);nodes.forEach(n=>{if(!n.parentElement.closest('pre,code'))n.nodeValue=cleanupTextString(n.nodeValue)});
    return doc.body.innerHTML;
  }
  function textToHtml(text,markdown){return cleanupTextString(text).split(/\n/).map(line=>{const s=line.trim();if(!s)return'';if(markdown){const m=s.match(/^(#{1,3})\s+(.+)$/);if(m)return`<h${m[1].length}>${esc(m[2])}</h${m[1].length}>`;}return`<p>${esc(s)}</p>`;}).join('\n');}
  function plainTextFromHtml(html){const doc=new DOMParser().parseFromString(html||'','text/html');return cleanupTextString(doc.body.innerText||doc.body.textContent||'');}

  function loadScriptOnce(src,globalName){
    if(globalName&&window[globalName])return Promise.resolve(window[globalName]);
    return new Promise((resolve,reject)=>{const existing=[...document.scripts].find(s=>s.dataset.src===src);if(existing){existing.addEventListener('load',()=>resolve(globalName?window[globalName]:true),{once:true});return;}const s=document.createElement('script');s.src=src;s.async=true;s.dataset.src=src;s.onload=()=>resolve(globalName?window[globalName]:true);s.onerror=()=>reject(new Error('converter'));document.head.appendChild(s)});
  }
  function getMammoth(){if(!mammothPromise)mammothPromise=loadScriptOnce(BOOT.mammothUrl,'mammoth');return mammothPromise;}
  async function getPdfJs(){if(!pdfModulePromise)pdfModulePromise=import(BOOT.pdfJsUrl).then(mod=>{mod.GlobalWorkerOptions.workerSrc=BOOT.pdfWorkerUrl;return mod});return pdfModulePromise;}
  async function getTesseract(){
    if(!tesseractPromise)tesseractPromise=loadScriptOnce(BOOT.tesseractUrl||'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js','Tesseract');
    return tesseractPromise;
  }
  async function imageFileToCanvas(file){
    let source=null,width=0,height=0,cleanup=()=>{};
    if('createImageBitmap'in window){
      try{source=await createImageBitmap(file,{imageOrientation:'from-image'});width=source.width;height=source.height;cleanup=()=>source.close?.();}catch(_){source=null;}
    }
    if(!source){
      const raw=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(file)});
      source=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error(t('image_decode_failed')));i.src=raw});width=source.naturalWidth||source.width;height=source.naturalHeight||source.height;
    }
    if(!width||!height){cleanup();throw new Error(t('image_decode_failed'));}
    const maxEdge=4200,maxPixels=14000000,scale=Math.min(1,maxEdge/Math.max(width,height),Math.sqrt(maxPixels/(width*height)));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0,canvas.width,canvas.height);cleanup();return canvas;
  }
  async function extractImageText(file,locale,status){
    if(status)status(t('ocr_preparing'));const canvas=await imageFileToCanvas(file),Tesseract=await getTesseract(),ocrLanguage=OCR_LANGUAGES[family(locale)]||'eng';let worker=null;
    try{
      worker=await Tesseract.createWorker(ocrLanguage,1,{logger:m=>{if(!status)return;const p=Number(m?.progress);if(m?.status==='recognizing text'&&Number.isFinite(p))status(t('ocr_progress',{n:Math.max(0,Math.min(100,Math.round(p*100)))}));else if(m?.status)status(t('ocr_loading'));}});
      try{await worker.setParameters({preserve_interword_spaces:'1',tessedit_pageseg_mode:'3'});}catch(_){}
      if(status)status(t('ocr_reading'));const result=await worker.recognize(canvas),text=cleanupTextString(result?.data?.text||'');if(!text)throw new Error(t('ocr_no_text'));const html=textToHtml(text,false);return{kind:'reflow',sourceType:'image',html,text:plainTextFromHtml(html)};
    }finally{if(worker)try{await worker.terminate()}catch(_){}}
  }
  async function getPiper(){if(!piperPromise)piperPromise=import(BOOT.piperModuleUrl).then(m=>m.default||m);return piperPromise;}
  async function getLameJs(){
    if(window.lamejs?.Mp3Encoder)return window.lamejs;
    if(!lameJsPromise)lameJsPromise=new Promise((resolve,reject)=>{
      const url=BOOT.lameJsUrl||'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js',existing=[...document.scripts].find(x=>x.src===url);
      const done=()=>window.lamejs?.Mp3Encoder?resolve(window.lamejs):reject(new Error(t('audio_mp3_unavailable')));
      if(existing){if(window.lamejs?.Mp3Encoder)return resolve(window.lamejs);existing.addEventListener('load',done,{once:true});existing.addEventListener('error',()=>reject(new Error(t('audio_mp3_unavailable'))),{once:true});return;}
      const script=document.createElement('script');script.src=url;script.async=true;script.crossOrigin='anonymous';script.onload=done;script.onerror=()=>reject(new Error(t('audio_mp3_unavailable')));document.head.appendChild(script);
    }).catch(error=>{lameJsPromise=null;throw error});
    return lameJsPromise;
  }
  async function getNatural(onStatus){
    if(state.tts.natural){if(onStatus)state.tts.natural.onStatus=onStatus;return state.tts.natural;}
    if(!naturalModulePromise)naturalModulePromise=import(`./natural-tts.js?v=${encodeURIComponent(BOOT.assetVersion||BOOT.version||'1')}`);
    const mod=await naturalModulePromise;
    state.tts.natural=mod.createNaturalTts({
      baseUrl:BOOT.naturalModelUrl,
      ortModuleUrl:BOOT.ortModuleUrl,
      ortWasmBaseUrl:BOOT.ortWasmBaseUrl,
      onStatus:onStatus||(()=>{})
    });
    return state.tts.natural;
  }

  async function imageFileToDataUrl(file){
    if(!file)return'';
    const raw=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(file)});
    const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=raw});
    const max=1800,scale=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.86);
  }
  async function convertDocx(file){const mammoth=await getMammoth();const buffer=await file.arrayBuffer();const result=await mammoth.convertToHtml({arrayBuffer:buffer},{convertImage:mammoth.images.imgElement(image=>image.read('base64').then(data=>({src:`data:${image.contentType};base64,${data}`})))});const html=sanitizeHtml(result.value||'');return{html,text:plainTextFromHtml(html),messages:result.messages||[]};}
  async function legacyToDocx(file){if(!confirm(t('legacy_confirm')))throw new Error(t('legacy_cancelled'));const form=new FormData();form.append('file',file);const res=await fetch('convert.php',{method:'POST',body:form,credentials:'same-origin'});if(!res.ok){let msg=t('supported_formats');try{const j=await res.json();msg=j.message||msg}catch(_){}throw new Error(msg)}const blob=await res.blob();return new File([blob],file.name.replace(/\.(doc|odt|rtf)$/i,'.docx'),{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});}

  function medianNumber(values){const list=(values||[]).filter(Number.isFinite).sort((a,b)=>a-b);if(!list.length)return 0;const mid=Math.floor(list.length/2);return list.length%2?list[mid]:(list[mid-1]+list[mid])/2;}
  function pdfItemBox(item){
    const str=String(item?.str||'').trim();if(!str)return null;
    const tr=item?.transform||[],x=Number(tr[4]||0),y=Number(tr[5]||0),height=Math.max(1,Math.abs(Number(item?.height||tr[3]||tr[0]||10)));
    let width=Math.abs(Number(item?.width||0));if(!width)width=Math.max(height*.45,str.length*height*.45);
    return{x,y,end:x+width,width,height,str};
  }
  function groupPdfRows(items){
    const boxes=(items||[]).map(pdfItemBox).filter(Boolean);if(!boxes.length)return[];
    const tol=Math.max(1.8,Math.min(5.5,(medianNumber(boxes.map(x=>x.height))||10)*.34)),rows=[];
    boxes.sort((a,b)=>b.y-a.y||a.x-b.x).forEach(box=>{let row=null,best=Infinity;for(const candidate of rows){const d=Math.abs(candidate.y-box.y);if(d<=tol&&d<best){row=candidate;best=d}}if(!row){row={y:box.y,items:[]};rows.push(row)}row.items.push(box);row.y=row.items.reduce((sum,x)=>sum+x.y,0)/row.items.length;});
    rows.sort((a,b)=>b.y-a.y);rows.forEach((r,i)=>{r.index=i;r.items.sort((a,b)=>a.x-b.x)});return rows;
  }
  function detectPdfGutters(rows){
    const all=rows.flatMap(r=>r.items);if(all.length<8)return[];
    const minX=Math.min(...all.map(x=>x.x)),maxX=Math.max(...all.map(x=>x.end)),pageWidth=maxX-minX;if(pageWidth<180)return[];
    const minGap=Math.max(24,pageWidth*.045),edgePad=pageWidth*.10,candidates=[];
    for(const row of rows){for(let i=1;i<row.items.length;i++){const left=row.items[i-1],right=row.items[i],gap=right.x-left.end;if(gap<minGap)continue;const center=left.end+gap/2;if(center<=minX+edgePad||center>=maxX-edgePad)continue;candidates.push({center,gap,row:row.index});}}
    if(candidates.length<3)return[];
    const clusterTol=Math.max(12,pageWidth*.025),clusters=[];
    for(const c of candidates.sort((a,b)=>a.center-b.center)){let cluster=clusters.find(x=>Math.abs(x.center-c.center)<=clusterTol);if(!cluster){cluster={center:c.center,members:[]};clusters.push(cluster)}cluster.members.push(c);cluster.center=cluster.members.reduce((sum,x)=>sum+x.center,0)/cluster.members.length;}
    const minSupport=Math.max(3,Math.ceil(rows.length*.12));
    const scored=clusters.map(c=>{const support=new Set(c.members.map(x=>x.row)).size,avgGap=c.members.reduce((sum,x)=>sum+x.gap,0)/c.members.length;return{center:c.center,support,avgGap,score:support*Math.min(avgGap,pageWidth*.25)}}).filter(c=>c.support>=minSupport&&c.avgGap>=minGap);
    scored.sort((a,b)=>b.score-a.score);const chosen=[];for(const c of scored){if(chosen.every(x=>Math.abs(x.center-c.center)>=pageWidth*.16))chosen.push(c);if(chosen.length>=3)break;}return chosen.sort((a,b)=>a.center-b.center).map(x=>x.center);
  }
  function pdfRowText(items){return (items||[]).slice().sort((a,b)=>a.x-b.x).map(x=>x.str).join(' ').replace(/\s+/g,' ').trim();}
  function pdfRowSpansGutter(row,gutter){const sorted=row.items.slice().sort((a,b)=>a.x-b.x);if(sorted.some(item=>item.x<gutter-2&&item.end>gutter+2))return true;let left=null,right=null;for(const item of sorted){if(item.end<=gutter)left=item;else if(item.x>=gutter&&!right)right=item;}return !!(left&&right&&right.x-left.end<18);}
  function pdfLineAllowed(line){if(!line)return false;if(/https?:\/\//i.test(line))return false;if(/^\d{1,2}\/\d{1,2}\/\d{4},?\s+\d{1,2}:\d{2}/.test(line))return false;if(/^\d+\s*\/\s*\d+$/.test(line))return false;if(/Pasakas\.net/i.test(line)&&line.includes(':'))return false;return true;}
  function pdfTextFromItems(items){
    const rows=groupPdfRows(items),gutters=detectPdfGutters(rows);if(!rows.length)return'';
    const out=[];
    const pushClean=line=>{line=pdfRowText(line?.items||line);if(pdfLineAllowed(line))out.push(line)};
    if(!gutters.length){rows.forEach(pushClean);return cleanSpeechText(out.join('\n'));}
    let band=[];
    const flushBand=()=>{if(!band.length)return;for(let col=0;col<=gutters.length;col++){const lines=[];for(const row of band){const colItems=row.items.filter(item=>{const mid=item.x+item.width/2;let idx=0;while(idx<gutters.length&&mid>gutters[idx])idx++;return idx===col});const line=pdfRowText(colItems);if(pdfLineAllowed(line))lines.push(line)}if(lines.length)out.push(lines.join('\n'));}band=[];};
    for(const row of rows){const spans=gutters.some(g=>pdfRowSpansGutter(row,g));if(spans){flushBand();pushClean(row);}else band.push(row);}flushBand();
    return cleanSpeechText(out.join('\n\n'));
  }
  async function extractPdf(file,status){
    const pdfjs=await getPdfJs(),data=new Uint8Array(await file.arrayBuffer()),doc=await pdfjs.getDocument({data}).promise,pageTexts=[];
    for(let i=1;i<=doc.numPages;i++){if(status)status(t('reading_pdf',{page:i,pages:doc.numPages}));const page=await doc.getPage(i),tc=await page.getTextContent();pageTexts.push(pdfTextFromItems(tc.items));}
    return{pageCount:doc.numPages,pageTexts,text:pageTexts.join('\n\n'),pdfTextLayoutVersion:2};
  }
  async function parseBookFile(file,status,locale='en-GB'){let ext=(file.name.split('.').pop()||'').toLowerCase();if(['doc','odt','rtf'].includes(ext)){file=await legacyToDocx(file);ext='docx'}if(ext==='docx')return Object.assign({kind:'reflow',sourceType:'docx'},await convertDocx(file));if(ext==='pdf')return Object.assign({kind:'pdf',sourceType:'pdf',fileBlob:file},await extractPdf(file,status));if(IMAGE_EXTENSIONS.has(ext)||IMAGE_MIME_TYPES.has(String(file.type||'').toLowerCase()))return extractImageText(file,locale,status);if(ext==='txt'){const text=await file.text(),html=textToHtml(text,false);return{kind:'reflow',sourceType:'txt',html,text:plainTextFromHtml(html)}}if(ext==='md'||ext==='markdown'){const text=await file.text(),html=textToHtml(text,true);return{kind:'reflow',sourceType:'md',html,text:plainTextFromHtml(html)}}if(ext==='html'||ext==='htm'){const html=sanitizeHtml(await file.text());return{kind:'reflow',sourceType:'html',html,text:plainTextFromHtml(html)}}throw new Error(t('supported_formats'));}
  function htmlMetadata(rawHtml){const doc=new DOMParser().parseFromString(String(rawHtml||''),'text/html');const title=cleanupTextString(doc.querySelector('title')?.textContent||doc.querySelector('meta[property="og:title"]')?.content||'');const author=cleanupTextString(doc.querySelector('meta[name="author"]')?.content||'');const description=cleanupTextString(doc.querySelector('meta[name="description"]')?.content||doc.querySelector('meta[property="og:description"]')?.content||'');return{title,author,description};}
  function parsePastedSource(value){const raw=String(value||'').trim();if(!raw)throw new Error(t('paste_required'));const looksHtml=/<[a-z][\s\S]*>/i.test(raw),html=looksHtml?sanitizeHtml(raw):textToHtml(raw,false),text=plainTextFromHtml(html);if(!text)throw new Error(t('no_readable'));return{parsed:{kind:'reflow',sourceType:looksHtml?'pasted-html':'pasted-text',html,text},meta:looksHtml?htmlMetadata(raw):{title:'',author:'',description:''}};}
  function readableWebHtml(rawHtml,baseUrl){
    const doc=new DOMParser().parseFromString(String(rawHtml||''),'text/html');
    doc.querySelectorAll('script,style,noscript,iframe,object,embed,form,nav,header,footer,aside,dialog,template').forEach(n=>n.remove());
    doc.querySelectorAll('[aria-hidden="true"],.cookie,.cookies,.cookie-banner,.consent,.share,.sharing,.social,.advert,.advertisement,.ads,.newsletter,.comments,.breadcrumb,.breadcrumbs').forEach(n=>n.remove());
    const candidates=[...doc.querySelectorAll('article,main,[role="main"],.entry-content,.post-content,.article-content,.story-content,.story,.page-content,.content')]
      .map(el=>({el,len:cleanupTextString(el.innerText||el.textContent||'').length}))
      .filter(x=>x.len>=180).sort((a,b)=>b.len-a.len);
    const source=(candidates[0]?.el||doc.body).cloneNode(true);
    source.querySelectorAll('a[href],img[src]').forEach(el=>{const attr=el.hasAttribute('href')?'href':'src',value=el.getAttribute(attr)||'';try{const u=new URL(value,baseUrl);if(/^https?:$/i.test(u.protocol))el.setAttribute(attr,u.href);else el.removeAttribute(attr)}catch(_){el.removeAttribute(attr)}});
    return sanitizeHtml(source.innerHTML);
  }
  async function fetchUrlSource(url){const target=String(url||'').trim();if(!/^https?:\/\//i.test(target))throw new Error(t('url_invalid'));const data=await api({action:'fetch_url',url:target});if(!data.ok)throw new Error(data.message||t('url_fetch_failed'));const raw=String(data.html||''),finalUrl=data.final_url||target;const html=readableWebHtml(raw,finalUrl),text=plainTextFromHtml(html);if(!text)throw new Error(t('no_readable'));const fullMeta=htmlMetadata(raw),meta=Object.assign({},fullMeta,{title:data.title||fullMeta.title||'',sourceUrl:finalUrl});return{parsed:{kind:'reflow',sourceType:'url',html,text},meta};}

  function detectLocale(text){
    const s=String(text||'').slice(0,30000);
    if(/[іїєґІЇЄҐ]/.test(s))return'uk-UA';
    if(/[а-яА-ЯёЁ]/.test(s))return'ru-RU';
    if(/[āēģīķļņūĀĒĢĪĶĻŅŪ]/.test(s))return'lv-LV';
    if(/[ėįųĖĮŲ]/.test(s))return'lt-LT';
    if(/[õÕ]/.test(s))return'et-EE';
    if(/[ðþÐÞ]/.test(s))return'is-IS';
    if(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(s))return'pl-PL';
    if(/[ñÑ¿¡]/.test(s))return'es-ES';
    if(/[ß]/.test(s))return'de-DE';
    if(/[æÆøØ]/.test(s))return'da-DK';
    if(/[åÅ]/.test(s)&&/\b(och|är|att|som|inte)\b/i.test(s))return'sv-SE';
    if(/[åÅ]/.test(s)&&/\b(og|ikke|som|det|jeg)\b/i.test(s))return'nb-NO';
    if(/[äöÄÖ]/.test(s)&&/\b(ja|on|että|ei|se)\b/i.test(s))return'fi-FI';
    if(/[éèêàçùœÉÈÊÀÇÙŒ]/.test(s))return'fr-FR';
    return'en-GB';
  }
  function bookId(){return'book-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);}
  async function savePreparedBook(parsed,meta){
    const q=quotaInfo();
    if(q.remaining<=0){if(!state.plan.authenticated&&q.limit===1&&q.used===1){if(!confirm(t('replace_guest_confirm')))throw new Error(t('import_cancelled'));const old=localBooks()[0];if(old)await idbDelete(old.id)}else throw new Error(t('plan_limit',{n:q.limit}));}
    const created=nowIso(),book={id:bookId(),owner:ownerKey(),title:meta.title||t('untitled'),subtitle:meta.subtitle||'',author:meta.author||'',description:meta.description||'',language:meta.language||'en-GB',cover:meta.cover||'',kind:parsed.kind,sourceType:parsed.sourceType,html:parsed.html||'',text:parsed.text||'',fileBlob:parsed.fileBlob||null,pageTexts:parsed.pageTexts||[],pageCount:parsed.pageCount||0,pdfTextLayoutVersion:Number(parsed.pdfTextLayoutVersion||0),sourceName:meta.sourceName||'',sourceSize:meta.sourceSize||0,createdAt:created,updatedAt:created,lastOpenedAt:null,progress:0,expiresAt:state.plan.authenticated?null:new Date(Date.now()+Number(state.plan.guestHours||24)*HOUR).toISOString()};
    await idbPut(book);state.books=await idbGetAll();return book;
  }

  const languageFlagCode=code=>LANGUAGE_FLAGS[code]||'gb';
  const languageFlagSrc=code=>`assets/flags/${languageFlagCode(code)}.svg`;
  function uiLanguageOptions(selected){return LANGUAGES.map(([c,n])=>`<option value="${c}" ${c===selected?'selected':''}>${esc(n)}</option>`).join('');}
  function languageOptions(selected){return LANGUAGES.map(([c,n])=>`<option value="${c}" ${c===selected?'selected':''}>${esc(n)}</option>`).join('');}
  function languageMenuOptions(selected){return LANGUAGES.map(([c,n])=>`<button type="button" class="language-option" role="option" data-language-value="${esc(c)}" aria-selected="${c===selected?'true':'false'}"><img src="${esc(languageFlagSrc(c))}" alt="" aria-hidden="true"><span>${esc(n)}</span></button>`).join('');}
  function languageSelectMarkup(id,selected,className,ariaLabel,optionsHtml){
    return `<span class="language-select-wrap" data-language-select><select id="${esc(id)}" class="language-native-select" aria-label="${esc(ariaLabel)}" aria-hidden="true" tabindex="-1">${optionsHtml}</select><button id="${esc(id)}Button" type="button" class="${esc(className)} language-select-button" aria-label="${esc(ariaLabel)}" aria-haspopup="listbox" aria-expanded="false" aria-controls="${esc(id)}Menu"><img class="language-flag" src="${esc(languageFlagSrc(selected))}" alt="" aria-hidden="true"><span class="language-current-label">${esc(langLabel(selected))}</span><span class="language-chevron" aria-hidden="true"><svg viewBox="0 0 20 20" focusable="false"><path d="m5.5 7.5 4.5 4.5 4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg></span></button><span id="${esc(id)}Menu" class="language-menu" role="listbox" aria-label="${esc(ariaLabel)}" hidden>${languageMenuOptions(selected)}</span></span>`;
  }
  function setLanguageMenuOpen(wrap,open){if(!wrap)return;const button=wrap.querySelector('.language-select-button'),menu=wrap.querySelector('.language-menu');if(!button||!menu)return;wrap.classList.toggle('is-open',!!open);button.setAttribute('aria-expanded',open?'true':'false');menu.hidden=!open;}
  function closeLanguageMenus(except){document.querySelectorAll('[data-language-select].is-open').forEach(w=>{if(w!==except)setLanguageMenuOpen(w,false);});}
  let languageDocumentBound=false;
  function syncLanguageSelect(select){const wrap=select?.closest?.('[data-language-select]');if(!wrap)return;const flag=wrap.querySelector('.language-select-button .language-flag'),label=wrap.querySelector('.language-current-label');if(flag)flag.src=languageFlagSrc(select.value);if(label)label.textContent=langLabel(select.value);wrap.querySelectorAll('[data-language-value]').forEach(option=>option.setAttribute('aria-selected',option.dataset.languageValue===select.value?'true':'false'));}
  function bindLanguageSelect(select){
    const wrap=select?.closest?.('[data-language-select]');if(!wrap||wrap.dataset.languageBound==='1')return;wrap.dataset.languageBound='1';
    const button=wrap.querySelector('.language-select-button'),menu=wrap.querySelector('.language-menu');if(!button||!menu)return;
    const options=()=>[...menu.querySelectorAll('[data-language-value]')];
    const focusOption=(index)=>{const list=options();if(!list.length)return;list[(index+list.length)%list.length].focus();};
    const openMenu=()=>{closeLanguageMenus(wrap);menu.classList.remove('open-up');setLanguageMenuOpen(wrap,true);const list=options(),selected=Math.max(0,list.findIndex(o=>o.dataset.languageValue===select.value));requestAnimationFrame(()=>{const rect=wrap.getBoundingClientRect(),spaceBelow=Math.max(0,window.innerHeight-rect.bottom),spaceAbove=Math.max(0,rect.top),needed=Math.min(menu.scrollHeight||360,420);if(spaceBelow<Math.min(needed,300)&&spaceAbove>spaceBelow)menu.classList.add('open-up');focusOption(selected);});};
    button.addEventListener('click',()=>{wrap.classList.contains('is-open')?setLanguageMenuOpen(wrap,false):openMenu();});
    button.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();openMenu();}});
    options().forEach((option,index)=>{
      option.addEventListener('click',()=>{const value=option.dataset.languageValue;if(!value)return;select.value=value;syncLanguageSelect(select);setLanguageMenuOpen(wrap,false);select.dispatchEvent(new Event('change',{bubbles:true}));});
      option.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();focusOption(index+1);}else if(e.key==='ArrowUp'){e.preventDefault();focusOption(index-1);}else if(e.key==='Home'){e.preventDefault();focusOption(0);}else if(e.key==='End'){e.preventDefault();focusOption(options().length-1);}else if(e.key==='Escape'){e.preventDefault();setLanguageMenuOpen(wrap,false);button.focus();}});
    });
    wrap.addEventListener('focusout',()=>setTimeout(()=>{if(!wrap.contains(document.activeElement))setLanguageMenuOpen(wrap,false);},0));
    select.addEventListener('change',()=>syncLanguageSelect(select));syncLanguageSelect(select);
    if(!languageDocumentBound){languageDocumentBound=true;document.addEventListener('pointerdown',e=>{if(!e.target.closest?.('[data-language-select]'))closeLanguageMenus();});document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.querySelectorAll('[data-language-select].is-open').forEach(w=>{const b=w.querySelector('.language-select-button');setLanguageMenuOpen(w,false);b?.focus();});}});}
  }
  function captureCreateDraft(root){
    if(!root||state.view!=='create')return null;
    const q=id=>root.querySelector(id),details=root.querySelector('.optional-details'),preview=q('#urlPreview');
    return {
      sourceMode:root.dataset.sourceMode||'file',bookLanguage:q('#bookLanguage')?.value||state.uiLocale,bookLanguageChanged:q('#bookLanguage')?.dataset.changed||'0',sourceUrl:q('#sourceUrl')?.value||'',sourcePaste:q('#sourcePaste')?.value||'',bookTitle:q('#bookTitle')?.value||'',bookSubtitle:q('#bookSubtitle')?.value||'',bookAuthor:q('#bookAuthor')?.value||'',bookDescription:q('#bookDescription')?.value||'',detailsOpen:!!details?.open,fileName:q('#fileName')?.textContent||'',urlPreviewText:preview?.textContent||'',urlPreviewHidden:preview?preview.hidden:true,urlSource:root._urlSource||null,urlRequested:root._urlRequested||''
    };
  }
  function restoreCreateDraft(root,draft){
    if(!root||!draft||state.view!=='create')return;
    const set=(id,value)=>{const el=root.querySelector(id);if(el)el.value=value;};
    set('#bookLanguage',draft.bookLanguage);set('#sourceUrl',draft.sourceUrl);set('#sourcePaste',draft.sourcePaste);set('#bookTitle',draft.bookTitle);set('#bookSubtitle',draft.bookSubtitle);set('#bookAuthor',draft.bookAuthor);set('#bookDescription',draft.bookDescription);
    const lang=root.querySelector('#bookLanguage');if(lang){lang.dataset.changed=draft.bookLanguageChanged||'0';syncLanguageSelect(lang);}
    const details=root.querySelector('.optional-details');if(details)details.open=!!draft.detailsOpen;
    const fileName=root.querySelector('#fileName');if(fileName)fileName.textContent=draft.fileName||'';
    const cover=root.querySelector('#coverPreview');if(cover&&state.pendingCover)cover.innerHTML=`<img src="${state.pendingCover}" alt="">`;
    root._urlSource=draft.urlSource;root._urlRequested=draft.urlRequested;
    const preview=root.querySelector('#urlPreview');if(preview){preview.textContent=draft.urlPreviewText||'';preview.hidden=!!draft.urlPreviewHidden;}
    const tab=root.querySelector(`[data-source-tab="${draft.sourceMode}"]`);if(tab&&draft.sourceMode!=='file')tab.click();
  }
  function switchUiLanguageKeepingCreate(locale,root){const draft=captureCreateDraft(root);if(draft)draft.bookLanguage=locale;setUiLanguage(locale);if(draft)restoreCreateDraft(document.getElementById('view'),draft);}
  function renderShell(){
    app.innerHTML=`<div class="app-shell">
      <header class="topbar">
        <button class="brand" data-view="library" aria-label="${esc(BOOT.appName||'Book Reader')}"><span class="brand-mark"><img src="assets/icons/owl-book-64.png" alt=""></span><span class="brand-title">${esc(BOOT.appName||'Book Reader')}</span></button>
        <nav class="topnav" aria-label="Main navigation">${navButton('library',t('nav_library'))}${navButton('create',t('nav_create'))}${navButton('voices',t('nav_voices'))}${navButton('account',t('nav_account'))}</nav>
        <div class="top-actions"><div class="language-switch"><span class="sr-only">${esc(t('language'))}</span>${languageSelectMarkup('uiLanguage',state.uiLocale,'styled-select',t('language'),uiLanguageOptions(state.uiLocale))}</div><span class="pill-status">${state.plan.authenticated?esc(state.plan.email):esc(t('private_guest'))}</span><button class="icon-btn install-btn" data-action="install" title="${esc(t('install_app'))}">${icon('download')}</button></div>
      </header>
      <main class="main"><div class="view" id="view"></div></main>
      <footer class="site-footer"><div class="footer-inner"><div class="footer-copy"><span>© ${new Date().getFullYear()} ${esc(BOOT.appName||'Book Reader')}</span><span class="footer-dot">·</span><span>${esc(t('developed_by'))} <a href="https://digitalpulse.click/" target="_blank" rel="noopener noreferrer">DigitalPulse.click</a></span></div><nav class="footer-install" aria-label="${esc(t('install_app'))}"><a href="#install-android" data-install-platform="android">${esc(t('install_android'))}</a><a href="#install-apple" data-install-platform="apple">${esc(t('install_apple'))}</a></nav></div></footer>
    </div>`;
    bindGlobal();renderView();
  }
  function navButton(view,label){return`<button data-view="${view}" class="${state.view===view?'active':''}">${esc(label)}</button>`;}
  function bindGlobal(){document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));const lang=document.getElementById('uiLanguage');if(lang){lang.onchange=()=>{syncLanguageSelect(lang);switchUiLanguageKeepingCreate(lang.value,document.getElementById('view'));};bindLanguageSelect(lang);}const install=document.querySelector('[data-action="install"]');if(install)install.onclick=installApp;document.querySelectorAll('[data-install-platform]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();installPlatform(a.dataset.installPlatform)}));}
  function navigate(view){state.view=view;const u=new URL(location.href);u.searchParams.set('view',view);history.replaceState({},'',u);renderShell();}
  function renderView(){const root=document.getElementById('view');if(!root)return;if(state.view==='library')renderLibrary(root);else if(state.view==='create')renderCreate(root);else if(state.view==='voices')renderVoices(root);else renderAccount(root);}

  function renderLibrary(root){
    const books=localBooks().sort((a,b)=>String(b.lastOpenedAt||b.createdAt).localeCompare(String(a.lastOpenedAt||a.createdAt))),q=quotaInfo();
    root.innerHTML=`<section class="hero"><div class="hero-copy"><div class="eyebrow">${esc(t('library_kicker'))}</div><h1>${esc(t('library_title'))}</h1><p class="lead">${esc(t('library_lead'))}</p><div class="hero-actions"><button class="btn primary" data-go-create>${esc(t('add_book'))}</button><button class="btn secondary" data-go-voices>${esc(t('setup_voice'))}</button></div></div><aside class="hero-note"><span class="small-label">${esc(t('library'))}</span><strong>${q.used}</strong><span>${q.limit===Infinity?esc(t('unlimited')):`${q.limit} ${esc(t('allowed'))}`}</span></aside></section>
      <section class="section feature-row"><article><h3>${esc(t('private_title'))}</h3><p>${esc(t('private_desc'))}</p></article><article><h3>${esc(t('listen_title'))}</h3><p>${esc(t('listen_desc'))}</p></article><article><h3>${esc(t('typography_title'))}</h3><p>${esc(t('typography_desc'))}</p></article></section>
      <section class="section"><div class="panel-title"><div><h2>${esc(t('library'))}</h2><p class="muted">${q.used} ${esc(t('saved'))} · ${q.limit===Infinity?esc(t('unlimited')):`${q.limit} ${esc(t('allowed'))}`}</p></div><span class="badge ${state.plan.authenticated?'green':'warn'}">${esc(state.plan.authenticated?t('device_storage'):t('guest_24'))}</span></div><div class="${books.length?'library-grid':'empty'}">${books.length?books.map(bookCard).join(''):esc(t('no_books'))}</div></section>`;
    root.querySelector('[data-go-create]').onclick=()=>navigate('create');root.querySelector('[data-go-voices]').onclick=()=>navigate('voices');root.querySelectorAll('[data-open-book]').forEach(b=>b.onclick=()=>openBook(b.dataset.openBook));root.querySelectorAll('[data-delete-book]').forEach(b=>b.onclick=()=>deleteBook(b.dataset.deleteBook));
  }
  function bookCard(b){const left=b.expiresAt?Math.max(0,Date.parse(b.expiresAt)-Date.now()):null,expiry=left==null?t('saved_locally'):t('hours_left',{n:Math.max(1,Math.ceil(left/HOUR))});return`<article class="book-card"><div class="book-cover">${b.cover?`<img src="${esc(b.cover)}" alt="">`:`<div class="cover-letter">${esc((b.title||'B').charAt(0).toUpperCase())}</div>`}<div class="cover-copy"><strong>${esc(b.title)}</strong><span>${esc(b.author||langLabel(b.language))}</span></div></div><div class="book-body"><div class="book-meta"><span>${esc(langLabel(b.language))}</span><span>${esc(expiry)}</span></div><div class="book-actions"><button class="btn compact primary" data-open-book="${esc(b.id)}">${esc(t('read'))}</button><button class="btn compact ghost" data-delete-book="${esc(b.id)}" title="${esc(t('delete'))}">${icon('trash')}</button></div></div></article>`;}
  async function deleteBook(id){const b=state.books.find(x=>x.id===id);if(!b)return;if(!confirm(t('delete_confirm',{title:b.title})))return;await idbDelete(id);state.books=await idbGetAll();renderView();toast(t('book_removed'));}

  function renderCreate(root){
    const existingGuest=!state.plan.authenticated&&localBooks().length>0;
    root.innerHTML=`<div class="page-heading simple-heading"><div class="eyebrow">${esc(t('quick_start'))}</div><h1>${esc(t('quick_add_title'))}</h1><p class="lead">${esc(t('quick_add_lead'))}</p></div>${existingGuest?`<div class="notice warn"><strong>${esc(t('guest_limit'))}</strong><span>${esc(t('guest_replace_item'))}</span></div>`:''}
      <section class="paper-panel quick-import">
        <div class="quick-step"><span class="step-badge">1</span><div class="quick-step-copy"><strong>${esc(t('choose_language_first'))}</strong><span>${esc(t('choose_language_help'))}</span></div></div>
        <div class="quick-language-row"><label class="sr-only" for="bookLanguageButton">${esc(t('book_language'))}</label>${languageSelectMarkup('bookLanguage',state.uiLocale,'quick-language styled-select',t('book_language'),languageOptions(state.uiLocale))}</div>
        <div class="quick-step source-step"><span class="step-badge">2</span><div class="quick-step-copy"><strong>${esc(t('choose_source'))}</strong><span>${esc(t('choose_source_help'))}</span></div></div>
        <div class="quick-source-grid" role="tablist">
          <button class="quick-source active" type="button" data-source-tab="file"><span class="quick-source-icon">↑</span><strong>${esc(t('source_file'))}</strong><small>${esc(t('quick_file_help'))}</small></button>
          <button class="quick-source" type="button" data-source-tab="url"><span class="quick-source-icon">↗</span><strong>${esc(t('source_url'))}</strong><small>${esc(t('quick_url_help'))}</small></button>
          <button class="quick-source" type="button" data-source-tab="paste"><span class="quick-source-icon">&lt;/&gt;</span><strong>${esc(t('source_paste'))}</strong><small>${esc(t('quick_paste_help'))}</small></button>
        </div>
        <div class="quick-source-panel" data-source-panel="file"><div class="upload-zone quick-upload" id="dropZone"><input id="bookFile" type="file" accept=".pdf,.docx,.doc,.odt,.rtf,.txt,.md,.markdown,.html,.htm,.jpg,.jpeg,.png,.webp,.avif,.bmp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp,image/avif,image/bmp,image/gif"><div class="upload-icon">＋</div><div class="upload-title">${esc(t('quick_upload_title'))}</div><div class="fine">${esc(t('quick_upload_formats'))}</div><div class="file-name" id="fileName"></div></div></div>
        <div class="quick-source-panel" data-source-panel="url" hidden><div class="field quick-url-field"><label>${esc(t('web_page_url'))}</label><input id="sourceUrl" type="url" inputmode="url" autocapitalize="off" autocomplete="url" placeholder="https://example.com/article"></div><div id="urlPreview" class="source-preview" hidden></div><p class="fine">${esc(t('url_privacy_note'))}</p></div>
        <div class="quick-source-panel" data-source-panel="paste" hidden><div class="field"><label>${esc(t('paste_html_text'))}</label><textarea id="sourcePaste" class="source-paste" placeholder="${esc(t('paste_placeholder'))}"></textarea></div><p class="fine">${esc(t('paste_note'))}</p></div>
        <div id="processStatus" class="fine status-line" aria-live="polite"></div>
        <button id="prepareBtn" class="btn primary quick-read-btn">${esc(t('add_and_read'))}</button>
      </section>
      <details class="paper-panel optional-details"><summary>${esc(t('optional_details'))}</summary><div class="optional-details-body"><div class="create-preview"><div class="cover-preview" id="coverPreview"><span>${esc(t('cover'))}</span></div><div class="grow"><div class="field"><label>${esc(t('cover_image'))}</label><input id="coverFile" type="file" accept="image/*"></div><div class="field"><label>${esc(t('title'))}</label><input id="bookTitle" maxlength="160" placeholder="${esc(t('book_title'))}"></div></div></div><div class="field-row"><div class="field"><label>${esc(t('subtitle'))}</label><input id="bookSubtitle" maxlength="200" placeholder="${esc(t('optional_subtitle'))}"></div><div class="field"><label>${esc(t('author'))}</label><input id="bookAuthor" maxlength="140" placeholder="${esc(t('author_name'))}"></div></div><div class="field"><label>${esc(t('description'))}</label><textarea id="bookDescription" maxlength="2000" placeholder="${esc(t('short_description'))}"></textarea></div><button class="btn secondary" id="privacyBtn">${esc(t('storage_details'))}</button></div></details>`;
    root.dataset.sourceMode='file';
    const fileInput=root.querySelector('#bookFile'),coverInput=root.querySelector('#coverFile'),zone=root.querySelector('#dropZone'),lang=root.querySelector('#bookLanguage');lang.dataset.changed='0';lang.onchange=()=>{syncLanguageSelect(lang);lang.dataset.changed='1';const locale=lang.value,draft=captureCreateDraft(root);if(draft){draft.bookLanguage=locale;draft.bookLanguageChanged='1';}setUiLanguage(locale);if(draft)restoreCreateDraft(document.getElementById('view'),draft);};bindLanguageSelect(lang);
    const switchMode=mode=>{root.dataset.sourceMode=mode;root.querySelectorAll('[data-source-tab]').forEach(b=>b.classList.toggle('active',b.dataset.sourceTab===mode));root.querySelectorAll('[data-source-panel]').forEach(p=>p.hidden=p.dataset.sourcePanel!==mode);root.querySelector('#processStatus').textContent='';};
    root.querySelectorAll('[data-source-tab]').forEach(b=>b.onclick=()=>switchMode(b.dataset.sourceTab));
    fileInput.onchange=()=>selectFile(fileInput.files[0],root);coverInput.onchange=()=>selectCover(coverInput.files[0],root);['dragenter','dragover'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.add('drag')}));['dragleave','drop'].forEach(ev=>zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.remove('drag')}));zone.addEventListener('drop',e=>{const f=e.dataTransfer.files[0];if(f){switchMode('file');selectFile(f,root)}});
    root.querySelector('#sourceUrl').addEventListener('change',()=>{root._urlSource=null;root._urlRequested='';root.querySelector('#urlPreview').hidden=true;});
    root.querySelector('#prepareBtn').onclick=()=>prepareFromForm(root);root.querySelector('#privacyBtn').onclick=showStorageDetails;
  }
  function selectFile(file,root){if(!file)return;state.pendingFile=file;root.querySelector('#fileName').textContent=`${file.name} · ${formatBytes(file.size)}`;const title=root.querySelector('#bookTitle');if(!title.value)title.value=file.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ');}
  async function selectCover(file,root){if(!file)return;try{state.pendingCover=await imageFileToDataUrl(file);root.querySelector('#coverPreview').innerHTML=`<img src="${state.pendingCover}" alt="">`}catch(_){toast(t('could_not_cover'),true)}}
  function applySourceMeta(root,meta){if(!meta)return;const title=root.querySelector('#bookTitle'),author=root.querySelector('#bookAuthor'),description=root.querySelector('#bookDescription');if(meta.title&&!title.value)title.value=meta.title;if(meta.author&&!author.value)author.value=meta.author;if(meta.description&&!description.value)description.value=meta.description;}
  async function previewUrl(root){const btn=root.querySelector('#previewUrlBtn'),url=root.querySelector('#sourceUrl').value.trim(),preview=root.querySelector('#urlPreview'),status=root.querySelector('#processStatus');if(!url)return toast(t('url_required'),true);btn.disabled=true;status.textContent=t('loading_url');try{const result=await fetchUrlSource(url);root._urlSource=result;root._urlRequested=url;applySourceMeta(root,result.meta);const detected=detectLocale(result.parsed.text),lang=root.querySelector('#bookLanguage');if(lang.dataset.changed!=='1'&&detected){lang.value=detected;syncLanguageSelect(lang);}preview.hidden=false;preview.textContent=t('url_loaded',{title:result.meta.title||result.meta.sourceUrl||url,chars:result.parsed.text.length});status.textContent='';}catch(e){root._urlSource=null;preview.hidden=true;status.textContent='';toast(e.message||t('url_fetch_failed'),true)}finally{btn.disabled=false;}}
  async function prepareFromForm(root){
    if(state.processing)return;const mode=root.dataset.sourceMode||'file',langEl=root.querySelector('#bookLanguage'),btn=root.querySelector('#prepareBtn'),status=root.querySelector('#processStatus');let parsed=null,sourceMeta={},sourceName='',sourceSize=0;
    state.processing=true;btn.disabled=true;btn.innerHTML=`<span class="spinner"></span>${esc(t('preparing'))}`;
    try{
      if(mode==='file'){const file=state.pendingFile;if(!file)throw new Error(t('choose_document'));parsed=await parseBookFile(file,msg=>status.textContent=msg,langEl.value);sourceName=file.name;sourceSize=file.size;}
      else if(mode==='url'){const url=root.querySelector('#sourceUrl').value.trim();if(!url)throw new Error(t('url_required'));status.textContent=t('loading_url');const result=(root._urlSource&&root._urlRequested===url)?root._urlSource:await fetchUrlSource(url);parsed=result.parsed;sourceMeta=result.meta;sourceName=result.meta.sourceUrl||url;sourceSize=new Blob([parsed.html||parsed.text||'']).size;applySourceMeta(root,sourceMeta);}
      else {const result=parsePastedSource(root.querySelector('#sourcePaste').value);parsed=result.parsed;sourceMeta=result.meta;sourceName=t('pasted_source_name');sourceSize=new Blob([parsed.html||parsed.text||'']).size;applySourceMeta(root,sourceMeta);}
      const detected=detectLocale(parsed.text);if(langEl.dataset.changed!=='1'&&detected){langEl.value=detected;if(detected!==state.uiLocale)toast(t('language_detected',{language:langLabel(detected)}));}
      const fallbackTitle=mode==='file'?(state.pendingFile?.name||t('untitled')).replace(/\.[^.]+$/,''):mode==='url'?(sourceMeta.title||t('web_page')):t('pasted_text');
      const meta={title:root.querySelector('#bookTitle').value.trim()||fallbackTitle,subtitle:root.querySelector('#bookSubtitle').value.trim(),author:root.querySelector('#bookAuthor').value.trim(),description:root.querySelector('#bookDescription').value.trim(),language:langEl.value,cover:state.pendingCover,sourceName,sourceSize};
      status.textContent=t('saving_device');const book=await savePreparedBook(parsed,meta);state.pendingFile=null;state.pendingCover='';toast(t('book_saved'));navigate('library');setTimeout(()=>openBook(book.id),100);
    }catch(e){status.textContent='';toast(e.message||t('unable_prepare'),true)}finally{state.processing=false;if(document.body.contains(btn)){btn.disabled=false;btn.textContent=t('prepare_save')}}
  }
  function showStorageDetails(){showModal(t('storage_title'),`<p>${esc(t('storage_p1_item'))}</p><p>${esc(t('storage_p2'))}</p><p class="fine">${esc(t('storage_p3'))}</p>`);}

  async function openBook(id){const book=state.books.find(b=>b.id===id);if(!book)return;book.lastOpenedAt=nowIso();await idbPut(book);state.reader.book=book;state.reader.pdfDoc=null;state.reader.pdfPages.clear();state.reader.pdfWarm.clear();state.reader.pdfOrderUpdating=false;state.tts.engine=preferredTtsEngine(book.language);state.tts.style=preferredNaturalStyle(book.language);state.reader.page=Math.max(1,Math.min(book.pageCount||1,Number(book.lastPage||1)));stopTts();renderReader();if(isPdf(book)){await renderPdfPage();await ensurePdfReadingOrder(book);}else decorateReflowTts();scheduleNaturalWarmup(book);}
  async function ensurePdfReadingOrder(book){if(!isPdf(book)||Number(book.pdfTextLayoutVersion||0)>=2||!book.fileBlob)return;const status=document.getElementById('voiceStatus');state.reader.pdfOrderUpdating=true;try{if(status)status.textContent=t('pdf_rebuilding_order');const parsed=await extractPdf(book.fileBlob,msg=>{if(status&&state.reader.book?.id===book.id)status.textContent=msg});book.pageTexts=parsed.pageTexts||[];book.text=parsed.text||'';book.pageCount=parsed.pageCount||book.pageCount;book.pdfTextLayoutVersion=2;book.updatedAt=nowIso();await idbPut(book);if(status&&state.reader.book?.id===book.id){const eng=effectiveEngine(book.language),label=eng==='natural'?t('natural_voice'):eng==='piper'?t('classic_local_voice'):t('device_voice');status.textContent=`${label} · ${t('continuous_pages')}`;}toast(t('pdf_order_updated'));}catch(e){console.warn('Could not refresh PDF reading order',e);if(status&&state.reader.book?.id===book.id)status.textContent=t('pdf_order_update_failed');}finally{state.reader.pdfOrderUpdating=false;}}
  function closeReader(){stopTts();state.reader.book=null;state.reader.pdfDoc=null;state.reader.pdfPages.clear();state.reader.pdfWarm.clear();document.documentElement.classList.remove('reader-open');document.body.classList.remove('reader-open');document.querySelector('.reader-shell')?.remove();loadBooks().then(()=>renderShell());}
  function renderReader(){document.querySelector('.reader-shell')?.remove();const b=state.reader.book;if(!b){document.documentElement.classList.remove('reader-open');document.body.classList.remove('reader-open');return}document.documentElement.classList.add('reader-open');document.body.classList.add('reader-open');const shell=document.createElement('div');shell.className='reader-shell';shell.innerHTML=`<header class="reader-head"><button class="icon-btn reader-back" data-close-reader title="${esc(t('back'))}" aria-label="${esc(t('back'))}">${icon('back')}</button><div class="reader-title"><strong>${esc(b.title)}</strong><span>${esc([b.author,langLabel(b.language)].filter(Boolean).join(' · '))}</span></div><div class="reader-tools"><button class="icon-btn" data-editor title="${esc(t('reader_edit'))}">${icon('edit')}</button><button class="icon-btn" data-print title="${esc(t('reader_export'))}">${icon('download')}</button><button class="icon-btn text-icon" data-reader-settings title="${esc(t('reader_settings'))}">${icon('settings')}</button></div></header><main class="reader-main theme-${esc(state.reader.theme)}" id="readerMain">${isPdf(b)?`<div class="pdf-stage"><div class="pdf-canvas-wrap"><canvas id="pdfCanvas"></canvas></div><div class="page-nav"><button class="small-btn" data-prev-page>←</button><span>${esc(t('page'))} <input id="pageNum" type="number" min="1" max="${b.pageCount||1}" value="${state.reader.page}"> / ${b.pageCount||1}</span><button class="small-btn" data-next-page>→</button></div></div>`:`<article class="reading-page" id="readingPage" lang="${esc(b.language)}" style="--reader-font:${state.reader.font}px;--reader-line:${state.reader.line}">${b.html||textToHtml(b.text,false)}</article>`}</main>${audioDockHtml(b)}`;document.body.appendChild(shell);shell.querySelector('[data-close-reader]').onclick=closeReader;shell.querySelector('[data-reader-settings]').onclick=showReaderSettings;shell.querySelector('[data-print]').onclick=()=>exportBook(b);shell.querySelector('[data-editor]').onclick=()=>showEditor(b);shell.querySelector('[data-play]').onclick=toggleTts;shell.querySelector('[data-stop]').onclick=stopTts;shell.querySelector('[data-voice-settings]').onclick=showVoiceSettings;shell.querySelector('[data-audio-download]').onclick=()=>showAudioExport(b);if(isPdf(b)){shell.querySelector('[data-prev-page]').onclick=()=>changePage(-1);shell.querySelector('[data-next-page]').onclick=()=>changePage(1);shell.querySelector('#pageNum').onchange=e=>goPage(Number(e.target.value));shell.querySelector('[data-editor]').style.display='none';}}
  function effectiveEngine(locale){if(state.tts.engine==='natural'&&!NATURAL_FAMILIES.has(family(locale)))return'piper';return state.tts.engine;}
  function audioDockHtml(b){const eng=effectiveEngine(b.language),label=eng==='natural'?t('natural_voice'):eng==='piper'?t('classic_local_voice'):t('device_voice');return`<div class="audio-dock"><button class="play-main" data-play>${icon('play')}</button><div class="audio-info"><strong>${esc(t('read_aloud'))} · ${esc(langLabel(b.language))}</strong><span id="voiceStatus">${esc(label)}${isPdf(b)?` · ${esc(t('continuous_pages'))}`:''}</span><div class="progress-line"><i id="ttsProgress"></i></div></div><div class="audio-actions"><button class="audio-mp3-btn" data-audio-download title="${esc(t('audio_mp3'))}" aria-label="${esc(t('audio_mp3'))}"><span>MP3</span>${icon('download')}</button><button data-voice-settings title="${esc(t('voice'))}">Aa</button><button data-stop title="${esc(t('stop'))}">${icon('stop')}</button></div></div>`;}
  async function getPdfDoc(book){if(state.reader.pdfDoc)return state.reader.pdfDoc;const pdfjs=await getPdfJs(),data=new Uint8Array(await book.fileBlob.arrayBuffer());state.reader.pdfDoc=await pdfjs.getDocument({data}).promise;return state.reader.pdfDoc;}
  async function getPdfPage(pageNumber){const b=state.reader.book;if(!b||!isPdf(b))return null;const n=Math.max(1,Math.min(b.pageCount||1,Number(pageNumber)||1));if(state.reader.pdfPages.has(n))return state.reader.pdfPages.get(n);const promise=getPdfDoc(b).then(doc=>doc.getPage(n)).catch(error=>{state.reader.pdfPages.delete(n);throw error});state.reader.pdfPages.set(n,promise);return promise;}
  function trimPdfCaches(current){for(const key of state.reader.pdfPages.keys())if(Math.abs(Number(key)-current)>2)state.reader.pdfPages.delete(key);for(const key of state.reader.pdfWarm.keys())if(Math.abs(Number(key)-current)>2)state.reader.pdfWarm.delete(key);}
  function warmPdfPage(pageNumber){const b=state.reader.book,n=Number(pageNumber);if(!b||!isPdf(b)||n<1||n>(b.pageCount||1)||state.reader.pdfWarm.has(n))return;const job=getPdfPage(n).then(page=>typeof page.getOperatorList==='function'?page.getOperatorList():null).catch(()=>null);state.reader.pdfWarm.set(n,job);}
  async function renderPdfPage(){const b=state.reader.book;if(!b||!isPdf(b))return;try{const page=await getPdfPage(state.reader.page),viewport=page.getViewport({scale:1.5}),canvas=document.getElementById('pdfCanvas');if(!canvas)return;const ratio=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.floor(viewport.width*ratio);canvas.height=Math.floor(viewport.height*ratio);canvas.style.width=`${viewport.width}px`;canvas.style.height=`${viewport.height}px`;await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio!==1?[ratio,0,0,ratio,0,0]:null}).promise;const p=document.getElementById('pageNum');if(p)p.value=state.reader.page;warmPdfPage(state.reader.page+1);trimPdfCaches(state.reader.page);}catch(_){toast(t('pdf_render_error'),true)}}
  async function goPage(n){const b=state.reader.book;if(!b)return;state.reader.page=Math.max(1,Math.min(b.pageCount||1,Math.round(n||1)));b.lastPage=state.reader.page;await idbPut(b);stopTts();await renderPdfPage();}
  function changePage(delta){goPage(state.reader.page+delta);}
  function decorateReflowTts(){const page=document.getElementById('readingPage');if(!page)return;page.querySelectorAll('p,li,h1,h2,h3,h4,blockquote').forEach((el,i)=>el.dataset.ttsIndex=String(i));}
  function splitSentences(text,locale){const clean=cleanSpeechText(text);if(!clean)return[];try{if(Intl.Segmenter){const seg=new Intl.Segmenter(locale,{granularity:'sentence'});return[...seg.segment(clean)].map(x=>x.segment.trim()).filter(Boolean)}}catch(_){}return clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(s=>s.trim()).filter(Boolean)||[clean];}
  function packNaturalSpeech(text,locale,maxChars=700){const parts=splitSentences(text,locale),out=[];let current='';const push=()=>{const clean=cleanSpeechText(current);if(clean)out.push(clean);current=''};for(const part of parts){if(part.length>maxChars){push();const words=part.split(/\s+/);let long='';for(const word of words){if(long&&long.length+word.length+1>maxChars){out.push(long);long=word}else long+=(long?' ':'')+word}if(long)out.push(long);continue}if(current&&current.length+part.length+1>maxChars)push();current+=(current?' ':'')+part}push();return out;}
  function buildNaturalTtsUnits(pageNumber=state.reader.page){const b=state.reader.book;if(!b)return[];if(isPdf(b))return packNaturalSpeech((b.pageTexts||[])[pageNumber-1]||'',b.language).map((text,i)=>({text,elements:[],index:i}));const page=document.getElementById('readingPage');if(!page)return[];const out=[];let text='',elements=[];const flush=()=>{const clean=cleanSpeechText(text);if(clean)out.push({text:clean,elements:[...elements],index:out.length});text='';elements=[]};page.querySelectorAll('[data-tts-index]').forEach(el=>{const block=cleanSpeechText(el.innerText||el.textContent||'');if(!block)return;if(block.length>700){flush();packNaturalSpeech(block,b.language).forEach(piece=>out.push({text:piece,elements:[el],index:out.length}));return}if(text&&text.length+block.length+1>700)flush();text+=(text?' ':'')+block;elements.push(el)});flush();return out;}
  function buildTtsUnits(engine=effectiveEngine(state.reader.book?.language),pageNumber=state.reader.page){const b=state.reader.book;if(!b)return[];if(engine==='natural')return buildNaturalTtsUnits(pageNumber);if(isPdf(b))return splitSentences((b.pageTexts||[])[pageNumber-1]||'',b.language).map((text,i)=>({text,element:null,index:i}));const page=document.getElementById('readingPage');if(!page)return[];const out=[];page.querySelectorAll('[data-tts-index]').forEach(el=>splitSentences(el.innerText||el.textContent||'',b.language).forEach(text=>out.push({text,element:el,index:out.length})));return out;}
  function clearActive(){document.querySelectorAll('.tts-active').forEach(e=>e.classList.remove('tts-active'));}
  function setActive(unit){clearActive();const els=unit?.elements?.length?unit.elements:(unit?.element?[unit.element]:[]);els.forEach(el=>el.classList.add('tts-active'));if(els[0])els[0].scrollIntoView({block:'center',behavior:'smooth'})}
  function updateTtsUi(){const p=document.querySelector('[data-play]');if(p)p.textContent=state.tts.playing&&!state.tts.paused?icon('pause'):icon('play');const bar=document.getElementById('ttsProgress');if(bar){const len=Math.max(1,state.tts.units.length),b=state.reader.book;let progress=state.tts.index/len;if(isPdf(b)){const pages=Math.max(1,b.pageCount||1);progress=((state.reader.page-1)+progress)/pages;}bar.style.width=`${Math.min(100,Math.round(progress*100))}%`;}}
  function matchingNativeVoices(locale){const f=family(locale);return state.voices.filter(v=>family(v.lang)===f);}
  function chooseNativeVoiceStrict(locale){const matches=matchingNativeVoices(locale),exact=matches.filter(v=>String(v.lang).toLowerCase()===String(locale).toLowerCase()),saved=localStorage.getItem('tts_voice_'+locale);if(saved){const found=matches.find(v=>v.name===saved);if(found)return found}return exact[0]||matches[0]||null;}
  async function toggleTts(){if(!state.reader.book)return;if(state.reader.pdfOrderUpdating)return toast(t('pdf_rebuilding_order'));if(state.tts.playing){if(effectiveEngine(state.reader.book.language)==='native'&&window.speechSynthesis){if(state.tts.paused){speechSynthesis.resume();state.tts.paused=false}else{speechSynthesis.pause();state.tts.paused=true}}else if(state.tts.audio){if(state.tts.paused){state.tts.audio.play();state.tts.paused=false}else{state.tts.audio.pause();state.tts.paused=true}}updateTtsUi();return}const eng=effectiveEngine(state.reader.book.language);state.tts.units=buildTtsUnits(eng);state.tts.index=0;state.tts.naturalCache.clear();if(!state.tts.units.length)return toast(t('no_readable'),true);state.tts.playing=true;state.tts.paused=false;state.tts.token++;updateTtsUi();playCurrent(state.tts.token);}
  function stopTts(){state.tts.token++;state.tts.playing=false;state.tts.paused=false;state.tts.index=0;state.tts.naturalCache.clear();try{speechSynthesis.cancel()}catch(_){}if(state.tts.audio){try{state.tts.audio.pause();URL.revokeObjectURL(state.tts.audio.src)}catch(_){}state.tts.audio=null}clearActive();updateTtsUi();}
  function playCurrent(token){const eng=effectiveEngine(state.reader.book?.language);if(eng==='natural')playNaturalCurrent(token);else if(eng==='piper')playPiperCurrent(token);else playNativeCurrent(token);}
  function playNativeCurrent(token){if(token!==state.tts.token||!state.tts.playing)return;if(!('speechSynthesis'in window)||!('SpeechSynthesisUtterance'in window)){stopTts();return toast(t('voice_unavailable'),true)}if(state.tts.index>=state.tts.units.length)return finishTtsPage(token);const unit=state.tts.units[state.tts.index];setActive(unit);const b=state.reader.book,v=chooseNativeVoiceStrict(b.language);if(!v){stopTts();return toast(t('language_strict_error',{language:langLabel(b.language)}),true)}const u=new SpeechSynthesisUtterance(unit.text);u.lang=b.language;u.voice=v;u.rate=state.tts.rate;const status=document.getElementById('voiceStatus');if(status)status.textContent=`${t('device_voice')} · ${v.name}`;u.onend=()=>{if(token!==state.tts.token)return;state.tts.index++;updateTtsUi();playNativeCurrent(token)};u.onerror=()=>{if(token!==state.tts.token)return;stopTts();toast(t('voice_failed'),true)};speechSynthesis.speak(u);}
  function naturalCacheKey(pageNumber,index){return `${pageNumber}:${index}`;}
  function naturalBlobFor(token,index,natural,b,pageNumber=state.reader.page,units=state.tts.units){if(token!==state.tts.token||!state.tts.playing)return Promise.reject(new Error('Reading stopped.'));if(index<0||index>=units.length)return Promise.resolve(null);const key=naturalCacheKey(pageNumber,index);if(state.tts.naturalCache.has(key))return state.tts.naturalCache.get(key);const unit=units[index],styleId=preferredNaturalStyle(b.language),steps=naturalStepsForLocale(b.language);state.tts.style=styleId;const job=natural.synthesize({text:unit.text,locale:b.language,styleId,speed:state.tts.rate,steps}).catch(error=>{state.tts.naturalCache.delete(key);throw error});state.tts.naturalCache.set(key,job);return job;}
  function prefetchNextPdfSpeech(token,natural,b,pageNumber){if(!isPdf(b)||pageNumber>=(b.pageCount||1)||token!==state.tts.token||!state.tts.playing)return;const next=pageNumber+1,units=buildTtsUnits('natural',next);if(!units.length)return;naturalBlobFor(token,0,natural,b,next,units).catch(()=>{});}
  async function playNaturalCurrent(token){if(token!==state.tts.token||!state.tts.playing)return;if(state.tts.index>=state.tts.units.length)return finishTtsPage(token);const index=state.tts.index,pageNumber=state.reader.page,unit=state.tts.units[index];setActive(unit);const b=state.reader.book,status=document.getElementById('voiceStatus');try{if(status)status.textContent=t('loading_natural');const natural=await getNatural(msg=>{if(status&&token===state.tts.token)status.textContent=msg});if(!natural.supports(b.language)){stopTts();return toast(t('natural_not_supported',{language:langLabel(b.language)}),true)}if(status&&!state.tts.naturalCache.has(naturalCacheKey(pageNumber,index)))status.textContent=t('generating_audio');const blob=await naturalBlobFor(token,index,natural,b,pageNumber,state.tts.units);if(token!==state.tts.token||!blob)return;const url=URL.createObjectURL(blob),audio=new Audio(url);state.tts.audio=audio;audio.preload='auto';audio.onended=()=>{URL.revokeObjectURL(url);state.tts.naturalCache.delete(naturalCacheKey(pageNumber,index));if(token!==state.tts.token)return;state.tts.audio=null;state.tts.index++;updateTtsUi();playNaturalCurrent(token)};audio.onerror=()=>{URL.revokeObjectURL(url);state.tts.naturalCache.delete(naturalCacheKey(pageNumber,index));stopTts();toast(t('natural_error'),true)};if(status)status.textContent=`${t('natural_voice')} · ${state.tts.style}${isPdf(b)?' · '+t('continuous_pages'):''}`;const started=audio.play();if(index+1<state.tts.units.length)naturalBlobFor(token,index+1,natural,b,pageNumber,state.tts.units).catch(()=>{});else prefetchNextPdfSpeech(token,natural,b,pageNumber);await started;}catch(e){if(token!==state.tts.token)return;console.error(e);stopTts();toast(e?.message||t('natural_error'),true)}}
  async function piperVoiceFor(locale){const tts=await getPiper();state.tts.piper=tts;const all=await tts.voices(),keys=Array.isArray(all)?all.map(v=>v.key||v.id||v.voiceId).filter(Boolean):Object.keys(all||{}),prefix=String(locale).replace('-','_').toLowerCase(),fam=family(locale)+'_';return keys.find(k=>String(k).toLowerCase().startsWith(prefix))||keys.find(k=>String(k).toLowerCase().startsWith(fam))||'';}
  async function ensurePiperVoice(locale,progress){const tts=await getPiper(),id=await piperVoiceFor(locale);if(!id)throw new Error(t('fallback_missing',{language:langLabel(locale)}));const stored=await tts.stored().catch(()=>[]);if(!stored.includes(id))await tts.download(id,p=>{if(progress&&p&&p.total)progress(Math.round((p.loaded/p.total)*100),id)});state.tts.piperVoiceId=id;return{id,tts};}
  async function playPiperCurrent(token){if(token!==state.tts.token||!state.tts.playing)return;if(state.tts.index>=state.tts.units.length)return finishTtsPage(token);const unit=state.tts.units[state.tts.index];setActive(unit);const b=state.reader.book,status=document.getElementById('voiceStatus');try{if(status)status.textContent=t('loading_fallback');const setup=state.tts.piperVoiceId?{id:state.tts.piperVoiceId,tts:state.tts.piper||await getPiper()}:await ensurePiperVoice(b.language,pc=>{if(status)status.textContent=t('downloading_voice',{n:pc})});if(token!==state.tts.token)return;if(status)status.textContent=`${t('classic_local_voice')} · ${setup.id}`;const wav=await setup.tts.predict({text:unit.text,voiceId:setup.id});if(token!==state.tts.token)return;const url=URL.createObjectURL(wav),audio=new Audio(url);state.tts.audio=audio;audio.playbackRate=state.tts.rate;audio.onended=()=>{URL.revokeObjectURL(url);if(token!==state.tts.token)return;state.tts.audio=null;state.tts.index++;updateTtsUi();playPiperCurrent(token)};audio.onerror=()=>{URL.revokeObjectURL(url);stopTts();toast(t('fallback_error'),true)};await audio.play();}catch(e){console.error(e);stopTts();toast(e?.message||t('fallback_error'),true)}}
  async function finishTtsPage(token){if(token!==state.tts.token)return;const b=state.reader.book;if(isPdf(b)){let next=state.reader.page+1;while(next<=(b.pageCount||1)){state.reader.page=next;b.lastPage=next;await idbPut(b);await renderPdfPage();if(token!==state.tts.token)return;const units=buildTtsUnits(effectiveEngine(b.language),next);if(units.length){state.tts.units=units;state.tts.index=0;updateTtsUi();playCurrent(token);return}next++;}}stopTts();}

  function safeDownloadName(value){return String(value||'book').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim().slice(0,140)||'book';}
  function bookAudioChunks(book,range=null){
    const maxChars=700,out=[];if(isPdf(book)){const total=Math.max(1,Number(book.pageCount||(book.pageTexts||[]).length||1)),from=Math.max(1,Math.min(total,Number(range?.fromPage||1))),to=Math.max(from,Math.min(total,Number(range?.toPage||total)));for(let page=from;page<=to;page++)out.push(...packNaturalSpeech((book.pageTexts||[])[page-1]||'',book.language,maxChars));}
    else out.push(...packNaturalSpeech(book.text||plainTextFromHtml(book.html||''),book.language,maxChars));return out.filter(Boolean);
  }
  function exportAudioEngine(book){const selected=effectiveEngine(book.language);if(selected!=='native')return selected;return NATURAL_FAMILIES.has(family(book.language))?'natural':'piper';}
  function triggerBlobDownload(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  async function clearTemporaryAudioCache(){if(!('caches'in window))return;try{await caches.delete(TEMP_AUDIO_CACHE)}catch(_){}}
  async function downloadBlobViaTemporaryCache(blob,name){
    if(!('caches'in window)){triggerBlobDownload(blob,name);return;}
    const id=window.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`,url=new URL(`./__audio-temp__/${id}.mp3`,location.href).toString(),request=new Request(url);let cache=null,downloadBlob=blob,downloaded=false;
    try{cache=await caches.open(TEMP_AUDIO_CACHE);await cache.put(request,new Response(blob,{headers:{'Content-Type':'audio/mpeg','Cache-Control':'no-store'}}));const cached=await cache.match(request);if(cached)downloadBlob=await cached.blob();triggerBlobDownload(downloadBlob,name);downloaded=true;}
    catch(error){console.warn('Temporary audio cache unavailable; downloading directly.',error);if(!downloaded)triggerBlobDownload(blob,name);}
    finally{if(cache)try{await cache.delete(request);const remaining=await cache.keys();if(!remaining.length)await caches.delete(TEMP_AUDIO_CACHE)}catch(_){}}
  }
  function audioBufferToMonoPcm16(buffer,targetRate=MP3_SAMPLE_RATE){
    const channels=Math.max(1,buffer.numberOfChannels||1),sourceRate=buffer.sampleRate||targetRate,ratio=sourceRate/targetRate,outLength=Math.max(1,Math.round(buffer.length/ratio)),channelData=Array.from({length:channels},(_,i)=>buffer.getChannelData(i)),out=new Int16Array(outLength);
    for(let i=0;i<outLength;i++){const pos=i*ratio,left=Math.min(buffer.length-1,Math.floor(pos)),right=Math.min(buffer.length-1,left+1),mix=pos-left;let sample=0;for(let c=0;c<channels;c++)sample+=channelData[c][left]+(channelData[c][right]-channelData[c][left])*mix;sample=Math.max(-1,Math.min(1,sample/channels));out[i]=sample<0?Math.round(sample*32768):Math.round(sample*32767);}return out;
  }
  function encodePcmIntoMp3(encoder,pcm,parts){const block=1152;for(let offset=0;offset<pcm.length;offset+=block){const encoded=encoder.encodeBuffer(pcm.subarray(offset,Math.min(pcm.length,offset+block)));if(encoded?.length)parts.push(new Int8Array(encoded));}}

  function audioRangeFromModal(book,modal){
    if(!isPdf(book))return{valid:true,custom:false,fromPage:1,toPage:1};const total=Math.max(1,Number(book.pageCount||1)),mode=modal.querySelector('#audioRangeMode')?.value||'all';if(mode!=='custom')return{valid:true,custom:false,fromPage:1,toPage:total};const fromRaw=Number(modal.querySelector('#audioFromPage')?.value),toRaw=Number(modal.querySelector('#audioToPage')?.value);if(!Number.isFinite(fromRaw)||!Number.isFinite(toRaw)||fromRaw<1||toRaw<1||fromRaw>total||toRaw>total||fromRaw>toRaw)return{valid:false,custom:true,fromPage:fromRaw,toPage:toRaw};return{valid:true,custom:true,fromPage:Math.round(fromRaw),toPage:Math.round(toRaw)};
  }
  function showAudioExport(book){
    if(state.reader.pdfOrderUpdating)return toast(t('pdf_rebuilding_order'));
    if(state.audioExport.running)return toast(t('audio_export_busy'),true);
    const engine=exportAudioEngine(book),engineName=engine==='natural'?t('natural_voice'):t('classic_local_voice'),pdf=isPdf(book),total=Math.max(1,Number(book.pageCount||1)),initialFrom=Math.max(1,Math.min(total,Number(state.reader.page||1))),initialTo=Math.min(total,initialFrom+9),initialChunks=bookAudioChunks(book,pdf?{fromPage:1,toPage:total}:null);
    const rangeUi=pdf?`<div class="field"><label>${esc(t('audio_range'))}</label><select id="audioRangeMode"><option value="all">${esc(t('audio_range_all'))}</option><option value="custom">${esc(t('audio_range_custom'))}</option></select></div><div class="field-row" id="audioCustomRange" hidden><div class="field"><label>${esc(t('audio_from_page'))}</label><input id="audioFromPage" type="number" min="1" max="${total}" value="${initialFrom}"></div><div class="field"><label>${esc(t('audio_to_page'))}</label><input id="audioToPage" type="number" min="1" max="${total}" value="${initialTo}"></div></div><p class="fine">${esc(t('audio_pages_hint',{pages:total}))}</p>`:'';
    showModal(t('audio_export_title'),`<div class="voice-sheet"><p class="muted">${esc(t(pdf?'audio_export_desc_pdf':'audio_export_desc',{engine:engineName}))}</p>${rangeUi}<div class="voice-note">${esc(t('audio_compression_note',{rate:MP3_BITRATE_KBPS}))}</div><div class="voice-note" id="audioExportStatus">${esc(t('audio_export_ready',{n:initialChunks.length}))}</div><div class="progress-line audio-export-progress"><i id="audioExportProgress"></i></div><button class="btn primary full" id="generateAudioMp3" ${initialChunks.length?'':'disabled'}>${esc(t('audio_generate'))}</button></div>`,m=>{
      const btn=m.querySelector('#generateAudioMp3'),status=m.querySelector('#audioExportStatus'),mode=m.querySelector('#audioRangeMode'),custom=m.querySelector('#audioCustomRange');
      const refresh=()=>{const range=audioRangeFromModal(book,m);if(custom)custom.hidden=!range.custom;if(!range.valid){if(status)status.textContent=t('audio_invalid_range');if(btn)btn.disabled=true;return;}const chunks=bookAudioChunks(book,range);if(status)status.textContent=pdf&&range.custom?t('audio_export_ready_range',{from:range.fromPage,to:range.toPage,n:chunks.length}):t('audio_export_ready',{n:chunks.length});if(btn)btn.disabled=!chunks.length;};
      mode?.addEventListener('change',refresh);m.querySelector('#audioFromPage')?.addEventListener('input',refresh);m.querySelector('#audioToPage')?.addEventListener('input',refresh);refresh();if(btn)btn.onclick=()=>{const range=audioRangeFromModal(book,m);if(!range.valid)return toast(t('audio_invalid_range'),true);const chunks=bookAudioChunks(book,range);if(!chunks.length)return toast(t('audio_range_no_text'),true);generateAudioMp3(book,m,chunks,engine,range);};
    });
  }
  async function generateAudioMp3(book,modal,chunks=bookAudioChunks(book),engine=exportAudioEngine(book),range=null){
    if(state.audioExport.running||!chunks.length)return;if(typeof AudioContext==='undefined'&&typeof webkitAudioContext==='undefined')return toast(t('audio_context_unavailable'),true);
    stopTts();const token=++state.audioExport.token;state.audioExport.running=true;const status=modal.querySelector('#audioExportStatus'),bar=modal.querySelector('#audioExportProgress'),btn=modal.querySelector('#generateAudioMp3');if(btn)btn.disabled=true;
    let context=null,mp3Parts=[];
    const active=()=>token===state.audioExport.token&&state.audioExport.running;
    const setStatus=(message,progress)=>{if(!active())return;if(status)status.textContent=message;if(bar&&Number.isFinite(progress))bar.style.width=`${Math.max(0,Math.min(100,Math.round(progress)))}%`;};
    try{
      setStatus(t('audio_encoder_loading'),1);const lame=await getLameJs();if(!active())return;const encoder=new lame.Mp3Encoder(1,MP3_SAMPLE_RATE,MP3_BITRATE_KBPS);
      const AudioCtx=window.AudioContext||window.webkitAudioContext;context=new AudioCtx();let natural=null,piper=null;
      if(engine==='natural'){setStatus(t('preparing_model'),3);natural=await getNatural(msg=>setStatus(msg,3));const styleId=preferredNaturalStyle(book.language);await natural.prepare(styleId);}
      else {setStatus(t('loading_fallback'),3);piper=await ensurePiperVoice(book.language,(pc,id)=>setStatus(`${id}: ${pc}%`,3));}
      for(let i=0;i<chunks.length;i++){
        if(!active())throw new Error('AUDIO_EXPORT_CANCELLED');const pct=5+(i/chunks.length)*87;setStatus(t('audio_synth_progress',{current:i+1,total:chunks.length}),pct);let wav;
        if(engine==='natural')wav=await natural.synthesize({text:chunks[i],locale:book.language,styleId:preferredNaturalStyle(book.language),speed:state.tts.rate,steps:naturalStepsForLocale(book.language)});
        else wav=await piper.tts.predict({text:chunks[i],voiceId:piper.id});
        if(!active())throw new Error('AUDIO_EXPORT_CANCELLED');const buffer=await context.decodeAudioData(await wav.arrayBuffer()),pcm=audioBufferToMonoPcm16(buffer);encodePcmIntoMp3(encoder,pcm,mp3Parts);
      }
      if(!active())throw new Error('AUDIO_EXPORT_CANCELLED');setStatus(t('audio_encoding'),94);const tail=encoder.flush();if(tail?.length)mp3Parts.push(new Int8Array(tail));const blob=new Blob(mp3Parts,{type:'audio/mpeg'}),rangeName=isPdf(book)&&range?.custom?` - pages ${range.fromPage}-${range.toPage}`:'',filename=`${safeDownloadName((book.title||'book')+rangeName)}.mp3`;mp3Parts=[];
      if(!active())throw new Error('AUDIO_EXPORT_CANCELLED');setStatus(t('audio_cache_saving'),97);await downloadBlobViaTemporaryCache(blob,filename);if(!active())return;setStatus(t('audio_ready'),100);toast(t('audio_download_started'));
    }catch(e){if(e?.message!=='AUDIO_EXPORT_CANCELLED'){console.error(e);setStatus(e?.message||t('audio_failed'),0);toast(e?.message||t('audio_failed'),true)}}finally{mp3Parts=[];try{await context?.close()}catch(_){}if(token===state.audioExport.token){state.audioExport.running=false;if(btn&&document.body.contains(btn))btn.disabled=false;}}
  }

  function showVoiceSettings(){
    const b=state.reader.book;if(!b)return;const matches=matchingNativeVoices(b.language),saved=localStorage.getItem('tts_voice_'+b.language)||'',naturalOk=NATURAL_FAMILIES.has(family(b.language));state.tts.style=preferredNaturalStyle(b.language);
    showModal(t('voice_settings'),`<div class="voice-sheet"><div class="field"><label>${esc(t('engine'))}</label><select id="voiceEngine"><option value="natural" ${state.tts.engine==='natural'?'selected':''} ${naturalOk?'':'disabled'}>${esc(t('engine_natural'))}${naturalOk?'':' — '+esc(t('natural_not_supported',{language:langLabel(b.language)}))}</option><option value="native" ${state.tts.engine==='native'?'selected':''}>${esc(t('engine_native'))}</option><option value="piper" ${state.tts.engine==='piper'?'selected':''}>${esc(family(b.language)==='lv'?t('engine_piper_lv'):t('engine_piper'))}</option></select></div><div class="field"><label>${esc(t('voice_style'))}</label><select id="voiceStyle">${VOICE_STYLES.map(([id,k])=>`<option value="${id}" ${state.tts.style===id?'selected':''}>${esc(t(k))}</option>`).join('')}</select></div><div class="field"><label>${esc(t('device_voice_label'))}</label><select id="nativeVoice"><option value="">${esc(t('automatic_match'))}</option>${matches.map(v=>`<option value="${esc(v.name)}" ${v.name===saved?'selected':''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</select></div><div class="field"><label>${esc(t('reading_speed'))}</label><div class="range-row"><input id="voiceRate" type="range" min="0.75" max="1.35" step="0.05" value="${state.tts.rate}"><span id="voiceRateVal">${state.tts.rate.toFixed(2)}×</span></div></div><div class="voice-note">${esc(t('natural_note'))}</div>${family(b.language)==='lv'?`<div class="voice-note accuracy-note">${esc(t('lv_accuracy_note'))}</div>`:''}<button class="btn primary" id="saveVoice">${esc(t('save_settings'))}</button></div>`,m=>{const rate=m.querySelector('#voiceRate');rate.oninput=()=>m.querySelector('#voiceRateVal').textContent=`${Number(rate.value).toFixed(2)}×`;m.querySelector('#saveVoice').onclick=()=>{state.tts.engine=m.querySelector('#voiceEngine').value;state.tts.style=m.querySelector('#voiceStyle').value;state.tts.rate=Number(rate.value);const voice=m.querySelector('#nativeVoice').value;localStorage.setItem('tts_engine',state.tts.engine);localStorage.setItem('tts_engine_'+b.language,state.tts.engine);localStorage.setItem('tts_style_'+b.language,state.tts.style);localStorage.setItem('tts_style',state.tts.style);localStorage.setItem('tts_rate',String(state.tts.rate));if(voice)localStorage.setItem('tts_voice_'+b.language,voice);else localStorage.removeItem('tts_voice_'+b.language);closeModal();toast(t('settings_saved'));renderReader();if(isPdf(b))renderPdfPage();else decorateReflowTts();}});
  }
  function showReaderSettings(){showModal(t('appearance'),`<div class="field"><label>${esc(t('theme'))}</label><select id="readTheme"><option value="paper" ${state.reader.theme==='paper'?'selected':''}>${esc(t('theme_paper'))}</option><option value="sepia" ${state.reader.theme==='sepia'?'selected':''}>${esc(t('theme_sepia'))}</option><option value="dark" ${state.reader.theme==='dark'?'selected':''}>${esc(t('theme_dark'))}</option></select></div><div class="field"><label>${esc(t('text_size'))}</label><div class="range-row"><input id="readFont" type="range" min="14" max="30" step="1" value="${state.reader.font}"><span id="fontVal">${state.reader.font}px</span></div></div><div class="field"><label>${esc(t('line_height'))}</label><div class="range-row"><input id="readLine" type="range" min="1.25" max="2.2" step="0.05" value="${state.reader.line}"><span id="lineVal">${state.reader.line.toFixed(2)}</span></div></div><button class="btn primary" id="saveReader">${esc(t('apply'))}</button>`,m=>{const f=m.querySelector('#readFont'),l=m.querySelector('#readLine');f.oninput=()=>m.querySelector('#fontVal').textContent=f.value+'px';l.oninput=()=>m.querySelector('#lineVal').textContent=Number(l.value).toFixed(2);m.querySelector('#saveReader').onclick=()=>{state.reader.theme=m.querySelector('#readTheme').value;state.reader.font=Number(f.value);state.reader.line=Number(l.value);localStorage.setItem('reader_theme',state.reader.theme);localStorage.setItem('reader_font',state.reader.font);localStorage.setItem('reader_line',state.reader.line);closeModal();const main=document.getElementById('readerMain');if(main)main.className='reader-main theme-'+state.reader.theme;const page=document.getElementById('readingPage');if(page){page.style.setProperty('--reader-font',state.reader.font+'px');page.style.setProperty('--reader-line',state.reader.line)}}});}
  function showEditor(book){if(isPdf(book))return;showModal(t('edit_proofread'),`<p class="muted">${esc(t('editor_desc',{language:langLabel(book.language)}))}</p><div id="localEditor" class="editor-box" contenteditable="true" spellcheck="true" lang="${esc(book.language)}">${book.html}</div><div class="row-actions"><button class="btn secondary" id="cleanEditor">${esc(t('clean_spacing'))}</button><button class="btn primary" id="saveEditor">${esc(t('save_book'))}</button></div>`,m=>{const ed=m.querySelector('#localEditor');m.querySelector('#cleanEditor').onclick=()=>{ed.innerHTML=sanitizeHtml(ed.innerHTML);toast(t('cleanup_done'))};m.querySelector('#saveEditor').onclick=async()=>{book.html=sanitizeHtml(ed.innerHTML);book.text=plainTextFromHtml(book.html);book.updatedAt=nowIso();await idbPut(book);closeModal();renderReader();decorateReflowTts();toast(t('text_updated'))}});}
  function exportBook(book){if(isPdf(book)){const a=document.createElement('a'),url=URL.createObjectURL(book.fileBlob);a.href=url;a.download=(book.title||'book').replace(/[\\/:*?"<>|]+/g,'-')+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);toast(t('original_pdf'));return}printReflowBook(book);}
  function printReflowBook(book){const w=window.open('','_blank');if(!w)return toast(t('allow_popups'),true);const cover=book.cover?`<img src="${book.cover}" alt="">`:'',title=esc(book.title),sub=esc(book.subtitle),author=esc(book.author),desc=esc(book.description);w.document.open();w.document.write(`<!doctype html><html lang="${esc(book.language)}"><head><meta charset="utf-8"><title>${title}</title><style>@page{size:A5;margin:18mm 16mm 20mm}*{box-sizing:border-box}body{margin:0;color:#20201d;font:11.5pt/1.65 Georgia,"Times New Roman",serif}.cover{height:170mm;break-after:page;display:flex;position:relative;overflow:hidden;background:#e9e5d9;color:#171713;margin:-8mm -6mm 0}.cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.cover:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 35%,rgba(248,245,236,.92))}.cover-copy{position:relative;z-index:2;align-self:flex-end;padding:18mm 13mm;width:100%}.cover h1{font-size:28pt;line-height:1.05;margin:0 0 5mm}.cover h2{font:italic 14pt/1.3 Georgia;margin:0 0 4mm}.cover p{font:12pt/1.4 sans-serif;margin:0}.title-page{min-height:155mm;break-after:page;display:flex;flex-direction:column;justify-content:center;text-align:center}.title-page h1{font-size:25pt;line-height:1.1}.title-page h2{font-weight:normal;font-style:italic}.description{margin:14mm auto 0;max-width:90mm;color:#555;font-size:10pt}.body h1{font-size:21pt;break-before:page}.body h2{font-size:16pt;break-after:avoid}.body h3{font-size:13pt;break-after:avoid}.body p{margin:0 0 4mm;text-align:justify;orphans:3;widows:3}.body img{max-width:100%;height:auto;break-inside:avoid}.body blockquote{margin:6mm 8mm;color:#555}a{color:inherit;text-decoration:none}</style></head><body><section class="cover">${cover}<div class="cover-copy"><h1>${title}</h1>${sub?`<h2>${sub}</h2>`:''}${author?`<p>${author}</p>`:''}</div></section><section class="title-page"><h1>${title}</h1>${sub?`<h2>${sub}</h2>`:''}${author?`<p>${author}</p>`:''}${desc?`<div class="description">${desc}</div>`:''}</section><main class="body">${book.html}</main><script>window.onload=()=>setTimeout(()=>window.print(),300);<\/script></body></html>`);w.document.close();toast(t('print_opened'));}

  function renderVoices(root){
    const current=localStorage.getItem('voice_test_lang')||'lv-LV',naturalOk=NATURAL_FAMILIES.has(family(current));state.tts.style=preferredNaturalStyle(current);
    root.innerHTML=`<div class="page-heading"><div class="eyebrow">${esc(t('voices_kicker'))}</div><h1>${esc(t('voices_title'))}</h1><p class="lead">${esc(t('voices_lead'))}</p></div><div class="voice-layout"><section class="paper-panel feature-voice"><div class="voice-number">01</div><h2>${esc(t('natural_reader'))}</h2><p class="muted">${esc(t('natural_reader_desc'))}</p><div class="field"><label>${esc(t('language'))}</label><select id="voiceLang">${languageOptions(current)}</select></div><div class="field"><label>${esc(t('voice_style'))}</label><select id="testStyle">${VOICE_STYLES.map(([id,k])=>`<option value="${id}" ${state.tts.style===id?'selected':''}>${esc(t(k))}</option>`).join('')}</select></div><div id="naturalStatus" class="voice-note">${esc(naturalOk?t('natural_supported',{language:langLabel(current)}):t('natural_not_supported',{language:langLabel(current)}))}</div><button class="btn primary" id="testNatural">${esc(t('test_natural'))}</button></section>
      <section class="paper-panel feature-voice"><div class="voice-number">02</div><h2>${esc(t('device_voice_test'))}</h2><p class="muted">${esc(t('natural_note'))}</p><div class="field"><label>${esc(t('voice'))}</label><select id="voiceChoice"></select></div><div id="voiceAvailability" class="voice-note"></div><button class="btn secondary" id="testDevice">${esc(t('test_device'))}</button></section>
      <section class="paper-panel feature-voice"><div class="voice-number">03</div><h2>${esc(t('fallback_reader'))}</h2><p class="muted">${esc(t('fallback_desc'))}</p><div id="piperStatus" class="voice-note"></div><div class="row-actions"><button class="btn secondary" id="checkPiper">${esc(t('check_voice'))}</button><button class="btn secondary" id="installPiper">${esc(t('download_device'))}</button></div></section></div><section class="section note-panel"><strong>${esc(t('languages_build'))}</strong><p>${esc(t('languages_list'))}</p></section>`;
    const lang=root.querySelector('#voiceLang'),choice=root.querySelector('#voiceChoice'),deviceBtn=root.querySelector('#testDevice'),naturalBtn=root.querySelector('#testNatural'),naturalStatus=root.querySelector('#naturalStatus'),piperStatus=root.querySelector('#piperStatus'),testStyle=root.querySelector('#testStyle');
    const refresh=()=>{const code=lang.value;localStorage.setItem('voice_test_lang',code);const matches=matchingNativeVoices(code),nativeSpeech=('speechSynthesis'in window)&&('SpeechSynthesisUtterance'in window);choice.innerHTML=matches.length?matches.map(v=>`<option value="${esc(v.name)}">${esc(v.name)} · ${esc(v.lang)}</option>`).join(''):`<option value="">${esc(t('no_matching_voice'))}</option>`;root.querySelector('#voiceAvailability').textContent=!nativeSpeech?t('browser_no_speech'):matches.length?t('matching_voices',{n:matches.length}):t('no_matching_voice');deviceBtn.disabled=!nativeSpeech||!matches.length;naturalStatus.textContent=NATURAL_FAMILIES.has(family(code))?t('natural_supported',{language:langLabel(code)}):t('natural_not_supported',{language:langLabel(code)});naturalBtn.disabled=!NATURAL_FAMILIES.has(family(code));piperStatus.textContent=family(code)==='lv'?t('lv_accuracy_note'):t('fallback_desc');};lang.onchange=()=>{testStyle.value=preferredNaturalStyle(lang.value);refresh()};testStyle.value=preferredNaturalStyle(current);refresh();
    deviceBtn.onclick=()=>{const code=lang.value,v=state.voices.find(x=>x.name===choice.value&&family(x.lang)===family(code));if(!v)return toast(t('language_strict_error',{language:langLabel(code)}),true);speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(TEST_TEXT[code]||'');u.lang=code;u.voice=v;u.rate=state.tts.rate;speechSynthesis.speak(u)};
    naturalBtn.onclick=async()=>{naturalBtn.disabled=true;try{naturalStatus.textContent=t('preparing_model');const natural=await getNatural(msg=>naturalStatus.textContent=msg),styleId=testStyle.value,steps=naturalStepsForLocale(lang.value);await natural.prepare(styleId);naturalStatus.textContent=t('natural_ready',{backend:natural.backend()||'local'});const blob=await natural.synthesize({text:TEST_TEXT[lang.value],locale:lang.value,styleId,speed:state.tts.rate,steps});playBlob(blob);}catch(e){console.error(e);naturalStatus.textContent=e?.message||t('natural_error');toast(t('natural_error'),true)}finally{naturalBtn.disabled=!NATURAL_FAMILIES.has(family(lang.value))}};
    root.querySelector('#checkPiper').onclick=async()=>{piperStatus.textContent=t('checking_catalogue');try{const id=await piperVoiceFor(lang.value);piperStatus.textContent=id?t('fallback_available',{id}):t('fallback_missing',{language:langLabel(lang.value)})}catch(_){piperStatus.textContent=t('fallback_error')}};
    root.querySelector('#installPiper').onclick=async()=>{const btn=root.querySelector('#installPiper');btn.disabled=true;try{const setup=await ensurePiperVoice(lang.value,(pc,id)=>piperStatus.textContent=`${id}: ${pc}%`);piperStatus.textContent=t('fallback_ready',{id:setup.id});toast(t('fallback_ready',{id:setup.id}))}catch(e){piperStatus.textContent=e.message||t('fallback_error');toast(piperStatus.textContent,true)}finally{btn.disabled=false}};
  }
  function playBlob(blob){const url=URL.createObjectURL(blob),audio=new Audio(url);audio.onended=()=>URL.revokeObjectURL(url);audio.onerror=()=>URL.revokeObjectURL(url);audio.play().catch(()=>URL.revokeObjectURL(url));}

  function hcaptchaLocale(){const f=uiFamily();return f==='nb'?'no':f;}
  function getHCaptcha(){
    if(window.hcaptcha)return Promise.resolve(window.hcaptcha);
    if(hcaptchaPromise)return hcaptchaPromise;
    hcaptchaPromise=new Promise((resolve,reject)=>{
      const cb='readerHCaptchaReady_'+Math.random().toString(36).slice(2);
      window[cb]=()=>{const h=window.hcaptcha;delete window[cb];h?resolve(h):reject(new Error(t('captcha_load_failed')))};
      const script=document.createElement('script');
      script.src=`https://js.hcaptcha.com/1/api.js?onload=${encodeURIComponent(cb)}&render=explicit`;
      script.async=true;script.defer=true;
      script.onerror=()=>{delete window[cb];reject(new Error(t('captcha_load_failed')))};
      document.head.appendChild(script);
    });
    return hcaptchaPromise;
  }
  async function mountCaptcha(container){
    if(!BOOT.hcaptchaEnabled||!BOOT.hcaptchaSiteKey)throw new Error(t('captcha_not_configured'));
    const h=await getHCaptcha();
    return h.render(container,{sitekey:BOOT.hcaptchaSiteKey,theme:'light',size:'normal',hl:hcaptchaLocale()});
  }
  function captchaResponse(widgetId){
    const token=window.hcaptcha&&widgetId!=null?window.hcaptcha.getResponse(widgetId):'';
    if(!token)throw new Error(t('captcha_required'));
    return token;
  }
  function resetCaptcha(widgetId){try{if(window.hcaptcha&&widgetId!=null)window.hcaptcha.reset(widgetId)}catch(_){}}

  function renderAccount(root){
    const q=quotaInfo(),pct=q.limit===Infinity?20:Math.min(100,Math.round((q.used/Math.max(1,q.limit))*100));
    const guestActions=`<button class="btn primary" id="loginBtn">${esc(t('sign_in_paid'))}</button><button class="btn secondary" id="signupBtn">${esc(t('request_access'))}</button><button class="btn ghost" id="adminLoginBtn">${esc(t('super_admin_login'))}</button>`;
    const adminPanel=state.plan.role==='superadmin'?`<section class="section admin-section"><div class="panel-title"><div><h2>${esc(t('super_admin'))}</h2><p class="muted">${esc(t('admin_desc'))}</p></div><button class="btn compact primary" id="newUserBtn">${esc(t('add_user'))}</button></div><div class="admin-grid"><div class="paper-panel"><h3>${esc(t('account'))}</h3><div id="adminUsers">${esc(t('loading_users'))}</div></div><div class="paper-panel"><h3>${esc(t('signup_requests'))}</h3><p class="fine">${esc(t('approval_email_only'))}</p><div id="signupRequests">${esc(t('loading_users'))}</div></div><div class="paper-panel admin-settings-panel"><h3>${esc(t('security_settings'))}</h3><div id="adminSettings">${esc(t('loading_settings'))}</div></div></div></section>`:'';
    root.innerHTML=`<div class="page-heading"><div class="eyebrow">${esc(t('plan_privacy'))}</div><h1>${esc(state.plan.authenticated?t('account'):t('free_no_login'))}</h1><p class="lead">${esc(t('account_lead'))}</p></div><div class="account-grid"><section class="price-card"><span class="badge green">${esc(t('monthly_plan'))}</span><div class="price">€3<small>${esc(t('per_month'))}</small></div><p>${esc(t('plan_desc'))}</p><div class="field"><label>${esc(t('retained_books'))}</label><input id="priceBooks" type="range" min="3" max="20" value="${Math.max(3,q.limit===Infinity?3:q.limit)}"></div><div class="quota-copy"><span id="priceBookLabel">3 ${esc(t('books'))}</span><strong id="priceLabel">€3${esc(t('per_month'))}</strong></div><p class="fine">${esc(t('billing_note'))}</p></section><section class="paper-panel"><h2>${esc(state.plan.authenticated?t('local_allowance'):t('guest_mode'))}</h2><div class="quota-meter"><div class="quota-track"><i style="width:${pct}%"></i></div><div class="quota-copy"><span>${q.used} ${esc(t('used'))}</span><span>${q.limit===Infinity?esc(t('unlimited')):`${q.limit} ${esc(t('allowed'))}`}</span></div></div><p class="muted">${esc(state.plan.authenticated?t('account_privacy'):t('guest_privacy'))}</p><div class="row-actions">${state.plan.authenticated?`<button class="btn secondary" id="logoutBtn">${esc(t('log_out'))}</button>`:guestActions}</div></section></div>${adminPanel}`;
    const range=root.querySelector('#priceBooks'),update=()=>{const n=Number(range.value);root.querySelector('#priceBookLabel').textContent=`${n} ${t('books')}`;root.querySelector('#priceLabel').textContent=`€${3+Math.max(0,n-3)}${t('per_month')}`};range.oninput=update;update();
    root.querySelector('#loginBtn')?.addEventListener('click',()=>showLogin(false));
    root.querySelector('#adminLoginBtn')?.addEventListener('click',()=>showLogin(true));
    root.querySelector('#signupBtn')?.addEventListener('click',showSignup);
    root.querySelector('#logoutBtn')?.addEventListener('click',doLogout);
    if(state.plan.role==='superadmin'){
      root.querySelector('#newUserBtn').onclick=()=>showAdminUserForm();
      loadAdminUsers(root.querySelector('#adminUsers'));
      loadSignupRequests(root.querySelector('#signupRequests'));
      loadAdminSettings(root.querySelector('#adminSettings'));
    }
  }

  function showLogin(adminMode=false){
    const title=adminMode?t('super_admin_login'):t('sign_in');
    const preset=adminMode?(BOOT.superAdminEmail||''):'';
    showModal(title,`<p class="muted">${esc(adminMode?t('super_admin_login_desc'):t('login_note'))}</p><div class="field"><label>${esc(t('email'))}</label><input id="loginEmail" type="email" autocomplete="username" value="${esc(preset)}" ${adminMode?'readonly':''}></div><div class="field"><label>${esc(t('password'))}</label><input id="loginPassword" type="password" autocomplete="current-password"></div><div class="captcha-wrap"><div id="loginCaptcha"></div><p class="fine">${esc(t('captcha_protection'))}</p></div><button class="btn primary full" id="doLogin" disabled>${esc(t('sign_in'))}</button>`,async m=>{
      let widgetId=null;const btn=m.querySelector('#doLogin');
      try{widgetId=await mountCaptcha(m.querySelector('#loginCaptcha'));btn.disabled=false}catch(e){toast(e.message||t('captcha_load_failed'),true)}
      btn.onclick=async()=>{btn.disabled=true;try{const captcha_token=captchaResponse(widgetId);const data=await api({action:'login',email:m.querySelector('#loginEmail').value,password:m.querySelector('#loginPassword').value,captcha_token});if(!data.ok)throw new Error(data.code==='captcha_required'?t('captcha_required'):(data.message||t('login_failed')));closeModal();location.reload()}catch(e){toast(e.message||t('login_failed'),true);resetCaptcha(widgetId);btn.disabled=false}};
    });
  }

  function showSignup(){
    showModal(t('signup_title'),`<p class="muted">${esc(t('signup_desc_secure'))}</p><div class="field"><label>${esc(t('name'))}</label><input id="signupName" maxlength="120" autocomplete="name"></div><div class="field"><label>${esc(t('email'))}</label><input id="signupEmail" type="email" maxlength="180" autocomplete="email"></div><div class="field"><label>${esc(t('desired_books'))}</label><input id="signupBooks" type="number" min="3" max="999" value="3"><p class="fine" id="signupPrice"></p></div><div class="field"><label>${esc(t('message_optional'))}</label><textarea id="signupMessage" maxlength="1500"></textarea></div><input id="signupWebsite" class="hp" tabindex="-1" autocomplete="off"><div class="captcha-wrap"><div id="signupCaptcha"></div><p class="fine">${esc(t('captcha_protection'))}</p></div><button class="btn primary full" id="sendSignup" disabled>${esc(t('send_request'))}</button>`,async m=>{
      let widgetId=null;const btn=m.querySelector('#sendSignup'),booksInput=m.querySelector('#signupBooks'),price=m.querySelector('#signupPrice');
      const updateSignupPrice=()=>{const n=Math.max(3,Number(booksInput.value||3));price.textContent=t('requested_price',{price:3+Math.max(0,n-3)})};booksInput.addEventListener('input',updateSignupPrice);updateSignupPrice();
      try{widgetId=await mountCaptcha(m.querySelector('#signupCaptcha'));btn.disabled=false}catch(e){toast(e.message||t('captcha_load_failed'),true)}
      btn.onclick=async()=>{btn.disabled=true;const email=m.querySelector('#signupEmail').value.trim();if(!/^\S+@\S+\.\S+$/.test(email)){toast(t('invalid_email'),true);resetCaptcha(widgetId);btn.disabled=false;return}try{const captcha_token=captchaResponse(widgetId);const data=await api({action:'signup_request',name:m.querySelector('#signupName').value.trim(),email,books:Number(m.querySelector('#signupBooks').value||3),message:m.querySelector('#signupMessage').value.trim(),website:m.querySelector('#signupWebsite').value,ui_language:state.uiLocale,captcha_token});if(!data.ok)throw new Error(data.code==='captcha_required'?t('captcha_required'):(data.message||t('request_failed')));closeModal();toast(data.mail_sent?t('request_sent_approval'):t('request_saved_no_mail'))}catch(e){toast(e.message||t('request_failed'),true);resetCaptcha(widgetId);btn.disabled=false}};
    });
  }

  async function doLogout(){await api({action:'logout'}).catch(()=>null);location.reload();}
  function paymentLabel(status){return status==='received'?t('payment_received'):status==='not_received'?t('payment_not_received'):status==='waived'?t('payment_waived'):status==='pending'?t('payment_pending'):t('payment_unknown')}
  async function api(payload){const res=await fetch(BOOT.apiBase||'api.php',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await res.json().catch(()=>({ok:false,message:t('invalid_server')}));if(!res.ok&&!data.message)data.message=t('server_error',{n:res.status});return data;}
  async function loadAdminUsers(el){try{const data=await api({action:'admin_list_users'});if(!data.ok)throw new Error(data.message);el.innerHTML=(data.users||[]).length?(data.users||[]).map(u=>`<div class="admin-user"><div><strong>${esc(u.email)}</strong><span>${u.unlimited?esc(t('unlimited_grant')):`${3+Number(u.extra_books||0)} ${esc(t('books'))}`} · ${esc(u.subscription_status==='pending_activation'?t('awaiting_activation'):(u.subscription_status||t('admin_status_active')))} · ${esc(paymentLabel(u.payment_status))}${u.disabled?' · '+esc(t('disabled')):''}</span></div><button class="btn compact ghost" data-edit-user="${esc(u.email)}">${esc(t('edit'))}</button></div>`).join(''):esc(t('no_users'));el.querySelectorAll('[data-edit-user]').forEach(b=>b.onclick=()=>showAdminUserForm((data.users||[]).find(x=>x.email===b.dataset.editUser)))}catch(e){el.textContent=e.message||t('unable_users')}}
  function showAdminUserForm(user){user=user||{};const extra=user.email?Number(user.extra_books||0):0;showModal(user.email?t('edit_user'):t('new_user'),`<div class="field"><label>${esc(t('email'))}</label><input id="adminEmail" type="email" value="${esc(user.email||'')}" ${user.email?'readonly':''}></div><div class="field"><label>${esc(user.email?t('new_password'):t('password'))}</label><input id="adminPassword" type="password"></div><div class="field"><label>${esc(t('extra_slots'))}</label><input id="adminExtra" type="number" min="0" max="996" value="${extra}"></div><label class="check-row"><input id="adminUnlimited" type="checkbox" ${user.unlimited?'checked':''}> ${esc(t('unlimited_free'))}</label><label class="check-row"><input id="adminDisabled" type="checkbox" ${user.disabled?'checked':''}> ${esc(t('disabled'))}</label><button class="btn primary full" id="saveAdminUser">${esc(t('save_user'))}</button>`,m=>{m.querySelector('#saveAdminUser').onclick=async()=>{const data=await api({action:'admin_save_user',email:m.querySelector('#adminEmail').value,password:m.querySelector('#adminPassword').value,extra_books:Number(m.querySelector('#adminExtra').value||0),unlimited:m.querySelector('#adminUnlimited').checked,disabled:m.querySelector('#adminDisabled').checked});if(!data.ok)return toast(data.message||t('could_not_save'),true);closeModal();toast(t('user_saved'));const users=document.getElementById('adminUsers');if(users)loadAdminUsers(users)}});}
  async function loadSignupRequests(el){
    try{
      const data=await api({action:'admin_list_signups'});if(!data.ok)throw new Error(data.message);
      el.innerHTML=(data.requests||[]).length?(data.requests||[]).map(r=>{const monthly=Number(r.monthly_eur||3+Math.max(0,Number(r.books||3)-3)),statusLabel=r.status==='handled'?t('handled'):r.status==='awaiting_payment'?t('awaiting_payment'):r.status==='approved_waiting_activation'?t('awaiting_activation'):t('pending'),waitingActivation=r.status==='approved_waiting_activation',note=waitingActivation?t('activation_email_pending_note'):(r.status!=='handled'?(r.approval_expired?t('approval_link_expired'):t('approval_link_sent')):'');return `<div class="signup-request ${r.status==='handled'?'handled':''}"><div><strong>${esc(r.name||r.email)}</strong><span>${esc(r.email)} · ${esc(t('requested_books',{n:r.books||3}))} · €${monthly}${esc(t('per_month'))} · ${esc(paymentLabel(r.payment_status||'pending'))} · ${esc(statusLabel)}</span>${r.message?`<p>${esc(r.message)}</p>`:''}${note?`<p class="fine">${esc(note)}</p>`:''}</div><div class="request-actions">${waitingActivation?`<button class="btn compact primary" data-resend-activation="${esc(r.email)}">${esc(t('resend_activation'))}</button>`:r.status!=='handled'?`<button class="btn compact primary" data-resend-request="${esc(r.id)}">${esc(t('resend_approval'))}</button>`:''}${r.status!=='handled'?`<button class="btn compact ghost" data-handle-request="${esc(r.id)}">${esc(t('mark_handled'))}</button>`:''}</div></div>`}).join(''):esc(t('no_requests'));
      el.querySelectorAll('[data-resend-request]').forEach(b=>b.onclick=async()=>{b.disabled=true;const d=await api({action:'admin_resend_approval',id:b.dataset.resendRequest});toast(d.ok?(d.mail_sent?t('approval_resent'):t('request_saved_no_mail')):(d.message||t('request_failed')),!d.ok);b.disabled=false;if(d.ok)loadSignupRequests(el)});
      el.querySelectorAll('[data-resend-activation]').forEach(b=>b.onclick=async()=>{b.disabled=true;const d=await api({action:'admin_resend_activation',email:b.dataset.resendActivation});toast(d.ok?(d.mail_sent?t('activation_resent'):t('activation_email_failed')):(d.message||t('request_failed')),!d.ok);b.disabled=false;if(d.ok)loadSignupRequests(el)});
      el.querySelectorAll('[data-handle-request]').forEach(b=>b.onclick=async()=>{const d=await api({action:'admin_signup_status',id:b.dataset.handleRequest,status:'handled'});if(d.ok){toast(t('request_updated'));loadSignupRequests(el)}})
    }catch(e){el.textContent=e.message||t('request_failed')}
  }
  async function loadAdminSettings(el){
    try{
      const data=await api({action:'admin_get_settings'});if(!data.ok)throw new Error(data.message);const s=data.settings||{};
      el.innerHTML=`<div class="field"><label>${esc(t('hcaptcha_site_key'))}</label><input id="settingSiteKey" value="${esc(s.hcaptcha_site_key||'')}"></div><div class="field"><label>${esc(t('hcaptcha_secret'))}</label><input id="settingSecret" type="password" placeholder="${esc(s.hcaptcha_secret_set?t('secret_configured'):t('secret_required'))}" autocomplete="new-password"></div><div class="field"><label>${esc(t('approval_email'))}</label><input id="settingApprovalEmail" type="email" value="${esc(s.signup_to_email||'')}"></div><div class="field"><label>${esc(t('mail_from'))}</label><input id="settingMailFrom" type="email" value="${esc(s.mail_from||'')}"></div><div class="field"><label>${esc(t('application_url'))}</label><input id="settingBaseUrl" type="url" value="${esc(s.app_base_url||'')}"></div><div class="field"><label>${esc(t('approval_link_hours'))}</label><input id="settingHours" type="number" min="1" max="168" value="${Number(s.approval_hours||48)}"></div><p class="fine">${esc(t('secret_server_only'))}</p><button class="btn primary full" id="saveSecuritySettings">${esc(t('save_settings'))}</button><div class="admin-cache-tools"><div><strong>${esc(t('cache_tools'))}</strong><p>${esc(t('cache_tools_desc'))}</p><span>${esc(t('app_version'))}: ${esc(BOOT.version||'')} ${s.cache_cleared_at?`· ${esc(t('cache_last_cleared'))}: ${esc(new Date(s.cache_cleared_at).toLocaleString())}`:''}</span></div><button class="btn secondary" id="clearAppCache">${esc(t('clear_app_cache'))}</button></div>`;
      el.querySelector('#saveSecuritySettings').onclick=async()=>{const btn=el.querySelector('#saveSecuritySettings');btn.disabled=true;const d=await api({action:'admin_save_settings',hcaptcha_site_key:el.querySelector('#settingSiteKey').value.trim(),hcaptcha_secret:el.querySelector('#settingSecret').value.trim(),signup_to_email:el.querySelector('#settingApprovalEmail').value.trim(),mail_from:el.querySelector('#settingMailFrom').value.trim(),app_base_url:el.querySelector('#settingBaseUrl').value.trim(),approval_hours:Number(el.querySelector('#settingHours').value||48)});if(!d.ok){toast(d.message||t('could_not_save'),true);btn.disabled=false;return}toast(t('security_settings_saved'));setTimeout(()=>location.reload(),500)};
      el.querySelector('#clearAppCache').onclick=async()=>{const btn=el.querySelector('#clearAppCache');if(!confirm(t('clear_cache_confirm')))return;btn.disabled=true;const d=await api({action:'admin_clear_cache'});if(!d.ok){toast(d.message||t('cache_clear_failed'),true);btn.disabled=false;return}toast(t('cache_clearing'));try{if('caches'in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('book-reader-')).map(k=>caches.delete(k)));}if('serviceWorker'in navigator){const scope=new URL('./',location.href).href,regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.filter(r=>r.scope===scope).map(r=>r.unregister()));}}catch(_){/* server revision still guarantees fresh asset URLs */}const u=new URL(location.href);u.searchParams.set('_fresh',d.revision||Date.now().toString());location.replace(u.toString());};
    }catch(e){el.textContent=e.message||t('could_not_load_settings')}
  }
  async function handleApprovalLink(){
    const q=new URLSearchParams(location.search),id=q.get('approve'),expires=Number(q.get('expires')||0),token=q.get('token')||'';
    if(!id||!expires||!token)return;
    if(state.plan.role!=='superadmin'){showLogin(true);return;}
    const data=await api({action:'admin_approval_info',id,expires,token});if(!data.ok){toast(data.message||t('approval_invalid'),true);return;}
    const r=data.request||{},extra=Math.max(0,Number(r.books||3)-3),monthly=Number(r.monthly_eur||3+extra);
    showModal(t('approve_account'),`<div class="approval-summary"><strong>${esc(r.name||r.email)}</strong><span>${esc(r.email)}</span><span>${esc(t('requested_books',{n:r.books||3}))}</span><span>${esc(t('requested_price',{price:monthly}))}</span><span>${esc(paymentLabel(r.payment_status||'pending'))}</span></div><p class="muted">${esc(t('approval_link_verified'))}</p><div class="field"><label>${esc(t('payment_decision'))}</label><select id="approvalPayment"><option value="not_received" ${(r.payment_status||'')==='not_received'?'selected':''}>${esc(t('payment_not_received'))}</option><option value="received" ${(r.payment_status||'')==='received'?'selected':''}>${esc(t('payment_received'))}</option></select><p class="fine">${esc(t('payment_required_note'))}</p></div><div class="field"><label>${esc(t('extra_slots'))}</label><input id="approvalExtra" type="number" min="0" max="996" value="${extra}"></div><label class="check-row"><input id="approvalUnlimited" type="checkbox"> ${esc(t('unlimited_free'))}</label><p class="fine">${esc(t('approval_activation_note'))}</p><button class="btn primary full" id="approveAccountBtn"></button>`,m=>{const btn=m.querySelector('#approveAccountBtn'),pay=m.querySelector('#approvalPayment'),unlimited=m.querySelector('#approvalUnlimited'),sync=()=>{btn.textContent=unlimited.checked?t('approve_free_account'):(pay.value==='received'?t('approve_send_activation'):t('save_awaiting_payment'))};pay.onchange=sync;unlimited.onchange=sync;sync();btn.onclick=async()=>{btn.disabled=true;const d=await api({action:'admin_approve_signup',id,expires,token,extra_books:Number(m.querySelector('#approvalExtra').value||0),unlimited:unlimited.checked,payment_status:pay.value});if(!d.ok){toast(d.message||t('could_not_save'),true);btn.disabled=false;return}closeModal();toast(d.approved?(d.activation_sent?t('approved_activation_sent',{email:d.email||r.email}):t('approved_activation_mail_failed')):t('payment_saved_waiting'));const u=new URL(location.href);['approve','expires','token'].forEach(k=>u.searchParams.delete(k));u.searchParams.set('view','account');history.replaceState({},'',u);renderShell()}});
  }
  async function handleActivationLink(){
    const q=new URLSearchParams(location.search),email=q.get('activate')||'',expires=Number(q.get('expires')||0),token=q.get('token')||'';if(!email||!expires||!token)return;
    const info=await api({action:'activation_info',email,expires,token});if(!info.ok){toast(info.message||t('activation_invalid'),true);return;}
    showModal(t('activate_account'),`<p class="muted">${esc(t('activation_desc',{email}))}</p><div class="field"><label>${esc(t('new_password'))}</label><input id="activationPassword" type="password" autocomplete="new-password"></div><div class="field"><label>${esc(t('confirm_password'))}</label><input id="activationPassword2" type="password" autocomplete="new-password"></div><div class="captcha-wrap"><div id="activationCaptcha"></div><p class="fine">${esc(t('captcha_protection'))}</p></div><button class="btn primary full" id="activateAccountBtn" disabled>${esc(t('activate_account'))}</button>`,async m=>{let widgetId=null;const btn=m.querySelector('#activateAccountBtn');try{widgetId=await mountCaptcha(m.querySelector('#activationCaptcha'));btn.disabled=false}catch(e){toast(e.message||t('captcha_load_failed'),true)}btn.onclick=async()=>{const p1=m.querySelector('#activationPassword').value,p2=m.querySelector('#activationPassword2').value;if(p1.length<8)return toast(t('password_min_8'),true);if(p1!==p2)return toast(t('passwords_mismatch'),true);btn.disabled=true;try{const captcha_token=captchaResponse(widgetId),d=await api({action:'activate_account',email,expires,token,password:p1,captcha_token});if(!d.ok)throw new Error(d.message||t('activation_failed'));closeModal();const u=new URL(location.href);['activate','expires','token'].forEach(k=>u.searchParams.delete(k));u.searchParams.set('view','library');history.replaceState({},'',u);toast(t('activation_complete'));setTimeout(()=>location.reload(),450)}catch(e){toast(e.message||t('activation_failed'),true);resetCaptcha(widgetId);btn.disabled=false}}});
  }

  function scheduleNaturalWarmup(book){
    if(!book||effectiveEngine(book.language)!=='natural'||!NATURAL_FAMILIES.has(family(book.language)))return;
    const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
    if(connection?.saveData||/2g/.test(String(connection?.effectiveType||'')))return;
    const run=()=>getNatural().then(n=>n.supports(book.language)?n.prepare(preferredNaturalStyle(book.language)):null).catch(()=>null);
    if('requestIdleCallback'in window)requestIdleCallback(run,{timeout:2500});else setTimeout(run,900);
  }
  function refreshOnboardingCopy(back){
    if(!back)return;
    const kicker=back.querySelector('[data-onboarding-kicker]'),title=back.querySelector('[data-onboarding-title]'),lead=back.querySelector('[data-onboarding-lead]'),label=back.querySelector('[data-onboarding-label]'),select=back.querySelector('#onboardingLanguage'),button=back.querySelector('#onboardingContinue');
    if(kicker)kicker.textContent=t('welcome');if(title)title.textContent=t('onboarding_title');if(lead)lead.textContent=t('onboarding_lead');if(label)label.textContent=t('choose_language_first');if(select){const aria=t('choose_language_first'),wrap=select.closest('[data-language-select]');select.setAttribute('aria-label',aria);wrap?.querySelector('.language-select-button')?.setAttribute('aria-label',aria);wrap?.querySelector('.language-menu')?.setAttribute('aria-label',aria);}if(button)button.textContent=t('continue');
  }
  function maybeShowOnboarding(){
    if(localStorage.getItem('reader_onboarding_v3')==='1')return;
    const params=new URLSearchParams(location.search);if(params.has('approve')||params.has('activate'))return;
    closeModal();const back=document.createElement('div');back.className='modal-backdrop onboarding-backdrop';back.innerHTML=`<div class="modal onboarding-modal" role="dialog" aria-modal="true"><div class="onboarding-mark"><img src="assets/icons/owl-book-192.png" alt=""></div><div class="eyebrow" data-onboarding-kicker>${esc(t('welcome'))}</div><h2 data-onboarding-title>${esc(t('onboarding_title'))}</h2><p class="muted" data-onboarding-lead>${esc(t('onboarding_lead'))}</p><div class="field onboarding-language"><label data-onboarding-label for="onboardingLanguageButton">${esc(t('choose_language_first'))}</label>${languageSelectMarkup('onboardingLanguage',state.uiLocale,'styled-select',t('choose_language_first'),uiLanguageOptions(state.uiLocale))}</div><button class="btn primary full" id="onboardingContinue">${esc(t('continue'))}</button></div>`;document.body.appendChild(back);const select=back.querySelector('#onboardingLanguage');select.onchange=()=>{syncLanguageSelect(select);setUiLanguage(select.value);refreshOnboardingCopy(back);};bindLanguageSelect(select);back.querySelector('#onboardingContinue').onclick=()=>{if(state.uiLocale!==select.value)setUiLanguage(select.value);localStorage.setItem('reader_onboarding_v3','1');back.remove();navigate('create');};
  }
  function showModal(title,body,onReady){closeModal();const back=document.createElement('div');back.className='modal-backdrop';back.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>${esc(title)}</h2><button class="x-btn" data-close-modal>×</button></div>${body}</div>`;document.body.appendChild(back);back.querySelector('[data-close-modal]').onclick=closeModal;back.addEventListener('click',e=>{if(e.target===back)closeModal()});if(onReady)onReady(back.querySelector('.modal'));}
  function closeModal(){if(state.audioExport?.running){state.audioExport.token++;state.audioExport.running=false;}document.querySelector('.modal-backdrop')?.remove();}
  function loadVoices(){if(!('speechSynthesis'in window))return;const refresh=()=>{state.voices=speechSynthesis.getVoices()||[]};refresh();speechSynthesis.addEventListener?.('voiceschanged',refresh);if('onvoiceschanged'in speechSynthesis)speechSynthesis.onvoiceschanged=refresh;}
  function installApp(){if(state.installPrompt){state.installPrompt.prompt();state.installPrompt.userChoice.finally(()=>state.installPrompt=null);return}toast(t('install_hint'));}
  function installPlatform(platform){if(platform==='android'){if(state.installPrompt){installApp();return}showModal(t('install_android'),`<p>${esc(t('install_android_steps'))}</p><p class="fine">${esc(t('install_android_note'))}</p>`);return}showModal(t('install_apple'),`<p>${esc(t('install_apple_steps'))}</p><p class="fine">${esc(t('install_apple_note'))}</p>`);}

  async function init(){setDocumentLanguage();clearTemporaryAudioCache().catch(()=>null);window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.installPrompt=e});if('serviceWorker'in navigator)navigator.serviceWorker.register(`service-worker.js?v=${encodeURIComponent(BOOT.assetVersion||BOOT.version||'1')}`).catch(()=>null);if(navigator.storage?.persist)navigator.storage.persist().catch(()=>false);loadVoices();try{await loadBooks()}catch(e){console.error(e);toast(t('storage_error'),true)}renderShell();await handleApprovalLink();await handleActivationLink();maybeShowOnboarding();}
  init();
})();
