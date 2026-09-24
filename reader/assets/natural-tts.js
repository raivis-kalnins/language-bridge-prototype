/*
 * Natural on-device TTS adapter for Book Reader.
 * Runtime approach derived from the MIT-licensed Supertonic browser example.
 * Model weights are NOT bundled here. They are loaded from the configured
 * Supertonic 3 model repository and remain subject to the model's OpenRAIL-M licence.
 */

const SUPPORTED = new Set([
  'en','de','fr','es','ru','pl','lv','lt','et','da','sv','fi',
  'ar','bg','cs','el','hi','hr','hu','id','it','ja','ko','nl','pt','ro','sk','sl','tr','uk','vi'
]);

const DEFAULT_ORT_MODULE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.all.bundle.min.mjs';
const DEFAULT_ORT_WASM_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';

let ortPromise = null;
function loadOrt(moduleUrl, wasmBaseUrl) {
  if (!ortPromise) {
    ortPromise = import(moduleUrl || DEFAULT_ORT_MODULE).then(ort => {
      try {
        ort.env.wasm.wasmPaths = wasmBaseUrl || DEFAULT_ORT_WASM_BASE;
        ort.env.wasm.numThreads = (self.crossOriginIsolated && navigator.hardwareConcurrency > 2) ? Math.min(4, navigator.hardwareConcurrency) : 1;
      } catch (_) {}
      return ort;
    });
  }
  return ortPromise;
}

function normalizeBase(url) {
  return String(url || '').replace(/\/+$/, '');
}

function languageFamily(locale) {
  return String(locale || '').toLowerCase().split('-')[0];
}

function cleanForSpeech(text) {
  return String(text || '')
    .normalize('NFC')
    .replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/([A-ZĀČĒĢĪĶĻŅŠŪŽ])\s+([a-zāčēģīķļņšūž]{2,})/gu, '$1$2')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

// Speech-only Latvian normalization. This never changes the visible book text.
// Supertonic is character based, so expanding common abbreviations and removing
// editorial apostrophes helps it stay inside Latvian pronunciation patterns.
function latvianSpeechProfile(input) {
  let text = String(input || '').normalize('NFC');
  const replacements = [
    [/\bt\.\s*i\.(?=\s|$)/giu, 'tas ir'],
    [/\bpiem\.(?=\s|$)/giu, 'piemēram'],
    [/\bu\.\s*c\.(?=\s|$)/giu, 'un citi'],
    [/\bu\.\s*tml\.(?=\s|$)/giu, 'un tamlīdzīgi'],
    [/\bnr\.(?=\s|$)/giu, 'numurs'],
    [/€\s*(\d+(?:[.,]\d+)?)/g, '$1 eiro'],
    [/(\d+(?:[.,]\d+)?)\s*€/g, '$1 eiro'],
    [/€/g, ' eiro '],
    [/%/g, ' procenti ']
  ];
  for (const [pattern, value] of replacements) text = text.replace(pattern, value);

  // Folk texts and older print sources often use an apostrophe to mark a clipped
  // final sound (for example "tēv'" or "gredzen’"). Let the Latvian model read
  // the letters themselves instead of treating the apostrophe as English-like
  // punctuation/prosody.
  text = text.replace(/([A-Za-zĀČĒĢĪĶĻŅŠŪŽāčēģīķļņšūž])[’'](?=[\s,.;:!?])/gu, '$1');
  return text.replace(/[ \t]{2,}/g, ' ').trim();
}

function languageSpeechProfile(text, lang) {
  return lang === 'lv' ? latvianSpeechProfile(text) : text;
}

class UnicodeProcessor {
  constructor(indexer, ort) {
    this.indexer = indexer;
    this.ort = ort;
  }

  call(textList, langList) {
    const processedTexts = textList.map((text, i) => this.preprocessText(text, langList[i]));
    const lengths = processedTexts.map(t => [...t].length);
    const maxLen = Math.max(...lengths);
    const rows = processedTexts.map(text => {
      const row = new Array(maxLen).fill(0);
      const cps = [...text];
      for (let j = 0; j < cps.length; j++) {
        const cp = cps[j].codePointAt(0);
        row[j] = cp < this.indexer.length ? this.indexer[cp] : -1;
      }
      return row;
    });
    const mask = this.lengthToMask(lengths, maxLen);
    return { textIds: rows, textMask: mask };
  }

  preprocessText(input, lang) {
    let text = languageSpeechProfile(cleanForSpeech(input), lang).normalize('NFKD');
    text = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+/gu, '');
    const replacements = {
      '–':'-', '‑':'-', '—':'-', '_':' ', '“':'"', '”':'"', '‘':"'", '’':"'",
      '´':"'", '`':"'", '[':' ', ']':' ', '|':' ', '/':' ', '#':' ', '→':' ', '←':' '
    };
    for (const [from, to] of Object.entries(replacements)) text = text.split(from).join(to);
    text = text.replace(/[♥☆♡©\\]/g, '');
    text = text.replace(/\s+/g, ' ').trim();
    if (!/[.!?;:,'\"')\]}…。」』】〉》›»]$/.test(text)) text += '.';
    if (!SUPPORTED.has(lang)) throw new Error(`Natural voice does not support language “${lang}”.`);
    return `<${lang}>${text}</${lang}>`;
  }

  lengthToMask(lengths, maxLen) {
    return lengths.map(len => [Array.from({length:maxLen}, (_, i) => i < len ? 1.0 : 0.0)]);
  }
}

class Style {
  constructor(ttl, dp) { this.ttl = ttl; this.dp = dp; }
}

class TextToSpeech {
  constructor(cfgs, textProcessor, dpOrt, textEncOrt, vectorEstOrt, vocoderOrt, ort) {
    this.cfgs = cfgs;
    this.textProcessor = textProcessor;
    this.dpOrt = dpOrt;
    this.textEncOrt = textEncOrt;
    this.vectorEstOrt = vectorEstOrt;
    this.vocoderOrt = vocoderOrt;
    this.ort = ort;
    this.sampleRate = cfgs.ae.sample_rate;
  }

  async infer(textList, langList, style, totalStep, speed, progress) {
    const ort = this.ort;
    const bsz = textList.length;
    const { textIds, textMask } = this.textProcessor.call(textList, langList);
    const textIdsTensor = new ort.Tensor('int64', new BigInt64Array(textIds.flat().map(x => BigInt(x))), [bsz, textIds[0].length]);
    const textMaskTensor = new ort.Tensor('float32', new Float32Array(textMask.flat(2)), [bsz, 1, textMask[0][0].length]);

    const dpOutputs = await this.dpOrt.run({text_ids:textIdsTensor, style_dp:style.dp, text_mask:textMaskTensor});
    const duration = Array.from(dpOutputs.duration.data).map(v => v / speed);
    const textEncOutputs = await this.textEncOrt.run({text_ids:textIdsTensor, style_ttl:style.ttl, text_mask:textMaskTensor});
    const textEmb = textEncOutputs.text_emb;

    let { xt, latentMask } = this.sampleNoisyLatent(duration, this.sampleRate, this.cfgs.ae.base_chunk_size, this.cfgs.ttl.chunk_compress_factor, this.cfgs.ttl.latent_dim);
    const latentMaskTensor = new ort.Tensor('float32', new Float32Array(latentMask.flat(2)), [bsz, 1, latentMask[0][0].length]);
    const totalStepTensor = new ort.Tensor('float32', new Float32Array(bsz).fill(totalStep), [bsz]);

    for (let step = 0; step < totalStep; step++) {
      if (progress) progress(step + 1, totalStep);
      const currentStepTensor = new ort.Tensor('float32', new Float32Array(bsz).fill(step), [bsz]);
      const xtTensor = new ort.Tensor('float32', new Float32Array(xt.flat(2)), [bsz, xt[0].length, xt[0][0].length]);
      const out = await this.vectorEstOrt.run({
        noisy_latent:xtTensor, text_emb:textEmb, style_ttl:style.ttl,
        latent_mask:latentMaskTensor, text_mask:textMaskTensor,
        current_step:currentStepTensor, total_step:totalStepTensor
      });
      const denoised = Array.from(out.denoised_latent.data);
      const latentDim = xt[0].length, latentLen = xt[0][0].length;
      xt = [];
      let idx = 0;
      for (let b = 0; b < bsz; b++) {
        const batch = [];
        for (let d = 0; d < latentDim; d++) {
          const row = [];
          for (let t = 0; t < latentLen; t++) row.push(denoised[idx++]);
          batch.push(row);
        }
        xt.push(batch);
      }
    }

    const finalTensor = new ort.Tensor('float32', new Float32Array(xt.flat(2)), [bsz, xt[0].length, xt[0][0].length]);
    const vocoderOutputs = await this.vocoderOrt.run({latent:finalTensor});
    // Keep waveform data in a typed array. Converting long audio to a normal JS
    // array adds substantial memory pressure and makes it tempting to use spread
    // syntax later, which can overflow the browser call stack.
    const wavData = vocoderOutputs.wav_tts.data;
    const wav = wavData instanceof Float32Array ? wavData : Float32Array.from(wavData);
    return { wav, duration };
  }

  async call(text, lang, style, totalStep = 8, speed = 1.0, silenceDuration = 0.04, progress = null) {
    if (style.ttl.dims[0] !== 1) throw new Error('Natural voice expects one voice style at a time.');
    const chunks = chunkText(text, (lang === 'ko' || lang === 'ja') ? 120 : 300);
    const parts = [];
    const silenceSamples = Math.max(0, Math.floor(silenceDuration * this.sampleRate));
    let totalSamples = 0, durCat = 0;

    for (let i = 0; i < chunks.length; i++) {
      const result = await this.infer([chunks[i]], [lang], style, totalStep, speed, progress);
      const wav = result.wav instanceof Float32Array ? result.wav : Float32Array.from(result.wav);
      if (i > 0 && silenceSamples) {
        // Represent silence by its length; do not allocate a temporary array and
        // never spread hundreds of thousands of samples into Array.push().
        parts.push(null);
        totalSamples += silenceSamples;
        durCat += silenceDuration;
      }
      parts.push(wav);
      totalSamples += wav.length;
      durCat += result.duration[0];
    }

    // Allocate the final waveform once. This avoids both Maximum call stack size
    // errors and O(n^2) repeated copies when a reading passage has many chunks.
    const wavCat = new Float32Array(totalSamples);
    let offset = 0;
    for (const part of parts) {
      if (part === null) {
        offset += silenceSamples; // Float32Array is already zero-filled.
      } else {
        wavCat.set(part, offset);
        offset += part.length;
      }
    }
    return {wav:wavCat, duration:[durCat]};
  }

  sampleNoisyLatent(duration, sampleRate, baseChunkSize, chunkCompress, latentDim) {
    const bsz = duration.length;
    const wavLengths = duration.map(d => Math.floor(d * sampleRate));
    const maxDur = Math.max(...duration);
    const chunkSize = baseChunkSize * chunkCompress;
    const latentLen = Math.floor((Math.floor(maxDur * sampleRate) + chunkSize - 1) / chunkSize);
    const latentDimVal = latentDim * chunkCompress;
    const lengths = wavLengths.map(len => Math.floor((len + chunkSize - 1) / chunkSize));
    const latentMask = lengths.map(len => [Array.from({length:latentLen}, (_, i) => i < len ? 1.0 : 0.0)]);
    const xt = [];
    for (let b = 0; b < bsz; b++) {
      const batch = [];
      for (let d = 0; d < latentDimVal; d++) {
        const row = [];
        for (let t = 0; t < latentLen; t++) {
          const u1 = Math.max(0.0001, Math.random()), u2 = Math.random();
          row.push(Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * latentMask[b][0][t]);
        }
        batch.push(row);
      }
      xt.push(batch);
    }
    return {xt, latentMask};
  }
}

function chunkText(text, maxLen = 300) {
  const source = cleanForSpeech(text);
  if (!source) return [];
  const paragraphs = source.split(/\n\s*\n+/).filter(Boolean);
  const chunks = [];
  for (const paragraph of paragraphs) {
    const sentences = paragraph.trim().split(/(?<=[.!?])\s+/);
    let current = '';
    for (const sentence of sentences) {
      if (!current || current.length + sentence.length + 1 <= maxLen) current += (current ? ' ' : '') + sentence;
      else { chunks.push(current.trim()); current = sentence; }
    }
    if (current) chunks.push(current.trim());
  }
  return chunks.length ? chunks : [source.slice(0, maxLen)];
}

function writeWavFile(audioData, sampleRate) {
  const dataSize = audioData.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset, string) => { for (let i=0;i<string.length;i++) view.setUint8(offset+i,string.charCodeAt(i)); };
  writeString(0,'RIFF'); view.setUint32(4,36+dataSize,true); writeString(8,'WAVE'); writeString(12,'fmt ');
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,sampleRate,true);
  view.setUint32(28,sampleRate*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true); writeString(36,'data'); view.setUint32(40,dataSize,true);
  const ints = new Int16Array(audioData.length);
  for (let i=0;i<audioData.length;i++) ints[i] = Math.floor(Math.max(-1,Math.min(1,audioData[i])) * 32767);
  new Uint8Array(buffer,44).set(new Uint8Array(ints.buffer));
  return buffer;
}

async function fetchJson(url) {
  const response = await fetch(url, {mode:'cors', cache:'force-cache'});
  if (!response.ok) throw new Error(`Could not download natural voice asset (${response.status}).`);
  return response.json();
}

async function loadStyle(ort, baseUrl, styleId) {
  const raw = await fetchJson(`${baseUrl}/voice_styles/${styleId}.json`);
  const ttlData = new Float32Array(raw.style_ttl.data.flat(Infinity));
  const dpData = new Float32Array(raw.style_dp.data.flat(Infinity));
  return new Style(
    new ort.Tensor('float32', ttlData, raw.style_ttl.dims),
    new ort.Tensor('float32', dpData, raw.style_dp.dims)
  );
}

export function createNaturalTts(options = {}) {
  const baseUrl = normalizeBase(options.baseUrl);
  const moduleUrl = options.ortModuleUrl || DEFAULT_ORT_MODULE;
  const wasmBaseUrl = options.ortWasmBaseUrl || DEFAULT_ORT_WASM_BASE;
  const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};
  let enginePromise = null;
  let backend = '';
  const styles = new Map();

  async function loadEngine() {
    if (enginePromise) return enginePromise;
    enginePromise = (async () => {
      if (!baseUrl) throw new Error('Natural voice model URL is not configured.');
      const ort = await loadOrt(moduleUrl, wasmBaseUrl);
      const onnxDir = `${baseUrl}/onnx`;
      onStatus('Loading natural voice configuration…');
      const [cfgs, indexer] = await Promise.all([
        fetchJson(`${onnxDir}/tts.json`), fetchJson(`${onnxDir}/unicode_indexer.json`)
      ]);
      const paths = [
        ['duration model',`${onnxDir}/duration_predictor.onnx`],
        ['text model',`${onnxDir}/text_encoder.onnx`],
        ['voice model',`${onnxDir}/vector_estimator.onnx`],
        ['audio model',`${onnxDir}/vocoder.onnx`]
      ];

      const makeSessions = async executionProvider => {
        const sessions = [];
        for (let i=0;i<paths.length;i++) {
          onStatus(`Loading natural voice ${i+1}/${paths.length}: ${paths[i][0]}…`);
          sessions.push(await ort.InferenceSession.create(paths[i][1], {
            executionProviders:[executionProvider], graphOptimizationLevel:'all'
          }));
        }
        backend = executionProvider;
        return sessions;
      };

      let sessions;
      if (navigator.gpu) {
        try { sessions = await makeSessions('webgpu'); }
        catch (error) {
          console.warn('Natural voice WebGPU unavailable; using WebAssembly.', error);
          onStatus('WebGPU is unavailable here. Starting natural voice with WebAssembly…');
          sessions = await makeSessions('wasm');
        }
      } else sessions = await makeSessions('wasm');

      const processor = new UnicodeProcessor(indexer, ort);
      const [dp,textEnc,vectorEst,vocoder] = sessions;
      return {ort, tts:new TextToSpeech(cfgs, processor, dp, textEnc, vectorEst, vocoder, ort)};
    })().catch(error => { enginePromise = null; throw error; });
    return enginePromise;
  }

  async function getStyle(styleId) {
    const id = /^[FM][1-5]$/.test(styleId) ? styleId : 'F1';
    if (styles.has(id)) return styles.get(id);
    const engine = await loadEngine();
    onStatus(`Loading voice ${id}…`);
    const style = await loadStyle(engine.ort, baseUrl, id);
    styles.set(id, style);
    return style;
  }

  return {
    supports(locale) { return SUPPORTED.has(languageFamily(locale)); },
    languageCode(locale) { return languageFamily(locale); },
    backend() { return backend; },
    async prepare(styleId='F1') { await loadEngine(); await getStyle(styleId); return {backend}; },
    async synthesize({text, locale, styleId='F1', speed=1, steps=8, onProgress=null}) {
      const lang = languageFamily(locale);
      if (!SUPPORTED.has(lang)) throw new Error(`Natural voice is not available for ${locale}.`);
      const engine = await loadEngine();
      const style = await getStyle(styleId);
      const result = await engine.tts.call(cleanForSpeech(text), lang, style, steps, Math.max(.82, Math.min(1.35, Number(speed)||1)), .04, onProgress);
      const wavLen = Math.floor(engine.tts.sampleRate * result.duration[0]);
      const wav = result.wav.slice(0, wavLen);
      return new Blob([writeWavFile(wav, engine.tts.sampleRate)], {type:'audio/wav'});
    }
  };
}

export const NATURAL_TTS_LANGS = [...SUPPORTED];
