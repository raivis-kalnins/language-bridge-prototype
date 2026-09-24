(()=>{
'use strict';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const todayKey=()=>new Date().toISOString().slice(0,10);
const langs={en:{label:'English',code:'en-GB'},lv:{label:'Latviešu',code:'lv-LV'}};

const state={
  view:localStorage.getItem('lb_view')||'home',
  ui:localStorage.getItem('lb_ui')||'en',
  learn:localStorage.getItem('lb_learn')||'en',
  native:localStorage.getItem('lb_native')||'lv',
  level:localStorage.getItem('lb_level')||'A2',
  coachMode:localStorage.getItem('lb_coach_mode')||'speak',
  words:[],ai:null,aiLoading:false,aiModel:'Llama-3.2-1B-Instruct-q4f16_1-MLC',history:[],scenario:'daily',
  recognition:null,installPrompt:null,quizIndex:0,quizScore:Number(localStorage.getItem('lb_quiz_score')||0),quizAnswered:false,
  gameMode:'match',game:null,builder:null,listeningGame:null,voices:[],pronPhrase:null
};
if(state.native===state.learn) state.learn=state.native==='lv'?'en':'lv';

const T={
 en:{
  app:'Language Bridge',sub:'English ↔ Latvian',home:'Home',coach:'Coach',pron:'Pronunciation',dict:'Dictionary',practice:'Grammar',games:'Games',reader:'Reader',install:'Install',
  eyebrow:'FREE · LOCAL-FIRST · BILINGUAL',hero:'Speak it. Write it. Improve it.',lead:'A friendly English ↔ Latvian practice space for real conversation, writing correction, pronunciation, vocabulary, grammar and games — without needing a monthly subscription.',
  startCoach:'Open language coach',startPron:'Train pronunciation',dailyGoal:'Daily practice',xpToday:'XP today',goalDone:'Daily goal reached',
  speaking:'Speaking coach',speakingText:'Talk naturally, see corrections, hear a better version and keep the conversation moving.',writing:'Writing coach',writingText:'Write a sentence as you think it should be. The coach corrects it, improves it and explains why.',
  dictionary:'Smart dictionary',dictionaryText:'Offline EN↔LV vocabulary plus online English definitions and Latvian Tēzaurs language data.',gamesText:'Memory, sentence-building and listening games.',
  direction:'Learning direction',nativeLang:'I know',targetLang:'I am learning',level:'Level',scenario:'Situation',daily:'Everyday',cafe:'Café',travel:'Travel',work:'Work',doctor:'Health',interview:'Job interview',
  speakMode:'Speak',writeMode:'Write',aiEngine:'Tutor engine',practiceMode:'Fast free coach',localMode:'Local AI · no per-message fee',loadAi:'Load local AI',aiReady:'Local AI ready',aiLoading:'Loading local AI…',aiUnsupported:'WebGPU is not available here. The fast coach still works.',firstModel:'Local AI runs on your device. The first model download is large and can take significant storage.',
  typeMessage:'Say or type something…',send:'Send',clear:'Clear',speakReply:'Read tutor replies aloud',you:'You',tutor:'Coach',welcomeTutor:'Hello! Say or type something in your learning language. I’ll keep the conversation going and gently show useful corrections.',browserSpeechNote:'Microphone transcription uses the browser speech-recognition service when available. Browser support and privacy behaviour vary.',
  yourVersion:'Your version',corrected:'Corrected',natural:'More natural',why:'Why',listenBetter:'Listen to improved version',copy:'Copy',noChange:'This already looks natural. Nice work.',
  writingTitle:'Writing coach',writingLead:'Write any sentence, message or short paragraph. Get a corrected version, a more natural alternative and a short explanation.',writingPlaceholder:'Example: Yesterday I go to shop and buy some fruits.',improve:'Improve my writing',recent:'Recent corrections',
  voice:'Voice',speed:'Speed',voiceLocalNote:'Local voices stay on this device. Aivars is the free local Latvian voice. British English also has a local female option. Everita is an optional online Latvian female voice and needs Azure Speech to be configured on the server.',installVoice:'Install local voice',voiceReady:'Local voice installed',voiceNotInstalled:'Local voice not installed yet',voiceDownloading:'Downloading voice',voiceInstallFailed:'Voice download failed',testVoice:'Test selected voice',voiceTesting:'Testing voice…',voiceActive:'Selected voice is working',cloudVoice:'Online voice — no local download',cloudNotConfigured:'Online female voice needs Azure Speech configuration',systemDownloadUnsupported:'Audio download is not available for a Windows/Chrome device voice. Choose a local app voice or configured online voice.',downloadAudio:'Download audio',downloadChatAudio:'Download chat audio',audioPreparing:'Preparing audio…',audioReady:'Audio ready',audioFailed:'Could not create audio. Check the voice setup and try again.',
  pronTitle:'Pronunciation coach',pronLead:'Listen, repeat, compare the recognised words and focus on the parts that need another try.',newPhrase:'New phrase',hear:'Hear phrase',record:'Speak now',heard:'What I heard',score:'Match score',good:'Very close. Repeat once for smoother rhythm.',okay:'Good start. Focus on the highlighted words and try again.',low:'Break the sentence into smaller chunks, then repeat it.',focus:'Focus words',yourPhrase:'Practise your own sentence',usePhrase:'Use this phrase',
  dictTitle:'Smart bilingual dictionary',dictLead:'Search the offline EN↔LV learning dictionary. For single words, you can also request live English definitions or Latvian Tēzaurs details.',search:'Search a word or phrase…',all:'Both',onlineLookup:'Online details',offlineCount:'offline entries',external:'Tēzaurs',noWords:'No offline translation found. Try Online details for a single word.',liveEnglish:'English dictionary details',liveLatvian:'Latvian language details',definitions:'Definitions',forms:'Word forms',source:'Source',
  grammarTitle:'Grammar gym',grammarLead:'Short practical questions for both languages with explanations.',next:'Next question',restart:'Restart',correct:'Correct',incorrect:'Not quite',
  gameTitle:'Language games',gameLead:'Choose a short game. Every completed round adds practice XP.',matchGame:'Match pairs',matchText:'Find English ↔ Latvian pairs.',builderGame:'Build a sentence',builderText:'Put words into the correct order.',listenGame:'Listen & choose',listenText:'Hear a sentence and choose its meaning.',newGame:'New round',moves:'Moves',matches:'Matches',best:'Best',check:'Check sentence',undo:'Undo',playAgain:'Play audio again',
  readerTitle:'Reader & listening',readerLead:'Use the original Book Reader for PDFs, DOCX, pasted text and read-aloud practice.',openReader:'Open Book Reader',
  privacy:'Progress and writing history stay in this browser. Local AI messages stay on-device when Local AI mode is used.',developed:'Language Bridge v0.4.2 · prepared for language.63.lv'
 },
 lv:{
  app:'Valodu Tilts',sub:'Angļu ↔ latviešu',home:'Sākums',coach:'Treneris',pron:'Izruna',dict:'Vārdnīca',practice:'Gramatika',games:'Spēles',reader:'Lasītājs',install:'Instalēt',
  eyebrow:'BEZMAKSAS · LOKĀLS · DIVVALODU',hero:'Runā. Raksti. Uzlabo.',lead:'Draudzīga angļu ↔ latviešu valodas prakses vieta sarunām, rakstīšanas labojumiem, izrunai, vārdu krājumam, gramatikai un spēlēm — bez obligāta mēneša abonementa.',
  startCoach:'Atvērt valodas treneri',startPron:'Trenēt izrunu',dailyGoal:'Dienas treniņš',xpToday:'XP šodien',goalDone:'Dienas mērķis sasniegts',
  speaking:'Runāšanas treneris',speakingText:'Runā dabiski, redzi labojumus, noklausies labāku variantu un turpini sarunu.',writing:'Rakstīšanas treneris',writingText:'Uzraksti teikumu tā, kā tev šķiet pareizi. Treneris to izlabo, uzlabo un īsi paskaidro.',
  dictionary:'Gudrā vārdnīca',dictionaryText:'Bezsaistes EN↔LV vārdi, angļu skaidrojumi un latviešu Tēzaura valodas dati.',gamesText:'Atmiņas, teikumu veidošanas un klausīšanās spēles.',
  direction:'Mācību virziens',nativeLang:'Es protu',targetLang:'Es mācos',level:'Līmenis',scenario:'Situācija',daily:'Ikdiena',cafe:'Kafejnīca',travel:'Ceļošana',work:'Darbs',doctor:'Veselība',interview:'Darba intervija',
  speakMode:'Runāt',writeMode:'Rakstīt',aiEngine:'Trenera režīms',practiceMode:'Ātrais bezmaksas treneris',localMode:'Lokāls MI · bez maksas par ziņu',loadAi:'Ielādēt lokālo MI',aiReady:'Lokālais MI gatavs',aiLoading:'Ielādē lokālo MI…',aiUnsupported:'WebGPU šajā ierīcē nav pieejams. Ātrais treneris joprojām darbojas.',firstModel:'Lokālais MI darbojas tavā ierīcē. Pirmā modeļa lejupielāde ir liela un aizņem ievērojamu vietu.',
  typeMessage:'Pasaki vai ieraksti kaut ko…',send:'Sūtīt',clear:'Notīrīt',speakReply:'Nolasīt trenera atbildes',you:'Tu',tutor:'Treneris',welcomeTutor:'Sveiki! Pasaki vai ieraksti kaut ko valodā, kuru mācies. Es turpināšu sarunu un parādīšu noderīgus labojumus.',browserSpeechNote:'Mikrofona tekstu atpazīst pārlūka runas atpazīšanas serviss, ja tas ir pieejams. Atbalsts un privātuma modelis atšķiras starp pārlūkiem.',
  yourVersion:'Tavs variants',corrected:'Izlabots',natural:'Dabiskāks variants',why:'Kāpēc',listenBetter:'Noklausīties uzlaboto variantu',copy:'Kopēt',noChange:'Šis jau izklausās dabiski. Labi!',
  writingTitle:'Rakstīšanas treneris',writingLead:'Uzraksti jebkuru teikumu, ziņu vai īsu rindkopu. Saņem labojumu, dabiskāku variantu un īsu skaidrojumu.',writingPlaceholder:'Piemērs: Yesterday I go to shop and buy some fruits.',improve:'Uzlabot manu tekstu',recent:'Nesenie labojumi',
  voice:'Balss',speed:'Ātrums',voiceLocalNote:'Lokālās balsis paliek šajā ierīcē. Aivars ir bezmaksas lokālā latviešu balss. Britu angļu valodai ir arī lokāla sievietes balss. Everita ir izvēles tiešsaistes latviešu sievietes balss, kurai serverī jākonfigurē Azure Speech.',installVoice:'Instalēt lokālo balsi',voiceReady:'Lokālā balss instalēta',voiceNotInstalled:'Lokālā balss vēl nav instalēta',voiceDownloading:'Lejupielādē balsi',voiceInstallFailed:'Balss lejupielāde neizdevās',testVoice:'Pārbaudīt izvēlēto balsi',voiceTesting:'Pārbauda balsi…',voiceActive:'Izvēlētā balss darbojas',cloudVoice:'Tiešsaistes balss — nav jālejupielādē',cloudNotConfigured:'Tiešsaistes sievietes balsij jākonfigurē Azure Speech',systemDownloadUnsupported:'Windows/Chrome ierīces balsi nevar droši lejupielādēt kā audio failu. Izvēlies lokālo lietotnes balsi vai konfigurētu tiešsaistes balsi.',downloadAudio:'Lejupielādēt audio',downloadChatAudio:'Lejupielādēt sarunas audio',audioPreparing:'Gatavo audio…',audioReady:'Audio gatavs',audioFailed:'Audio neizdevās izveidot. Pārbaudi balss iestatījumus un mēģini vēlreiz.',
  pronTitle:'Izrunas treneris',pronLead:'Noklausies, atkārto, salīdzini atpazītos vārdus un pievērs uzmanību vietām, kuras jāizmēģina vēlreiz.',newPhrase:'Jauna frāze',hear:'Noklausīties',record:'Runāt tagad',heard:'Ko sadzirdēja',score:'Sakritības rezultāts',good:'Ļoti tuvu. Atkārto vēlreiz plūstošākam ritmam.',okay:'Labs sākums. Pievērs uzmanību izceltajiem vārdiem un mēģini vēlreiz.',low:'Sadali teikumu īsākās daļās un atkārto.',focus:'Pievērs uzmanību',yourPhrase:'Trenē savu teikumu',usePhrase:'Izmantot šo frāzi',
  dictTitle:'Gudrā divvalodu vārdnīca',dictLead:'Meklē bezsaistes EN↔LV mācību vārdnīcā. Atsevišķiem vārdiem vari pieprasīt arī angļu skaidrojumus vai Tēzaura latviešu valodas datus.',search:'Meklēt vārdu vai frāzi…',all:'Abi',onlineLookup:'Tiešsaistes dati',offlineCount:'bezsaistes šķirkļi',external:'Tēzaurs',noWords:'Bezsaistes tulkojums nav atrasts. Vienam vārdam izmēģini Tiešsaistes datus.',liveEnglish:'Angļu vārdnīcas dati',liveLatvian:'Latviešu valodas dati',definitions:'Skaidrojumi',forms:'Vārdu formas',source:'Avots',
  grammarTitle:'Gramatikas treniņš',grammarLead:'Īsi praktiski jautājumi abās valodās ar paskaidrojumiem.',next:'Nākamais',restart:'Sākt no jauna',correct:'Pareizi',incorrect:'Ne gluži',
  gameTitle:'Valodu spēles',gameLead:'Izvēlies īsu spēli. Par pabeigtu kārtu saņem treniņa XP.',matchGame:'Savieno pārus',matchText:'Atrodi angļu ↔ latviešu pārus.',builderGame:'Saliec teikumu',builderText:'Saliec vārdus pareizā secībā.',listenGame:'Klausies un izvēlies',listenText:'Noklausies teikumu un izvēlies tā nozīmi.',newGame:'Jauna kārta',moves:'Gājieni',matches:'Pāri',best:'Labākais',check:'Pārbaudīt teikumu',undo:'Atcelt',playAgain:'Atskaņot vēlreiz',
  readerTitle:'Lasīšana un klausīšanās',readerLead:'Izmanto sākotnējo Book Reader PDF, DOCX, ielīmētam tekstam un skaļai nolasīšanai.',openReader:'Atvērt Book Reader',
  privacy:'Progress un rakstīšanas vēsture paliek šajā pārlūkā. Lokālā MI režīmā ziņas paliek ierīcē.',developed:'Valodu Tilts v0.4.2 · sagatavots language.63.lv'
 }
};
const tr=k=>T[state.ui][k]||T.en[k]||k;

const scenarioSeeds={
 daily:{en:['What did you do today?','What are you planning for tomorrow?','Tell me about something you enjoy doing.'],lv:['Ko tu šodien darīji?','Ko tu plāno darīt rīt?','Pastāsti par kaut ko, ko tev patīk darīt.']},
 cafe:{en:['What would you like to order?','Would you like anything to drink?','How would you ask for the bill?'],lv:['Ko jūs vēlētos pasūtīt?','Vai vēlaties kaut ko dzert?','Kā jūs palūgtu rēķinu?']},
 travel:{en:['Where are you travelling to?','How would you ask for directions?','What do you usually pack for a trip?'],lv:['Uz kurieni tu ceļo?','Kā tu pajautātu ceļu?','Ko tu parasti ņem līdzi ceļojumā?']},
 work:{en:['What are you working on this week?','How would you explain a delay politely?','Tell me about a typical workday.'],lv:['Pie kā tu šonedēļ strādā?','Kā pieklājīgi paskaidrotu kavēšanos?','Pastāsti par tipisku darba dienu.']},
 doctor:{en:['How would you describe how you feel?','When did the problem start?','What would you ask the doctor?'],lv:['Kā tu aprakstītu savu pašsajūtu?','Kad problēma sākās?','Ko tu pajautātu ārstam?']},
 interview:{en:['Tell me about your experience.','What are your strengths?','Why are you interested in this role?'],lv:['Pastāsti par savu pieredzi.','Kādas ir tavas stiprās puses?','Kāpēc tevi interesē šis amats?']}
};

const phrases={
 en:[
  ['Could you say that again, please?','Vai jūs varētu to atkārtot?'],['I would like a cup of coffee, please.','Es gribētu tasi kafijas, lūdzu.'],['How much does this ticket cost?','Cik maksā šī biļete?'],['I am learning English and I want to practise speaking.','Es mācos angļu valodu un gribu trenēt runāšanu.'],['Could you speak a little more slowly?','Vai jūs varētu runāt mazliet lēnāk?'],['I have a meeting at ten o’clock.','Man ir sapulce pulksten desmitos.'],['Where is the nearest bus stop?','Kur ir tuvākā autobusa pietura?'],['It was nice talking with you.','Bija patīkami ar jums parunāt.'],['I have been living here for three years.','Es šeit dzīvoju jau trīs gadus.'],['Would you mind helping me for a moment?','Vai jūs varētu man uz brīdi palīdzēt?'],['I’m not sure how to explain it clearly.','Es neesmu pārliecināts, kā to skaidri izskaidrot.'],['What do you recommend for a beginner?','Ko jūs ieteiktu iesācējam?']
 ],
 lv:[
  ['Vai jūs varētu runāt mazliet lēnāk?','Could you speak a little more slowly?'],['Es mācos latviešu valodu un gribu trenēt runāšanu.','I am learning Latvian and I want to practise speaking.'],['Cik maksā šī biļete?','How much does this ticket cost?'],['Lūdzu, vienu kafiju bez piena.','One coffee without milk, please.'],['Kur ir tuvākā autobusa pietura?','Where is the nearest bus stop?'],['Man ir tikšanās pulksten desmitos.','I have a meeting at ten o’clock.'],['Prieks iepazīties!','Nice to meet you!'],['Vai varat man palīdzēt?','Can you help me?'],['Es šeit dzīvoju jau trīs gadus.','I have been living here for three years.'],['Vai jūs varētu to pateikt vēlreiz?','Could you say that again?'],['Es vēl mācos, tāpēc dažreiz kļūdos.','I am still learning, so I sometimes make mistakes.'],['Ko jūs ieteiktu iesācējam?','What would you recommend for a beginner?']
 ]
};

const quizzes=[
 {lang:'en',q:'Choose the correct sentence:',a:['She go to work every day.','She goes to work every day.','She going to work every day.'],ok:1,x:'With he/she/it in the present simple, the verb normally takes -s: “she goes”.',xl:'Tagadnes vienkāršajā laikā ar he/she/it darbības vārdam parasti pievieno -s: “she goes”.'},
 {lang:'en',q:'Complete: “I have lived here ___ 2022.”',a:['for','since','from'],ok:1,x:'Use “since” with a starting point in time.',xl:'Ar konkrētu sākuma brīdi lieto “since”.'},
 {lang:'en',q:'Which is correct?',a:['There are some water.','There is some water.','There is any water.'],ok:1,x:'“Water” is uncountable, so use “there is”.',xl:'“Water” ir neskaitāms lietvārds, tāpēc lieto “there is”.'},
 {lang:'en',q:'Complete: “If it rains, we ___ at home.”',a:['stay','will stay','stayed'],ok:1,x:'The first conditional uses present simple after “if” and “will” in the result clause.',xl:'Pirmajā nosacījuma teikumā pēc “if” lieto tagadni, bet rezultāta daļā “will”.'},
 {lang:'en',q:'Choose the natural phrase:',a:['I am agree with you.','I agree with you.','I agreeing with you.'],ok:1,x:'“Agree” is a verb, so English says “I agree”, not “I am agree”.',xl:'“Agree” ir darbības vārds, tāpēc saka “I agree”, nevis “I am agree”.'},
 {lang:'en',q:'Which preposition is correct? “See you ___ Monday.”',a:['in','on','at'],ok:1,x:'Use “on” with days of the week.',xl:'Ar nedēļas dienām angļu valodā lieto “on”.'},
 {lang:'en',q:'Choose the correct past form:',a:['I went to the shop.','I goed to the shop.','I go to the shop yesterday.'],ok:0,x:'The past form of “go” is irregular: “went”.',xl:'Darbības vārda “go” pagātnes forma ir neregulāra: “went”.'},
 {lang:'en',q:'Choose the better sentence:',a:['There were many people.','There was much people.','There were much people.'],ok:0,x:'“People” is countable plural, so use “many” and “were”.',xl:'“People” ir skaitāms daudzskaitlis, tāpēc lieto “many” un “were”.'},
 {lang:'lv',q:'Izvēlies pareizo formu: “Es ___ latviešu valodu.”',a:['mācos','mācās','mācāmies'],ok:0,x:'With “es”, use “mācos”.',xl:'Ar “es” lieto formu “mācos”.'},
 {lang:'lv',q:'Izvēlies pareizo teikumu:',a:['Man ir divdesmit gadi.','Es ir divdesmit gadi.','Man es divdesmit gadi.'],ok:0,x:'Age in Latvian is commonly expressed with “man ir … gadi”.',xl:'Vecumu latviešu valodā parasti izsaka ar “man ir … gadi”.'},
 {lang:'lv',q:'Aizpildi: “Es dzīvoju ___ Rīgā.”',a:['iekš','—','uz'],ok:1,x:'No preposition is needed before a city in this structure.',xl:'Šajā konstrukcijā pirms pilsētas prievārds nav vajadzīgs.'},
 {lang:'lv',q:'Izvēlies pareizo formu: “Viņa ___ uz darbu.”',a:['iet','eju','ejam'],ok:0,x:'With “viņa”, use third-person “iet”.',xl:'Ar “viņa” lieto 3. personas formu “iet”.'},
 {lang:'lv',q:'Izvēlies dabiskāko variantu:',a:['Es esmu piekritis ar tevi.','Es tev piekrītu.','Es piekrītu ar tu.'],ok:1,x:'Latvian commonly uses the dative: “es tev piekrītu”.',xl:'Ar “piekrist” parasti lieto datīvu: “es tev piekrītu”.'},
 {lang:'lv',q:'Aizpildi: “Mēs tiekamies ___ pirmdien.”',a:['iekš','—','uz'],ok:1,x:'With weekday names in this use, no preposition is needed.',xl:'Ar nedēļas dienu šeit prievārds nav vajadzīgs.'},
 {lang:'lv',q:'Kurš variants ir pareizs?',a:['Es vakar gāju uz veikalu.','Es vakar eju uz veikalu.','Es vakar iet uz veikalu.'],ok:0,x:'“Vakar” usually requires a past-tense verb here: “gāju”.',xl:'Ar “vakar” šajā teikumā vajadzīga pagātnes forma “gāju”.'},
 {lang:'lv',q:'Izvēlies pareizo vārdu: “Lūdzu, runājiet mazliet ___.”',a:['lēnāks','lēnām','lēna'],ok:1,x:'An adverb describes how someone speaks: “lēnām”.',xl:'Darbības veidu raksturo apstākļa vārds “lēnām”.'}
];

function save(){
 localStorage.setItem('lb_view',state.view);localStorage.setItem('lb_ui',state.ui);localStorage.setItem('lb_learn',state.learn);localStorage.setItem('lb_native',state.native);localStorage.setItem('lb_level',state.level);localStorage.setItem('lb_coach_mode',state.coachMode);
}
function navigate(view){state.view=view;save();render();window.scrollTo({top:0,behavior:'smooth'});}
function langOptions(selected){return Object.entries(langs).map(([k,v])=>`<option value="${k}" ${k===selected?'selected':''}>${v.label}</option>`).join('');}
function xpData(){const day=todayKey(),stored=JSON.parse(localStorage.getItem('lb_daily_xp')||'{}');return stored.day===day?stored:{day,xp:0};}
function addXP(n){const d=xpData();d.xp+=n;localStorage.setItem('lb_daily_xp',JSON.stringify(d));localStorage.setItem('lb_total_xp',String(Number(localStorage.getItem('lb_total_xp')||0)+n));}

function render(){
 document.documentElement.lang=state.ui;
 document.body.classList.remove('menu-open');
 const navItems=[['home','⌂'],['coach','✦'],['pron','◉'],['dict','Aa'],['practice','✓'],['games','◆'],['reader','▤']];
 const navButtons=navItems.map(([v,i])=>`<button data-view="${v}" class="${state.view===v?'active':''}"><span class="nav-icon" aria-hidden="true">${i}</span><span>${tr(v)}</span></button>`).join('');
 const menuLabel=state.ui==='lv'?'Izvēlne':'Menu';
 document.getElementById('app').innerHTML=`<div class="app-shell">
  <header class="site-head"><div class="head-inner">
   <button class="brand" data-view="home" aria-label="${tr('app')}"><img src="assets/icons/owl-book-64.png" alt=""><span class="brand-copy"><span class="brand-long">${tr('app')}</span><small>${tr('sub')}</small></span></button>
   <nav class="topnav" aria-label="${menuLabel}">${navButtons}</nav>
   <div class="head-actions"><select id="uiLang" class="lang-switch" aria-label="Interface language"><option value="en" ${state.ui==='en'?'selected':''}>EN</option><option value="lv" ${state.ui==='lv'?'selected':''}>LV</option></select><button data-install class="install desktop-install">＋ ${tr('install')}</button><button id="menuToggle" class="menu-toggle" type="button" aria-expanded="false" aria-controls="mobileNav" aria-label="${menuLabel}"><span></span><span></span><span></span></button></div>
   <div id="mobileNav" class="mobile-nav" aria-hidden="true"><nav aria-label="${menuLabel}">${navButtons}</nav><button data-install class="install mobile-install">＋ ${tr('install')}</button></div>
  </div><button id="menuBackdrop" class="menu-backdrop" type="button" tabindex="-1" aria-label="${state.ui==='lv'?'Aizvērt izvēlni':'Close menu'}"></button></header>
  <main><div id="view"></div></main>
  <footer><div class="footer-inner"><span>${tr('privacy')}</span><span>${tr('developed')}</span></div></footer>
 </div>`;
 const menu=$('#mobileNav'),toggle=$('#menuToggle'),backdrop=$('#menuBackdrop');
 const setMenu=open=>{if(!menu||!toggle||!backdrop)return;menu.classList.toggle('open',open);backdrop.classList.toggle('open',open);toggle.classList.toggle('open',open);toggle.setAttribute('aria-expanded',open?'true':'false');menu.setAttribute('aria-hidden',open?'false':'true');document.body.classList.toggle('menu-open',open);};
 if(toggle)toggle.onclick=()=>setMenu(!menu.classList.contains('open'));
 if(backdrop)backdrop.onclick=()=>setMenu(false);
 document.onkeydown=e=>{if(e.key==='Escape')setMenu(false);};
 $$('[data-view]').forEach(b=>b.onclick=()=>{setMenu(false);navigate(b.dataset.view);});
 $('#uiLang').onchange=e=>{state.ui=e.target.value;save();render();};
 $$('[data-install]').forEach(b=>b.onclick=installApp);
 const map={home:renderHome,coach:renderCoach,pron:renderPron,dict:renderDict,practice:renderPractice,games:renderGames,reader:renderReader};
 (map[state.view]||renderHome)($('#view'));
}

function renderHome(root){
 const xp=xpData().xp, goal=30, pct=Math.min(100,Math.round(xp/goal*100));
 root.innerHTML=`<section class="hero">
  <div class="hero-main"><div class="eyebrow">${tr('eyebrow')}</div><h1>${tr('hero')}</h1><p>${tr('lead')}</p><div class="cta-row"><button class="btn primary" data-go="coach">✦ ${tr('startCoach')}</button><button class="btn warm" data-go="pron">🎙 ${tr('startPron')}</button></div></div>
  <div class="hero-side">
   <div class="daily-card"><div class="daily-top"><div><div class="daily-label">${tr('dailyGoal')}</div><div class="daily-number">${xp} / ${goal}</div></div><div style="font-size:30px">${pct>=100?'🏆':'🌱'}</div></div><div class="progress"><i style="width:${pct}%"></i></div><div class="hint" style="margin-top:8px">${pct>=100?tr('goalDone'):tr('xpToday')}</div></div>
   <div class="quick-grid">
    <button class="quick-card" data-go="coach" data-mode="speak"><span class="icon">🎙</span><strong>${tr('speaking')}</strong><span>${tr('speakingText')}</span></button>
    <button class="quick-card" data-go="coach" data-mode="write"><span class="icon">✍️</span><strong>${tr('writing')}</strong><span>${tr('writingText')}</span></button>
    <button class="quick-card" data-go="dict"><span class="icon">📚</span><strong>${tr('dictionary')}</strong><span>${tr('dictionaryText')}</span></button>
    <button class="quick-card" data-go="games"><span class="icon">🎮</span><strong>${tr('games')}</strong><span>${tr('gamesText')}</span></button>
   </div>
  </div>
 </section>`;
 $$('[data-go]',root).forEach(b=>b.onclick=()=>{if(b.dataset.mode){state.coachMode=b.dataset.mode;save();}navigate(b.dataset.go);});
}

function directionPanel(){return `<div class="grid-3"><div class="field"><label>${tr('nativeLang')}</label><select id="nativeLang">${langOptions(state.native)}</select></div><div class="field"><label>${tr('targetLang')}</label><select id="targetLang">${langOptions(state.learn)}</select></div><div class="field"><label>${tr('level')}</label><select id="level">${['A1','A2','B1','B2','C1'].map(x=>`<option ${x===state.level?'selected':''}>${x}</option>`).join('')}</select></div></div>`;}
function bindDirection(root,onChange){
 $('#nativeLang',root).onchange=e=>{state.native=e.target.value;if(state.native===state.learn)state.learn=state.native==='lv'?'en':'lv';save();onChange?onChange():render();};
 $('#targetLang',root).onchange=e=>{state.learn=e.target.value;if(state.learn===state.native)state.native=state.learn==='lv'?'en':'lv';save();state.pronPhrase=null;onChange?onChange():render();};
 $('#level',root).onchange=e=>{state.level=e.target.value;save();};
}
const PIPER_VOICES={
 lv:[{id:'piper:lv_LV-aivars-medium',label:'Aivars · Latvian · local neural (~64 MB)'}],
 en:[{id:'piper:en_GB-alan-medium',label:'Alan · British English · local male'},{id:'piper:en_GB-southern_english_female-low',label:'Southern English · British English · local female'}]
};
const CLOUD_VOICES={
 lv:[{id:'azure:lv-LV-EveritaNeural',label:'Everita · Latvian · female · online'}],
 en:[{id:'azure:en-GB-SoniaNeural',label:'Sonia · British English · female · online'},{id:'azure:en-GB-RyanNeural',label:'Ryan · British English · male · online'}]
};
// @mintplex-labs/piper-tts-web@1.0.5 ships a static model map copied before
// Aivars was added to Piper. Keep its runtime, but explicitly add the missing
// Latvian path and rewrite only Latvian model downloads to the maintained
// rhasspy Piper voice repository. This avoids a wrong-language fallback.
const PIPER_EXTRA_PATHS={
 'lv_LV-aivars-medium':'lv/lv_LV/aivars/medium/lv_LV-aivars-medium.onnx'
};
const PIPER_OLD_MODEL_BASE='https://huggingface.co/diffusionstudio/piper-voices/resolve/main';
const PIPER_AIVARS_MODEL_BASE='https://huggingface.co/RaivisDejus/Piper-lv_LV-Aivars-medium/resolve/main';
const PIPER_MODULE_URLS=['https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.5/+esm','https://esm.run/@mintplex-labs/piper-tts-web@1.0.5'];
let piperPromise=null,currentTtsAudio=null,activePiperVoiceId='';
function refreshVoices(){if('speechSynthesis'in window){state.voices=speechSynthesis.getVoices()||[];}}
function systemVoices(langKey){
 refreshVoices();
 return state.voices.filter(v=>{const l=String(v.lang||'').replace('_','-').toLowerCase();return langKey==='en'?l==='en-gb':l==='lv-lv'||l.startsWith('lv-');});
}
function validVoiceIds(langKey){return new Set([...(PIPER_VOICES[langKey]||[]).map(v=>v.id),...(CLOUD_VOICES[langKey]||[]).map(v=>v.id),...systemVoices(langKey).map(v=>'system:'+v.voiceURI)]);}
function selectedVoiceId(langKey){
 const saved=localStorage.getItem('lb_voice_'+langKey)||'';
 const valid=validVoiceIds(langKey);
 if(saved&&valid.has(saved))return saved;
 return (PIPER_VOICES[langKey]||[])[0]?.id||([...valid][0]||'');
}
function voiceOptions(langKey){
 const saved=selectedVoiceId(langKey),locals=PIPER_VOICES[langKey]||[],cloud=CLOUD_VOICES[langKey]||[],systems=systemVoices(langKey);
 let out=locals.map(v=>`<option value="${esc(v.id)}" ${v.id===saved?'selected':''}>${esc(v.label)}</option>`).join('');
 if(cloud.length){out+=`<optgroup label="${state.ui==='lv'?'Tiešsaistes balsis':'Online voices'}">${cloud.map(v=>`<option value="${esc(v.id)}" ${v.id===saved?'selected':''}>${esc(v.label)}</option>`).join('')}</optgroup>`;}
 if(systems.length){out+=`<optgroup label="${state.ui==='lv'?'Ierīces balsis':'Device voices'}">${systems.map(v=>{const id='system:'+v.voiceURI;return `<option value="${esc(id)}" ${id===saved?'selected':''}>${esc(v.name)} · ${esc(v.lang)}</option>`;}).join('')}</optgroup>`;}
 return out||`<option value="">${langs[langKey].label}</option>`;
}
function refreshVoiceSelects(){
 refreshVoices();
 $$('#voiceSelect').forEach(sel=>{const value=selectedVoiceId(state.learn);sel.innerHTML=voiceOptions(state.learn);if([...sel.options].some(o=>o.value===value))sel.value=value;});
}
function voiceControls(){const rate=Number(localStorage.getItem('lb_voice_rate')||0.92);return `<div class="grid-2 voice-controls"><div class="field"><label>${tr('voice')}</label><select id="voiceSelect">${voiceOptions(state.learn)}</select></div><div class="field"><label>${tr('speed')}</label><div class="range-control"><input id="voiceRate" class="voice-rate" type="range" min="0.65" max="1.15" step="0.05" value="${rate}" aria-label="${tr('speed')}"><output class="range-value" id="rateLabel">${rate.toFixed(2)}×</output></div></div></div><div class="voice-install-row"><button type="button" class="btn ghost small" data-install-voice>⬇ ${tr('installVoice')}</button><button type="button" class="btn ghost small" data-test-voice>▶ ${tr('testVoice')}</button><span class="voice-install-status hint" data-voice-status>${tr('voiceNotInstalled')}</span></div><p class="tts-note">${tr('voiceLocalNote')}</p>`;}
function bindVoiceControls(root){const sel=$('#voiceSelect',root),rate=$('#voiceRate',root),installBtn=$('[data-install-voice]',root),testBtn=$('[data-test-voice]',root);if(sel)sel.onchange=e=>{localStorage.setItem('lb_voice_'+state.learn,e.target.value);activePiperVoiceId='';refreshInstalledVoiceStatus(root);};if(rate)rate.oninput=e=>{localStorage.setItem('lb_voice_rate',e.target.value);const l=$('#rateLabel',root);if(l)l.textContent=Number(e.target.value).toFixed(2)+'×';};if(installBtn)installBtn.onclick=()=>installSelectedAppVoice(root);if(testBtn)testBtn.onclick=()=>testSelectedVoice(root,testBtn);refreshInstalledVoiceStatus(root);}
async function getPiper(){
 if(!piperPromise)piperPromise=(async()=>{let last;for(const url of PIPER_MODULE_URLS){try{const tts=await import(url);for(const [id,path] of Object.entries(PIPER_EXTRA_PATHS)){if(tts.PATH_MAP)tts.PATH_MAP[id]=path;}return tts;}catch(e){last=e;console.warn('Piper module load failed',url,e);}}throw last||new Error('Piper module unavailable');})();
 return piperPromise;
}
function withPiperModelSource(voiceId,work){
 const needsRewrite=voiceId==='lv_LV-aivars-medium';
 if(!needsRewrite)return work();
 const previous=window.fetch;
 const bound=previous.bind(window);
 window.fetch=(input,init)=>{
  const raw=typeof input==='string'?input:(input&&input.url)||'';
  if(raw.startsWith(PIPER_OLD_MODEL_BASE+'/lv/lv_LV/aivars/medium/')){
   const file=raw.split('/').pop();
   const url=PIPER_AIVARS_MODEL_BASE+'/'+file;
   if(typeof input==='string')return bound(url,init);
   try{return bound(new Request(url,input),init);}catch(_){return bound(url,init);}
  }
  return bound(input,init);
 };
 return Promise.resolve().then(work).finally(()=>{window.fetch=previous;});
}
function piperIdFor(langKey){const selected=selectedVoiceId(langKey);return (selected.startsWith('piper:')?selected:(PIPER_VOICES[langKey]||[])[0]?.id||'').replace(/^piper:/,'');}
async function refreshInstalledVoiceStatus(root){
 const status=$('[data-voice-status]',root),btn=$('[data-install-voice]',root);if(!status||!btn)return;
 const selected=selectedVoiceId(state.learn);
 if(selected.startsWith('azure:')){btn.hidden=true;status.textContent=tr('cloudVoice');try{const r=await fetch('./api/tts.php?status=1',{cache:'no-store'}),j=await r.json();status.textContent=j&&j.configured?'✓ '+tr('voiceActive'):tr('cloudNotConfigured');}catch(_){status.textContent=tr('cloudNotConfigured');}return;}
 if(selected.startsWith('system:')){btn.hidden=true;status.textContent=state.ui==='lv'?'Ierīces balss':'Device voice';return;}
 const id=piperIdFor(state.learn);if(!id){status.textContent='';btn.hidden=true;return;}btn.hidden=false;
 try{const tts=await getPiper();const stored=await tts.stored();const ready=stored.includes(id);status.textContent=ready?tr('voiceReady'):tr('voiceNotInstalled');btn.textContent=ready?'✓ '+tr('voiceReady'):'⬇ '+tr('installVoice');btn.disabled=ready;}catch(e){console.warn(e);status.textContent=tr('voiceNotInstalled');btn.disabled=false;}
}
async function installSelectedAppVoice(root){
 const btn=$('[data-install-voice]',root),status=$('[data-voice-status]',root),id=piperIdFor(state.learn);if(!id)return;
 if(btn)btn.disabled=true;if(status)status.textContent=tr('voiceDownloading')+'…';
 try{const tts=await getPiper();for(const [extraId,path] of Object.entries(PIPER_EXTRA_PATHS)){if(tts.PATH_MAP)tts.PATH_MAP[extraId]=path;}
  await withPiperModelSource(id,()=>tts.download(id,p=>{if(!status)return;const pct=p&&p.total?Math.min(100,Math.round(p.loaded*100/p.total)):0;status.textContent=tr('voiceDownloading')+(pct?' '+pct+'%':'…');}));
  if(status)status.textContent=tr('voiceReady');if(btn){btn.textContent='✓ '+tr('voiceReady');btn.disabled=true;}toast(tr('voiceReady'));
 }catch(e){console.error('Voice install failed',e);if(status)status.textContent=tr('voiceInstallFailed');if(btn)btn.disabled=false;toast(tr('voiceInstallFailed'));}
}
function stopTts(){if('speechSynthesis'in window)window.speechSynthesis.cancel();if(currentTtsAudio){try{currentTtsAudio.pause();URL.revokeObjectURL(currentTtsAudio.src);}catch(_){ }currentTtsAudio=null;}}
async function synthesizePiper(text,langKey,voiceId){
 const tts=await getPiper(),id=String(voiceId||selectedVoiceId(langKey)).replace(/^piper:/,'');
 for(const [extraId,path] of Object.entries(PIPER_EXTRA_PATHS)){if(tts.PATH_MAP)tts.PATH_MAP[extraId]=path;}
 // piper-tts-web keeps one global TtsSession and otherwise reuses the first
 // loaded ONNX model even after voiceId changes. Reset only when the selected
 // model changes so English and Latvian can never share the wrong session.
 if(activePiperVoiceId!==id){
  try{if(tts.TtsSession&&('_instance' in tts.TtsSession))tts.TtsSession._instance=null;}catch(e){console.warn('Could not reset Piper session',e);}
  activePiperVoiceId=id;
 }
 return withPiperModelSource(id,()=>tts.predict({text:String(text),voiceId:id}));
}
async function synthesizeAzure(text,voiceId,rate){
 const voice=String(voiceId||'').replace(/^azure:/,'');
 const res=await fetch('./api/tts.php',{method:'POST',headers:{'Content-Type':'application/json','Accept':'audio/mpeg,application/json'},body:JSON.stringify({text:String(text),voice,rate:Number(rate||1)})});
 if(!res.ok){let msg='Online voice unavailable';try{const j=await res.json();if(j&&j.error)msg=j.error;}catch(_){ }throw new Error(msg);}
 return res.blob();
}
async function synthesizeSelected(text,langKey=state.learn){
 const voiceId=selectedVoiceId(langKey),rate=Number(localStorage.getItem('lb_voice_rate')||0.92);
 if(voiceId.startsWith('azure:'))return synthesizeAzure(text,voiceId,rate);
 if(voiceId.startsWith('piper:'))return synthesizePiper(text,langKey,voiceId);
 if(voiceId.startsWith('system:'))throw new Error(tr('systemDownloadUnsupported'));
 const fallback=(PIPER_VOICES[langKey]||[])[0]?.id;if(!fallback)throw new Error('No downloadable voice');
 return synthesizePiper(text,langKey,fallback);
}
async function testSelectedVoice(root,btn){
 const status=$('[data-voice-status]',root),old=btn?.textContent;if(btn){btn.disabled=true;btn.textContent='… '+tr('voiceTesting');}if(status)status.textContent=tr('voiceTesting');
 const sample=state.learn==='lv'?'Labdien! Prieks iepazīties. Es palīdzu mācīties latviešu valodu.':'Hello! It is lovely to meet you. Let us practise British English together.';
 try{await speak(sample,state.learn,true);if(status)status.textContent='✓ '+tr('voiceActive');}
 catch(e){console.error(e);if(status)status.textContent=e.message||tr('audioFailed');toast(e.message||tr('audioFailed'));}
 finally{if(btn){btn.disabled=false;btn.textContent=old||('▶ '+tr('testVoice'));}}
}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1200);}
function safeAudioName(text,langKey){const stem=String(text||'practice').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').slice(0,48)||'practice';return `${langKey}-${stem}.wav`;}
async function downloadSpeech(text,langKey=state.learn){
 if(!text)return;toast(tr('audioPreparing'));
 try{const audio=await synthesizeSelected(text,langKey);const ext=String(audio.type||'').includes('mpeg')?'mp3':'wav';downloadBlob(audio,safeAudioName(text,langKey).replace(/\.wav$/,'.'+ext));toast(tr('audioReady'));}
 catch(e){console.error(e);toast(e.message||tr('audioFailed'));}
}
async function downloadChatAudio(){
 const rows=[];let n=1;
 state.history.forEach(m=>{if(m.role!=='assistant')return;if(m.reply)rows.push([`${String(n++).padStart(2,'0')}-coach.wav`,m.reply]);const improved=m.natural||m.corrected;if(improved)rows.push([`${String(n++).padStart(2,'0')}-improved.wav`,improved]);});
 if(!rows.length){toast(state.ui==='lv'?'Sarunā vēl nav audio materiāla.':'There is no training audio in the chat yet.');return;}
 toast(tr('audioPreparing'));
 try{const files={};for(const [name,text] of rows){const audio=await synthesizeSelected(text,state.learn),ext=String(audio.type||'').includes('mpeg')?'mp3':'wav',fileName=name.replace(/\.wav$/,'.'+ext);files[fileName]=new Uint8Array(await audio.arrayBuffer());}const {zipSync}=await import('https://esm.run/fflate@0.8.2');const zip=zipSync(files,{level:0});downloadBlob(new Blob([zip],{type:'application/zip'}),`language-bridge-${state.learn}-chat-audio.zip`);toast(tr('audioReady'));}
 catch(e){console.error(e);toast(e.message||tr('audioFailed'));}
}

function renderCoach(root){
 root.innerHTML=`<div class="page-head"><div><h1>${tr('coach')}</h1><p>${state.coachMode==='write'?tr('writingLead'):tr('speakingText')}</p></div><div class="mode-tabs"><button data-coachmode="speak" class="${state.coachMode==='speak'?'active':''}">🎙 ${tr('speakMode')}</button><button data-coachmode="write" class="${state.coachMode==='write'?'active':''}">✍️ ${tr('writeMode')}</button></div></div><section class="panel soft">${directionPanel()}</section><div id="coachBody"></div>`;
 bindDirection(root,()=>renderCoach(root));
 $$('[data-coachmode]',root).forEach(b=>b.onclick=()=>{state.coachMode=b.dataset.coachmode;save();renderCoach(root);});
 state.coachMode==='write'?renderWriteCoach($('#coachBody',root)):renderSpeakCoach($('#coachBody',root));
}

function aiPanel(){const webgpu=!!navigator.gpu;return `<div class="mini-card"><h3>🧠 ${tr('aiEngine')}</h3><div class="field"><select id="engine"><option value="light">${tr('practiceMode')}</option><option value="local">${tr('localMode')}</option></select></div><div id="engineStatus" class="status ${webgpu?'':'warn'}">${state.ai?tr('aiReady'):(webgpu?tr('firstModel'):tr('aiUnsupported'))}</div><div class="button-row"><button id="loadAI" class="btn secondary small" ${webgpu?'':'disabled'}>${state.ai?tr('aiReady'):tr('loadAi')}</button></div></div>`;}

function renderSpeakCoach(root){
 root.innerHTML=`<section class="panel"><div class="field"><label>${tr('scenario')}</label><div class="scenario-row">${Object.keys(scenarioSeeds).map(k=>`<button class="chip ${state.scenario===k?'active':''}" data-scenario="${k}">${tr(k)}</button>`).join('')}</div></div></section>
 <div class="coach-layout"><section class="panel"><div id="chat" class="chat"></div><div class="composer"><button id="micBtn" class="mic" title="${tr('speakMode')}">🎙</button><textarea id="message" placeholder="${tr('typeMessage')}"></textarea><button id="sendBtn" class="btn primary send">${tr('send')}</button></div><div class="button-row chat-tools"><button id="clearChat" class="btn ghost small">${tr('clear')}</button><button id="downloadChatAudio" class="btn ghost small">⬇ ${tr('downloadChatAudio')}</button><label class="hint" style="display:flex;align-items:center;gap:7px"><input id="speakReplies" type="checkbox" ${localStorage.getItem('lb_speak')!=='0'?'checked':''}> ${tr('speakReply')}</label></div><p class="engine-note">${tr('browserSpeechNote')}</p></section>
 <aside class="coach-side">${aiPanel()}<div class="mini-card"><h3>🔊 ${tr('voice')}</h3>${voiceControls()}</div><div class="mini-card"><h3>💡 ${state.ui==='lv'?'Kā tas darbojas':'How coaching works'}</h3><p>${state.ui==='lv'?'Pasaki domu saviem vārdiem. Treneris turpinās sarunu, bet zem atbildes parādīs svarīgāko labojumu un dabiskāku variantu.':'Say what you mean in your own words. The coach continues the conversation, then shows the most useful correction and a more natural version.'}</p></div></aside></div>`;
 $$('[data-scenario]',root).forEach(b=>b.onclick=()=>{state.scenario=b.dataset.scenario;renderSpeakCoach(root);});
 bindAIControls(root);bindVoiceControls(root);
 $('#sendBtn',root).onclick=()=>sendMessage(root);$('#message',root).onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage(root);}};
 $('#micBtn',root).onclick=()=>startRecognition({lang:langs[state.learn].code,button:$('#micBtn',root),onResult:list=>{$('#message',root).value=list[0]||'';sendMessage(root);}});
 $('#clearChat',root).onclick=()=>{state.history=[];renderChat(root);};$('#downloadChatAudio',root).onclick=downloadChatAudio;$('#speakReplies',root).onchange=e=>localStorage.setItem('lb_speak',e.target.checked?'1':'0');renderChat(root);
}
function bindAIControls(root){
 const engine=$('#engine',root);if(engine){engine.value=state.ai?'local':'light';engine.onchange=()=>{if(engine.value==='local'&&!state.ai){const s=$('#engineStatus',root);if(s)s.textContent=tr('firstModel');}};}
 const load=$('#loadAI',root);if(load)load.onclick=()=>loadAI(root);
}
function renderChat(root){
 const chat=$('#chat',root);if(!chat)return;const items=state.history.length?state.history:[{role:'assistant',reply:tr('welcomeTutor')}];
 chat.innerHTML=items.map(m=>{
  if(m.role==='user')return `<div class="bubble user"><div class="meta">${tr('you')}</div>${esc(m.content)}</div>`;
  const feedback=m.corrected?`<div class="coach-feedback"><div class="correction feedback-line"><b>${tr('corrected')}</b>${esc(m.corrected)}</div>${m.natural&&m.natural!==m.corrected?`<div class="natural feedback-line"><b>${tr('natural')}</b>${esc(m.natural)}</div>`:''}${m.explanation?`<div class="feedback-line"><b>${tr('why')}</b>${esc(m.explanation)}</div>`:''}<div class="audio-actions"><button class="btn small" data-say="${esc(m.natural||m.corrected)}">🔊 ${tr('listenBetter')}</button><button class="btn small ghost" data-download-say="${esc(m.natural||m.corrected)}">⬇ ${tr('downloadAudio')}</button></div></div>`:'';
  return `<div class="bubble assistant"><div class="meta">${tr('tutor')}</div>${esc(m.reply||m.content||'')}${feedback}</div>`;
 }).join('');
 $$('[data-say]',chat).forEach(b=>b.onclick=()=>speak(b.dataset.say,state.learn));$$('[data-download-say]',chat).forEach(b=>b.onclick=()=>downloadSpeech(b.dataset.downloadSay,state.learn));chat.scrollTop=chat.scrollHeight;
}

async function loadAI(root){
 if(state.ai||state.aiLoading)return;const status=$('#engineStatus',root),btn=$('#loadAI',root);if(!navigator.gpu){if(status)status.textContent=tr('aiUnsupported');return;}state.aiLoading=true;if(btn)btn.disabled=true;if(status){status.className='status';status.textContent=tr('aiLoading');}
 try{const webllm=await import('https://esm.run/@mlc-ai/web-llm');state.ai=await webllm.CreateMLCEngine(state.aiModel,{initProgressCallback:p=>{if(status)status.textContent=`${tr('aiLoading')} ${Math.round((p.progress||0)*100)}%`;}});if(status)status.textContent=tr('aiReady');if(btn){btn.textContent=tr('aiReady');btn.disabled=true;}const engine=$('#engine',root);if(engine)engine.value='local';toast(tr('aiReady'));}
 catch(e){console.error(e);if(status){status.className='status error';status.textContent=(state.ui==='lv'?'MI ielāde neizdevās: ':'AI load failed: ')+(e?.message||e);}if(btn)btn.disabled=false;}
 finally{state.aiLoading=false;}
}
function parseAIJson(raw){try{const cleaned=String(raw||'').replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();return JSON.parse(cleaned);}catch(_){return null;}}
function conversationSystem(){const target=langs[state.learn].label,native=langs[state.native].label;return `You are a warm ${target} language coach for a ${native} speaker at ${state.level}. Scenario: ${tr(state.scenario)}. Return ONLY valid JSON with keys reply, corrected, natural, explanation. reply: 1-2 short sentences in ${target}, ending with one simple conversational question. corrected: the learner's message corrected in ${target}; if already correct, repeat it. natural: a natural everyday alternative, not necessarily more formal. explanation: one short explanation in ${state.ui==='lv'?'Latvian':'English'} about the most useful mistake or improvement. Do not invent pronunciation judgments.`;}
function writingSystem(){const target=langs[state.learn].label,native=langs[state.native].label;return `You are a careful ${target} writing coach for a ${native} speaker at ${state.level}. Return ONLY valid JSON with keys corrected, natural, explanation. Preserve the intended meaning. corrected: grammatically correct version with minimal changes. natural: fluent everyday ${target}; explanation: concise explanation in ${state.ui==='lv'?'Latvian':'English'} mentioning the main grammar/word-choice changes. If the original is already excellent, corrected may equal original and explain that.`;}

function ruleCoach(text,lang=state.learn){
 let corrected=text.trim(), notes=[];
 if(lang==='en'){
  const rules=[
   [/\bi am agree\b/gi,'I agree','“Agree” is a verb, so use “I agree” without “am”.'],[/\bi'm agree\b/gi,'I agree','Use “I agree”, not “I’m agree”.'],[/\bpeople is\b/gi,'people are','“People” is plural, so use “are”.'],[/\bmuch people\b/gi,'many people','Use “many” with countable plural nouns such as “people”.'],[/\bmore better\b/gi,'better','“Better” is already comparative, so do not add “more”.'],[/\bdidn['’]?t went\b/gi,"didn't go",'After “didn’t”, use the base form of the verb.'],[/\bI goed\b/g,'I went','The past form of “go” is “went”.'],[/\bbuyed\b/gi,'bought','The past form of “buy” is “bought”.'],[/\bin Monday\b/gi,'on Monday','Use “on” with days of the week.'],[/\bat morning\b/gi,'in the morning','The usual phrase is “in the morning”.'],[/\bI have (\d{1,3}) years\b/gi,'I am $1 years old','English expresses age with “be”: “I am … years old”.']
  ];
  rules.forEach(([re,rep,n])=>{if(re.test(corrected)){re.lastIndex=0;corrected=corrected.replace(re,rep);notes.push(n);}});
  corrected=corrected.replace(/\s+([,.!?])/g,'$1');
  if(corrected&&/^[a-z]/.test(corrected))corrected=corrected[0].toUpperCase()+corrected.slice(1);
  if(corrected&&!/[.!?]$/.test(corrected)&&corrected.split(/\s+/).length>3)corrected+='.';
 }else{
  const rules=[
   [/^kāds tev šodien noskaņojums\??$/i,'Kāds tev šodien ir noskaņojums?','Pilnā, mācībām skaidrākā konstrukcijā lieto darbības vārdu “ir”. Ikdienā vēl dabiskāk bieži saka “Kā tu šodien jūties?”'],
   [/\bes ir\b/gi,'es esmu','Ar “es” darbības vārda “būt” tagadnes forma ir “esmu”.'],[/\btu ir\b/gi,'tu esi','Ar “tu” lieto “esi”.'],[/\bman es\b/gi,'man ir','Šeit vajadzīga konstrukcija “man ir”.'],[/\bes piekrītu ar tevi\b/gi,'es tev piekrītu','Ar “piekrist” latviešu valodā parasti lieto datīvu: “tev”.']
  ];
  rules.forEach(([re,rep,n])=>{if(re.test(corrected)){re.lastIndex=0;corrected=corrected.replace(re,rep);notes.push(n);}});
  if(corrected&&/^[a-zāčēģīķļņšūž]/.test(corrected))corrected=corrected[0].toUpperCase()+corrected.slice(1);
 }
 const natural=naturalise(corrected,lang);
 return {corrected,natural,explanation:notes[0]||(state.ui==='lv'?'Ātrais treneris neatrada acīmredzamu kļūdu. Lokālais MI var dot dziļāku stilistisku skaidrojumu.':'The fast coach found no obvious rule-based error. Local AI can give deeper style and grammar feedback.')};
}
function naturalise(text,lang){
 if(lang==='en'){
  return text.replace(/\bI would like to ask you\b/gi,"I'd like to ask you").replace(/\bI am going to\b/gi,"I'm going to").replace(/\bdo not\b/gi,"don't").replace(/\bcannot\b/gi,"can't");
 }
 return text.replace(/^Kāds tev šodien ir noskaņojums\?$/i,'Kā tu šodien jūties?').replace(/\bVai jūs varētu, lūdzu,\b/gi,'Vai jūs, lūdzu, varētu');
}
function lightConversation(text){const c=ruleCoach(text,state.learn), qs=scenarioSeeds[state.scenario][state.learn]||scenarioSeeds.daily[state.learn], reply=qs[Math.floor(Math.random()*qs.length)];return {reply,corrected:c.corrected,natural:c.natural,explanation:c.explanation};}
async function sendMessage(root){
 const box=$('#message',root),text=(box?.value||'').trim();if(!text)return;box.value='';state.history.push({role:'user',content:text});renderChat(root);const btn=$('#sendBtn',root);if(btn){btn.disabled=true;btn.textContent='…';}
 let result;
 try{
  const useLocal=$('#engine',root)?.value==='local'&&state.ai;
  if(useLocal){const messages=[{role:'system',content:conversationSystem()},...state.history.slice(-8).map(m=>({role:m.role==='assistant'?'assistant':'user',content:m.role==='assistant'?(m.reply||''):m.content}))];const res=await state.ai.chat.completions.create({messages,temperature:.45,max_tokens:260});result=parseAIJson(res?.choices?.[0]?.message?.content)||lightConversation(text);}else result=lightConversation(text);
 }catch(e){console.error(e);result=lightConversation(text);}finally{if(btn){btn.disabled=false;btn.textContent=tr('send');}}
 state.history.push({role:'assistant',...result});addXP(3);renderChat(root);if($('#speakReplies',root)?.checked)speak(result.reply,state.learn);
}

function renderWriteCoach(root){
 const history=JSON.parse(localStorage.getItem('lb_write_history')||'[]');
 root.innerHTML=`<div class="coach-layout"><section class="panel write-box"><div class="panel-title"><div><h2>${tr('writingTitle')}</h2><div class="hint">${tr('writingLead')}</div></div></div><textarea id="writingInput" placeholder="${tr('writingPlaceholder')}"></textarea><div class="button-row"><button id="improveWriting" class="btn primary">✦ ${tr('improve')}</button><button id="writeMic" class="btn">🎙 ${tr('speakMode')}</button></div><div id="writingResult"></div></section><aside class="coach-side">${aiPanel()}<div class="mini-card"><h3>🔊 ${tr('voice')}</h3>${voiceControls()}</div><div class="mini-card"><h3>🕘 ${tr('recent')}</h3><div id="writeHistory">${history.slice(0,4).map(h=>`<div class="history-item"><div class="smallcaps">${esc(h.date||'')}</div><div>${esc(h.original)}</div><div class="hint">→ ${esc(h.corrected)}</div></div>`).join('')||`<p class="hint">—</p>`}</div></div></aside></div>`;
 bindAIControls(root);bindVoiceControls(root);
 $('#improveWriting',root).onclick=()=>improveWriting(root);$('#writeMic',root).onclick=()=>startRecognition({lang:langs[state.learn].code,button:$('#writeMic',root),onResult:list=>{$('#writingInput',root).value=list[0]||'';}});
}
async function improveWriting(root){
 const input=$('#writingInput',root),text=(input?.value||'').trim();if(!text)return;const btn=$('#improveWriting',root);btn.disabled=true;btn.textContent='…';let result;
 try{const useLocal=$('#engine',root)?.value==='local'&&state.ai;if(useLocal){const res=await state.ai.chat.completions.create({messages:[{role:'system',content:writingSystem()},{role:'user',content:text}],temperature:.25,max_tokens:300});result=parseAIJson(res?.choices?.[0]?.message?.content)||ruleCoach(text,state.learn);}else result=ruleCoach(text,state.learn);}catch(e){console.error(e);result=ruleCoach(text,state.learn);}finally{btn.disabled=false;btn.textContent='✦ '+tr('improve');}
 const changed=normalize(result.corrected)!==normalize(text);$('#writingResult',root).innerHTML=`<div class="write-result"><div class="result-card"><div class="smallcaps">${tr('yourVersion')}</div><div class="result-text">${esc(text)}</div></div><div class="result-card corrected"><div class="smallcaps">${tr('corrected')}</div><div class="result-text">${esc(result.corrected)}</div></div><div class="result-card natural"><div class="smallcaps">${tr('natural')}</div><div class="result-text">${esc(result.natural||result.corrected)}</div></div><div class="result-card explain"><div class="smallcaps">${tr('why')}</div><div class="result-text" style="font-size:15px">${esc(changed?result.explanation:tr('noChange')+' '+result.explanation)}</div></div><div class="button-row"><button class="btn secondary" id="hearImproved">🔊 ${tr('listenBetter')}</button><button class="btn" id="downloadImproved">⬇ ${tr('downloadAudio')}</button><button class="btn" id="copyImproved">⧉ ${tr('copy')}</button><button class="btn" id="practiceImproved">🎙 ${tr('pron')}</button></div></div>`;
 $('#hearImproved',root).onclick=()=>speak(result.natural||result.corrected,state.learn);$('#downloadImproved',root).onclick=()=>downloadSpeech(result.natural||result.corrected,state.learn);$('#copyImproved',root).onclick=()=>navigator.clipboard?.writeText(result.natural||result.corrected).then(()=>toast(tr('copy'))).catch(()=>{});$('#practiceImproved',root).onclick=()=>{state.pronPhrase={lang:state.learn,text:result.natural||result.corrected,translation:''};navigate('pron');};
 saveWritingHistory(text,result.corrected);addXP(5);
}
function saveWritingHistory(original,corrected){const h=JSON.parse(localStorage.getItem('lb_write_history')||'[]');h.unshift({date:new Date().toLocaleDateString(),original,corrected});localStorage.setItem('lb_write_history',JSON.stringify(h.slice(0,12)));}

async function speak(text,langKey=state.learn,throwOnError=false){
 if(!text)return;stopTts();const voiceId=selectedVoiceId(langKey),rate=Number(localStorage.getItem('lb_voice_rate')||0.92);
 if(voiceId.startsWith('piper:')||voiceId.startsWith('azure:')){
  try{const blob=voiceId.startsWith('azure:')?await synthesizeAzure(text,voiceId,rate):await synthesizePiper(text,langKey,voiceId),url=URL.createObjectURL(blob),audio=new Audio(url);currentTtsAudio=audio;if(voiceId.startsWith('piper:')){audio.playbackRate=rate;try{audio.preservesPitch=true;audio.mozPreservesPitch=true;audio.webkitPreservesPitch=true;}catch(_){ }}audio.onended=()=>{if(currentTtsAudio===audio)currentTtsAudio=null;URL.revokeObjectURL(url);};await audio.play();return true;}catch(e){console.error(e);if(throwOnError)throw e;if(voiceId.startsWith('azure:')){toast(e.message||tr('cloudNotConfigured'));return false;}}
 }
 if('speechSynthesis'in window){refreshVoices();const raw=voiceId.startsWith('system:')?voiceId.slice(7):'';const allowed=systemVoices(langKey),v=allowed.find(x=>x.voiceURI===raw)||allowed[0];if(v){const u=new SpeechSynthesisUtterance(text);u.lang=langs[langKey].code;u.rate=rate;u.voice=v;window.speechSynthesis.speak(u);return true;}}
 const msg=langKey==='lv'?(state.ui==='lv'?'Latviešu lokālā balss nav gatava. Instalē Aivaru vai izvēlies konfigurētu Everita tiešsaistes balsi.':'The Latvian local voice is not ready. Install Aivars or choose the configured Everita online voice.'):(state.ui==='lv'?'Britu angļu balss nav pieejama.':'A British English voice is unavailable.');toast(msg);if(throwOnError)throw new Error(msg);return false;
}
function SpeechRecognitionCtor(){return window.SpeechRecognition||window.webkitSpeechRecognition||null;}
function startRecognition({lang,onResult,button}){
 const C=SpeechRecognitionCtor();if(!C){toast(state.ui==='lv'?'Šis pārlūks neatbalsta iebūvēto runas atpazīšanu.':'This browser does not expose built-in speech recognition.');return;}
 if(state.recognition){try{state.recognition.stop();}catch(_){ }state.recognition=null;return;}
 const r=new C();state.recognition=r;r.lang=lang;r.interimResults=false;r.maxAlternatives=5;r.continuous=false;if(button){button.classList.add('listening');button.dataset.old=button.textContent;button.textContent='■';}
 r.onresult=e=>{const alts=[...(e.results?.[0]||[])].map(x=>x.transcript).filter(Boolean);if(alts.length)onResult(alts,e.results[0]);};r.onerror=e=>toast((state.ui==='lv'?'Runas atpazīšanas kļūda: ':'Speech recognition error: ')+(e.error||'unknown'));r.onend=()=>{state.recognition=null;if(button){button.classList.remove('listening');button.textContent=button.dataset.old||'🎙';}};try{r.start();}catch(_){state.recognition=null;}
}
function normalize(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zāčēģīķļņšūž0-9\s']/gi,' ').replace(/\s+/g,' ').trim();}
function editSimilarity(a,b){a=normalize(a);b=normalize(b);if(!a&&!b)return 1;if(!a||!b)return 0;const m=a.length,n=b.length,d=Array.from({length:m+1},()=>Array(n+1).fill(0));for(let i=0;i<=m;i++)d[i][0]=i;for(let j=0;j<=n;j++)d[0][j]=j;for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return Math.max(0,1-d[m][n]/Math.max(m,n));}
function lcsDiff(target,heard){
 const tw=target.split(/\s+/),hw=heard.split(/\s+/),a=tw.map(normalize),b=hw.map(normalize),m=a.length,n=b.length,dp=Array.from({length:m+1},()=>Array(n+1).fill(0));for(let i=m-1;i>=0;i--)for(let j=n-1;j>=0;j--)dp[i][j]=a[i]===b[j]?1+dp[i+1][j+1]:Math.max(dp[i+1][j],dp[i][j+1]);let i=0,j=0,ok=new Set();while(i<m&&j<n){if(a[i]===b[j]){ok.add(i);i++;j++;}else if(dp[i+1][j]>=dp[i][j+1])i++;else j++;}return {tokens:tw.map((w,idx)=>({w,ok:ok.has(idx)})),missing:tw.filter((_,idx)=>!ok.has(idx))};
}

function renderPron(root){
 if(!state.pronPhrase||state.pronPhrase.lang!==state.learn){const p=phrases[state.learn][Math.floor(Math.random()*phrases[state.learn].length)];state.pronPhrase={lang:state.learn,text:p[0],translation:p[1]};}
 const p=state.pronPhrase;
 root.innerHTML=`<div class="page-head"><div><h1>${tr('pronTitle')}</h1><p>${tr('pronLead')}</p></div></div><section class="panel">${directionPanel()}${voiceControls()}</section><section class="panel phrase-card"><div class="smallcaps">${langs[state.learn].label}</div><div class="phrase-main">${esc(p.text)}</div>${p.translation?`<div class="phrase-translation">${esc(p.translation)}</div>`:''}<div class="button-row" style="justify-content:center"><button class="btn secondary" id="hearPhrase">🔊 ${tr('hear')}</button><button class="btn" id="downloadPhrase">⬇ ${tr('downloadAudio')}</button><button class="btn primary" id="recordPhrase">🎙 ${tr('record')}</button><button class="btn" id="newPhrase">↻ ${tr('newPhrase')}</button></div><div class="own-phrase"><input id="ownPhrase" placeholder="${tr('yourPhrase')}"><button id="useOwn" class="btn">${tr('usePhrase')}</button></div><div id="pronResult"></div></section>`;
 bindDirection(root,()=>renderPron(root));bindVoiceControls(root);$('#hearPhrase',root).onclick=()=>speak(p.text,state.learn);$('#downloadPhrase',root).onclick=()=>downloadSpeech(p.text,state.learn);$('#newPhrase',root).onclick=()=>{state.pronPhrase=null;renderPron(root);};$('#useOwn',root).onclick=()=>{const v=$('#ownPhrase',root).value.trim();if(v){state.pronPhrase={lang:state.learn,text:v,translation:''};renderPron(root);}};$('#recordPhrase',root).onclick=()=>startRecognition({lang:langs[state.learn].code,button:$('#recordPhrase',root),onResult:list=>showPronResult(root,list)});
}
function showPronResult(root,alternatives){
 const target=state.pronPhrase.text;let heard=alternatives[0]||'',best=-1;alternatives.forEach(a=>{const s=editSimilarity(target,a);if(s>best){best=s;heard=a;}});const score=Math.round(best*100),diff=lcsDiff(target,heard),msg=score>=88?tr('good'):score>=65?tr('okay'):tr('low');const focus=diff.missing.slice(0,5);
 $('#pronResult',root).innerHTML=`<div class="score-wrap"><div class="score-ring" style="--score:${score}%"><span>${score}%</span></div><div><div class="smallcaps">${tr('heard')}</div><div class="transcript">${esc(heard)}</div><div class="word-diff">${diff.tokens.map(t=>`<span class="word-token ${t.ok?'ok':'miss'}">${esc(t.w)}</span>`).join('')}</div><div class="feedback">${esc(msg)}</div>${focus.length?`<div class="focus-box" style="margin-top:10px"><div class="smallcaps">${tr('focus')}</div><strong>${esc(focus.join(' · '))}</strong><div class="button-row"><button class="btn small" id="hearFocus">🔊 ${tr('hear')}</button></div></div>`:''}</div></div><p class="hint" style="text-align:left">${state.ui==='lv'?'Rezultāts salīdzina runas atpazīto tekstu ar mērķa teikumu. Tas palīdz trenēties, bet nav laboratorisks akcenta vai fonēmu vērtējums.':'The score compares the speech-recognition transcript with the target. It is useful practice feedback, but not a laboratory accent or phoneme assessment.'}</p>`;
 if(focus.length)$('#hearFocus',root).onclick=()=>speak(focus.join(' '),state.learn);addXP(score>=65?3:1);
}

function renderDict(root){
 root.innerHTML=`<div class="page-head"><div><h1>${tr('dictTitle')}</h1><p>${tr('dictLead')}</p></div></div><section class="panel"><div class="search-row"><input id="wordSearch" placeholder="${tr('search')}" autocomplete="off"><select id="dictDir"><option value="both">EN ↔ LV</option><option value="en">EN → LV</option><option value="lv">LV → EN</option></select><button id="onlineLookup" class="btn secondary">🌐 ${tr('onlineLookup')}</button></div><div class="dictionary-meta"><span><strong>${state.words.length}</strong> ${tr('offlineCount')}</span><span>${state.ui==='lv'?'Tiešsaistes dati: Dictionary API + Tēzaurs':'Online data: Dictionary API + Tēzaurs'}</span></div><div id="wordList" class="dictionary-list"></div><div id="liveResult" class="live-result"></div></section>`;
 const input=$('#wordSearch',root);input.oninput=()=>drawWords(root,input.value);$('#dictDir',root).onchange=()=>drawWords(root,input.value);$('#onlineLookup',root).onclick=()=>lookupOnline(root,input.value.trim(),$('#dictDir',root).value);drawWords(root,'');
}
function drawWords(root,q){
 const nq=normalize(q),dir=$('#dictDir',root)?.value||'both';let list=state.words.filter(w=>{const en=normalize(w.en),lv=normalize(w.lv),hit=!nq||en.includes(nq)||lv.includes(nq);if(!hit)return false;if(dir==='en')return !nq||en.includes(nq);if(dir==='lv')return !nq||lv.includes(nq);return true;}).slice(0,nq?40:22);const out=$('#wordList',root);if(!list.length){out.innerHTML=`<p class="hint">${tr('noWords')}</p>`;return;}
 out.innerHTML=list.map(w=>`<article class="word-row"><div><h3>${esc(w.en)} <span class="tag">${esc(w.pos||'')}</span>${w.category?`<span class="tag">${esc(w.category)}</span>`:''}</h3><div class="translation">${esc(w.lv)}</div>${w.example_en?`<p>🇬🇧 ${esc(w.example_en)}</p>`:''}${w.example_lv?`<p>🇱🇻 ${esc(w.example_lv)}</p>`:''}</div><div class="button-row" style="margin:0;align-content:start"><button class="btn small" data-say-en="${esc(w.en)}">🔊 EN</button><button class="btn small" data-say-lv="${esc(w.lv)}">🔊 LV</button><a class="btn small" target="_blank" rel="noopener" href="https://tezaurs.lv/${encodeURIComponent(w.lv)}">${tr('external')} ↗</a></div></article>`).join('');
 $$('[data-say-en]',out).forEach(b=>b.onclick=()=>speak(b.dataset.sayEn,'en'));$$('[data-say-lv]',out).forEach(b=>b.onclick=()=>speak(b.dataset.sayLv,'lv'));
}
async function lookupOnline(root,q,dir){
 const out=$('#liveResult',root);if(!q||q.split(/\s+/).length>3){out.innerHTML=`<div class="status warn">${state.ui==='lv'?'Tiešsaistes meklēšanai ievadi vienu vārdu vai īsu frāzi.':'For online lookup, enter one word or a short phrase.'}</div>`;return;}out.innerHTML=`<div class="status">${state.ui==='lv'?'Meklē…':'Looking up…'}</div>`;
 let lang=dir==='lv'?'lv':dir==='en'?'en':guessLanguage(q);
 try{const res=await fetch(`api/lookup.php?lang=${encodeURIComponent(lang)}&q=${encodeURIComponent(q)}`);const data=await res.json();if(!res.ok||!data.ok)throw new Error(data.error||'Lookup failed');out.innerHTML=lang==='en'?renderEnglishLookup(data):renderLatvianLookup(data,q);$$('[data-live-say]',out).forEach(b=>b.onclick=()=>speak(b.dataset.liveSay,'en'));$$('[data-lv-live]',out).forEach(b=>b.onclick=()=>speak(b.dataset.lvLive,'lv'));}catch(e){console.error(e);out.innerHTML=`<div class="status error">${state.ui==='lv'?'Tiešsaistes dati pašlaik nav pieejami.':'Online details are unavailable right now.'} <a target="_blank" rel="noopener" href="https://tezaurs.lv/${encodeURIComponent(q)}">${tr('external')} ↗</a></div>`;}
}
function guessLanguage(q){return /[āčēģīķļņšūž]/i.test(q)?'lv':state.learn;}
function renderEnglishLookup(data){const entries=Array.isArray(data.data)?data.data:[],e=entries[0]||{},phon=e.phonetic||e.phonetics?.find(p=>p.text)?.text||'',means=(e.meanings||[]).slice(0,4);return `<div class="live-card"><div class="smallcaps">${tr('liveEnglish')}</div><h3>${esc(e.word||data.query||'')}</h3>${phon?`<div class="ipa">/${esc(phon.replace(/^\/+|\/+$/g,''))}/</div>`:''}<div class="button-row"><button class="btn small" data-live-say="${esc(e.word||data.query||'')}">🔊 English</button></div><h4>${tr('definitions')}</h4>${means.map(m=>`<div class="definition"><strong>${esc(m.partOfSpeech||'')}</strong>${(m.definitions||[]).slice(0,2).map(d=>`<p>${esc(d.definition||'')}</p>${d.example?`<p class="hint">“${esc(d.example)}”</p>`:''}`).join('')}</div>`).join('')||'<p class="hint">—</p>'}<p class="hint">${tr('source')}: dictionaryapi.dev</p></div>`;}
function renderLatvianLookup(data,q){
 const trans=extractStrings(data.transcriptions).slice(0,5),forms=extractForms(data.inflections).slice(0,30),wordInfo=extractStrings(data.words).slice(0,8);return `<div class="live-card"><div class="smallcaps">${tr('liveLatvian')}</div><h3>${esc(q)}</h3>${trans.length?`<div class="ipa">${esc(trans.join(' · '))}</div>`:''}${wordInfo.length?`<p class="hint">${esc(wordInfo.join(' · '))}</p>`:''}<div class="button-row"><button class="btn small" data-lv-live="${esc(q)}">🔊 Latviešu</button><a class="btn small" target="_blank" rel="noopener" href="https://tezaurs.lv/${encodeURIComponent(q)}">${tr('external')} ↗</a></div>${forms.length?`<h4>${tr('forms')}</h4><div class="forms">${forms.map(x=>`<span class="form-pill">${esc(x)}</span>`).join('')}</div>`:''}<p class="hint">${tr('source')}: Tēzaurs API</p></div>`;
}
function extractStrings(v){const out=[];const walk=x=>{if(x==null)return;if(typeof x==='string'&&x.length<100)out.push(x);else if(Array.isArray(x))x.forEach(walk);else if(typeof x==='object')Object.entries(x).forEach(([k,val])=>{if(['word','lemma','transcription','text','value','partOfSpeech'].includes(k)&&typeof val==='string')out.push(val);else if(typeof val==='object')walk(val);});};walk(v);return [...new Set(out)];}
function extractForms(v){const out=[];const walk=x=>{if(x==null)return;if(Array.isArray(x))x.forEach(walk);else if(typeof x==='object'){if(typeof x.wordForm==='string')out.push(x.wordForm);else if(typeof x.word==='string'&&Object.keys(x).some(k=>/case|number|tense|person/i.test(k)))out.push(x.word);Object.values(x).forEach(val=>{if(typeof val==='object')walk(val);});}};walk(v);if(!out.length)return extractStrings(v);return [...new Set(out)];}

function renderPractice(root){
 if(state.quizIndex>=quizzes.length)state.quizIndex=0;const q=quizzes[state.quizIndex];root.innerHTML=`<div class="page-head"><div><h1>${tr('grammarTitle')}</h1><p>${tr('grammarLead')}</p></div></div><section class="panel"><div class="stat-row"><span>${tr('score')}: <strong>${state.quizScore}</strong></span><span>${state.quizIndex+1}/${quizzes.length}</span><span>${q.lang==='en'?'English':'Latviešu'}</span></div><hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><div class="quiz-q">${esc(q.q)}</div><div class="answers">${q.a.map((a,i)=>`<button class="answer" data-answer="${i}">${esc(a)}</button>`).join('')}</div><div id="quizFeedback"></div><div class="button-row"><button id="nextQ" class="btn primary" disabled>${tr('next')}</button><button id="restartQ" class="btn">${tr('restart')}</button></div></section>`;state.quizAnswered=false;$$('[data-answer]',root).forEach(b=>b.onclick=()=>answerQuiz(root,q,Number(b.dataset.answer)));$('#nextQ',root).onclick=()=>{state.quizIndex=(state.quizIndex+1)%quizzes.length;renderPractice(root);};$('#restartQ',root).onclick=()=>{state.quizIndex=0;state.quizScore=0;localStorage.setItem('lb_quiz_score','0');renderPractice(root);};
}
function answerQuiz(root,q,i){if(state.quizAnswered)return;state.quizAnswered=true;const ok=i===q.ok;if(ok){state.quizScore++;addXP(2);}$$('[data-answer]',root).forEach((b,idx)=>{if(idx===q.ok)b.classList.add('correct');else if(idx===i&&!ok)b.classList.add('wrong');b.disabled=true;});$('#quizFeedback',root).innerHTML=`<div class="feedback"><strong>${ok?tr('correct'):tr('incorrect')}</strong><br>${esc(state.ui==='lv'?q.xl:q.x)}</div>`;$('#nextQ',root).disabled=false;localStorage.setItem('lb_quiz_score',String(state.quizScore));}

function renderGames(root){
 root.innerHTML=`<div class="page-head"><div><h1>${tr('gameTitle')}</h1><p>${tr('gameLead')}</p></div></div><section class="game-menu">${[['match','🧩','matchGame','matchText'],['builder','🧱','builderGame','builderText'],['listen','🎧','listenGame','listenText']].map(([m,e,t,d])=>`<button class="game-choice ${state.gameMode===m?'active':''}" data-gamemode="${m}"><span class="emoji">${e}</span><strong>${tr(t)}</strong><span>${tr(d)}</span></button>`).join('')}</section><div id="gameArea" style="margin-top:16px"></div>`;
 $$('[data-gamemode]',root).forEach(b=>b.onclick=()=>{state.gameMode=b.dataset.gamemode;state.game=null;state.builder=null;state.listeningGame=null;renderGames(root);});renderGameArea($('#gameArea',root));
}
function renderGameArea(root){if(state.gameMode==='builder')renderBuilder(root);else if(state.gameMode==='listen')renderListenGame(root);else renderMatch(root);}
function shuffle(a){const x=[...a];for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]];}return x;}
function newMatch(){const pool=shuffle(state.words).slice(0,6),cards=[];pool.forEach((w,i)=>{cards.push({id:`${i}a`,pair:i,text:w.en,lang:'en'},{id:`${i}b`,pair:i,text:w.lv,lang:'lv'});});state.game={cards:shuffle(cards),selected:[],matched:new Set(),moves:0,matches:0};}
function renderMatch(root){if(!state.game)newMatch();const g=state.game,best=Number(localStorage.getItem('lb_game_best')||0);root.innerHTML=`<section class="panel"><div class="panel-title"><div class="stat-row"><span>${tr('moves')}: <strong>${g.moves}</strong></span><span>${tr('matches')}: <strong>${g.matches}/6</strong></span><span>${tr('best')}: <strong>${best||'—'}</strong></span></div><button id="newGame" class="btn small">↻ ${tr('newGame')}</button></div><div class="game-board">${g.cards.map(c=>`<button class="card ${g.matched.has(c.id)?'matched':''} ${g.selected.includes(c.id)?'selected':''}" data-card="${c.id}"><span>${esc(c.text)}</span><small>${c.lang.toUpperCase()}</small></button>`).join('')}</div></section>`;$('#newGame',root).onclick=()=>{newMatch();renderMatch(root);};$$('[data-card]',root).forEach(b=>b.onclick=()=>pickCard(root,b.dataset.card));}
function pickCard(root,id){const g=state.game;if(g.matched.has(id)||g.selected.includes(id)||g.selected.length>=2)return;g.selected.push(id);renderMatch(root);if(g.selected.length===2){g.moves++;const [a,b]=g.selected.map(x=>g.cards.find(c=>c.id===x));if(a.pair===b.pair&&a.lang!==b.lang){g.matched.add(a.id);g.matched.add(b.id);g.matches++;g.selected=[];if(g.matches===6){const best=Number(localStorage.getItem('lb_game_best')||0);if(!best||g.moves<best)localStorage.setItem('lb_game_best',String(g.moves));addXP(8);toast(state.ui==='lv'?`Pabeigts ${g.moves} gājienos! +8 XP`:`Finished in ${g.moves} moves! +8 XP`);}renderMatch(root);}else setTimeout(()=>{g.selected=[];renderMatch(root);},650);}}
function newBuilder(){let p;do{p=phrases[state.learn][Math.floor(Math.random()*phrases[state.learn].length)];}while(p[0].split(/\s+/).length>11);const tokens=p[0].split(/\s+/).map((text,id)=>({text,id}));let shuffled=shuffle(tokens);if(shuffled.map(x=>x.id).join(',')===tokens.map(x=>x.id).join(','))shuffled=shuffle(tokens);state.builder={text:p[0],translation:p[1],available:shuffled,chosen:[],done:false};}
function renderBuilder(root){if(!state.builder)newBuilder();const g=state.builder;root.innerHTML=`<section class="panel"><div class="panel-title"><div><div class="smallcaps">${state.ui==='lv'?'Tulkojums':'Meaning'}</div><h3>${esc(g.translation)}</h3></div><button id="newBuilder" class="btn small">↻ ${tr('newGame')}</button></div><div class="builder-target">${g.chosen.map(t=>`<button class="builder-word" data-chosen="${t.id}">${esc(t.text)}</button>`).join('')||`<span class="hint">${state.ui==='lv'?'Klikšķini vārdus zemāk…':'Tap the words below…'}</span>`}</div><div class="builder-source">${g.available.map(t=>`<button class="builder-word" data-avail="${t.id}">${esc(t.text)}</button>`).join('')}</div><div class="button-row"><button id="checkBuilder" class="btn primary">${tr('check')}</button><button id="undoBuilder" class="btn">${tr('undo')}</button><button id="hearBuilder" class="btn secondary">🔊 ${tr('hear')}</button></div><div id="builderFeedback"></div></section>`;$('#newBuilder',root).onclick=()=>{newBuilder();renderBuilder(root);};$$('[data-avail]',root).forEach(b=>b.onclick=()=>{const i=g.available.findIndex(x=>String(x.id)===b.dataset.avail);g.chosen.push(g.available.splice(i,1)[0]);renderBuilder(root);});$$('[data-chosen]',root).forEach(b=>b.onclick=()=>{const i=g.chosen.findIndex(x=>String(x.id)===b.dataset.chosen);g.available.push(g.chosen.splice(i,1)[0]);renderBuilder(root);});$('#undoBuilder',root).onclick=()=>{if(g.chosen.length)g.available.push(g.chosen.pop());renderBuilder(root);};$('#hearBuilder',root).onclick=()=>speak(g.text,state.learn);$('#checkBuilder',root).onclick=()=>{const built=g.chosen.map(x=>x.text).join(' '),ok=normalize(built)===normalize(g.text);$('#builderFeedback',root).innerHTML=`<div class="feedback"><strong>${ok?tr('correct'):tr('incorrect')}</strong>${ok?'':`<br>${esc(g.text)}`}</div>`;if(ok&&!g.done){g.done=true;addXP(6);}};}
function newListening(){const list=phrases[state.learn],idx=Math.floor(Math.random()*list.length),p=list[idx],others=shuffle(list.filter((_,i)=>i!==idx)).slice(0,3).map(x=>x[1]);state.listeningGame={text:p[0],translation:p[1],options:shuffle([p[1],...others]),answered:false};}
function renderListenGame(root){if(!state.listeningGame)newListening();const g=state.listeningGame;root.innerHTML=`<section class="panel listen-question"><div class="smallcaps">${langs[state.learn].label}</div><h2>${state.ui==='lv'?'Noklausies un izvēlies pareizo nozīmi':'Listen and choose the correct meaning'}</h2><button id="playListen" class="listen-button">🔊</button><div class="listen-options">${g.options.map((o,i)=>`<button class="answer" data-listen="${i}">${esc(o)}</button>`).join('')}</div><div id="listenFeedback"></div><div class="button-row" style="justify-content:center"><button id="newListen" class="btn">↻ ${tr('newGame')}</button></div></section>`;$('#playListen',root).onclick=()=>speak(g.text,state.learn);$('#newListen',root).onclick=()=>{newListening();renderListenGame(root);setTimeout(()=>speak(state.listeningGame.text,state.learn),150);};$$('[data-listen]',root).forEach(b=>b.onclick=()=>{if(g.answered)return;g.answered=true;const chosen=g.options[Number(b.dataset.listen)],ok=chosen===g.translation;$$('[data-listen]',root).forEach(x=>{if(g.options[Number(x.dataset.listen)]===g.translation)x.classList.add('correct');else if(x===b&&!ok)x.classList.add('wrong');x.disabled=true;});$('#listenFeedback',root).innerHTML=`<div class="feedback"><strong>${ok?tr('correct'):tr('incorrect')}</strong><br>${esc(g.text)}</div>`;if(ok)addXP(5);});setTimeout(()=>speak(g.text,state.learn),220);}

function renderReader(root){root.innerHTML=`<div class="page-head"><div><h1>${tr('readerTitle')}</h1><p>${tr('readerLead')}</p></div></div><section class="panel"><div class="grid-2"><div><h2>${tr('reader')}</h2><p class="hint">PDF / DOCX / OCR / text-to-speech</p><div class="button-row"><a class="btn primary" href="reader/" target="_blank" rel="noopener">${tr('openReader')} ↗</a></div></div><div class="reader-feature"><strong>${state.ui==='lv'?'Ideja nākamajam solim':'Next integration idea'}</strong><span>${state.ui==='lv'?'Lasītājā iezīmē jebkuru vārdu un nosūti to uz vārdnīcu, rakstīšanas treneri vai izrunas treniņu.':'Select any word in the Reader and send it directly to the dictionary, writing coach or pronunciation practice.'}</span></div></div></section>`;}

function toast(msg){document.querySelector('.toast')?.remove();const el=document.createElement('div');el.className='toast';el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),3300);}
async function installApp(){if(state.installPrompt){state.installPrompt.prompt();try{await state.installPrompt.userChoice;}catch(_){ }state.installPrompt=null;}else toast(state.ui==='lv'?'Pārlūka izvēlnē izvēlies “Install app” / “Add to Home Screen”.':'Use your browser menu and choose “Install app” or “Add to Home Screen”.');}

async function init(){
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.installPrompt=e;});if('serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js').catch(console.warn);refreshVoices();if('speechSynthesis'in window)speechSynthesis.onvoiceschanged=refreshVoiceSelects;
 try{state.words=await fetch('./data/words.json').then(r=>r.json());}catch(e){console.warn(e);state.words=[];}render();
}
init();
})();
