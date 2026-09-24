# Valodu Tilts / Language Bridge — v0.4.2

Deployable PHP/PWA build prepared for `https://language.63.lv/`.

## Main features

### Language Coach
- One Coach area with **Speak** and **Write** modes.
- Speaking mode accepts keyboard or microphone input.
- Every response can show:
  - learner's corrected sentence;
  - a more natural alternative;
  - a short explanation;
  - a button to hear the improved sentence.
- Fast free rule-based coaching works without downloading AI.
- Optional WebLLM local AI provides deeper corrections and conversation on WebGPU-capable devices with no per-message API fee after the model is downloaded.
- Voice selector and speech-rate control use installed/browser speech-synthesis voices.

### Writing Coach
- Learner writes a sentence or short paragraph as they think it should be written.
- Result shows **Corrected**, **More natural**, and **Why**.
- Improved text can be copied, heard aloud, or sent directly to Pronunciation practice.
- Recent corrections stay in local browser storage.

### Pronunciation Coach
- Larger phrase set and custom learner-entered phrases.
- Up to five browser speech-recognition alternatives are compared; the closest transcript is used.
- Target words are highlighted as matched/missed.
- Difficult/missed words can be replayed separately.
- This remains a speech-recognition practice score, not a laboratory phoneme/accent score.

### Dictionary
- Offline EN↔LV starter lexicon expanded from 78 to **386 entries**.
- Category and part-of-speech chips.
- Speech buttons for both languages.
- Server-side keyless online lookup endpoint:
  - English: `dictionaryapi.dev` definitions/phonetics/examples.
  - Latvian: Tēzaurs API word/morphology/transcription data when available.
- Direct Tēzaurs link remains available for every local result.

### Games
- **Match pairs** memory game.
- **Build a sentence** word-order game.
- **Listen & choose** audio comprehension game.
- Local daily XP is awarded for practice and successful rounds.

### Responsive / mobile UI update
- Tablet and mobile navigation now uses a proper hamburger menu instead of a horizontally scrolling nav bar.
- The install action is moved into the mobile menu so the header stays compact.
- Select controls now have consistent custom styling, larger touch targets and a clear chevron.
- Speech-rate sliders now use a custom track/thumb plus a compact numeric value.
- Voice selectors are constrained inside their cards so long system voice names cannot overflow the layout.
- Coach, pronunciation, dictionary and writing inputs are normalized to mobile-friendly 48px touch targets.
- Mobile text inputs use 16px text to avoid unwanted iOS zoom.
- Grids collapse cleanly at phone/tablet breakpoints and the page prevents accidental horizontal overflow.
- Existing card-based visual hierarchy, coach cards, progress display and feedback states are preserved.

## Deployment

1. Back up the existing `language.63.lv` web root.
2. Upload the contents of this directory over the current Language Bridge installation.
3. Keep the included `/reader/` directory if you want the original Book Reader module.
4. PHP needs outbound HTTPS access for `api/lookup.php` to provide live dictionary details. If outbound requests are disabled, the offline dictionary and direct Tēzaurs links still work.
5. Open the site once and hard-refresh. The service worker cache name changed to `language-bridge-v0.4.0`, so the old core cache will be replaced.

## Free/local AI note

No third-party cloud AI service should be described as permanently free and unlimited. This build therefore keeps AI optional and local-first. The fast coach requires no AI model. Local AI uses WebLLM and runs in the browser on supported WebGPU devices after a large initial model download.

## Files changed/added

- `index.php`
- `assets/app.css`
- `assets/app.js`
- `data/words.json`
- `api/lookup.php` (new)
- `manifest.webmanifest`
- `service-worker.js`
- `README.md`

The original `/reader/` module is preserved.

## Validation performed

- JavaScript syntax checked with Node, plus a lightweight runtime smoke test across Home, Coach, Pronunciation, Dictionary, Grammar, Games and Reader views.
- All PHP files linted with PHP CLI.
- CSS parsed with `tinycss2` with zero parse errors.
- `manifest.webmanifest` and `data/words.json` parsed as valid JSON.
- Responsive rules were reviewed against the supplied phone/tablet/desktop screenshots, including the previously overflowing voice selector and horizontal mobile navigation.

A managed Chromium policy in the build environment blocks local/private web addresses, so a full interactive browser screenshot of this local package could not be produced here. The live deployment should still be checked on at least one iPhone/Safari and one Android/Chrome device after upload.

## v0.4 voice/pronunciation fix

This build removes the unsafe voice fallback that could read Latvian text with an English/German/etc. system voice.

- Latvian defaults to the local Piper `lv_LV-aivars-medium` neural voice.
- English is restricted to British English (`en-GB`) only. The local fallback is Piper `en_GB-alan-medium` (plus an optional Southern English female Piper voice).
- Device voices are shown only when their locale matches `lv-LV` or `en-GB`; unrelated system voices are never offered.
- Browser voices that arrive asynchronously now refresh the visible selector.
- Pronunciation training and the listening game use the same target-language TTS path, so Latvian exercises no longer fall back to an English voice.
- Corrected/improved phrases can be downloaded as WAV audio.
- The Coach can export all tutor/improved audio in the current chat as a ZIP of WAV files. This uses local Piper synthesis because the browser SpeechSynthesis API does not expose its audio stream for reliable file export.
- First use of each Piper neural voice downloads roughly a model-sized asset and caches it in browser storage. Network access is therefore needed for the first synthesis with that voice.

Note: WAV is used for downloadable speech because Piper produces WAV directly. MP4 is primarily a video container; adding M4A/MP3 conversion would require a separate encoder layer and is intentionally not faked in this build.


## v0.4.1 Latvian Aivars hotfix

The previous v0.4 UI listed Aivars, but the browser Piper wrapper used an older static `PATH_MAP` and model mirror created before Latvian Aivars was added upstream. v0.4.1 explicitly registers `lv_LV-aivars-medium` and routes that model/config download to the pinned Rhasspy Piper voices v1.0.0 repository.

The Voice panel has an **Install voice** button and shows download/readiness status. Aivars is an application voice, not a Windows/Chrome-installed voice. The first install is roughly 64 MB for the ONNX model plus Piper runtime assets; after that the browser caches the files locally. British English remains restricted to `en-GB` voices/app voices.

## v0.4.2 voice switching + female voice update

This hotfix addresses a second voice bug discovered after Aivars successfully downloaded on Windows 11/Chrome but the spoken output could still use the wrong neural model.

### Piper model switching fix

`@mintplex-labs/piper-tts-web` keeps one global `TtsSession`. Reusing that singleton after changing `voiceId` can keep the first ONNX model loaded in memory. v0.4.2 resets that session **only when the selected Piper model changes**, so Latvian Aivars and British English cannot share a stale inference session.

The Aivars downloader is also pinned directly to the public `RaivisDejus/Piper-lv_LV-Aivars-medium` model repository instead of relying on an older aggregate Piper mirror.

The Voice panel now includes **Test selected voice**. “Local voice installed” means the model files exist in browser storage; the test button actually synthesizes a target-language sample and then shows **Selected voice is working** if playback succeeds.

### Female voices

- **British English local female:** `en_GB-southern_english_female-low` is now mapped correctly. v0.4.1 accidentally used a non-existent `-medium` ID.
- **Latvian female online:** `lv-LV-EveritaNeural` is available as an optional Microsoft Azure Speech voice.
- **British English female online:** `en-GB-SoniaNeural` is also available when the same Azure endpoint is configured.
- Local/device `lv-LV` or `en-GB` voices exposed by the operating system continue to appear automatically.

The Azure choices are optional. They are not described as unlimited/free local voices and are disabled at the server level until credentials are configured.

### Optional Azure Speech configuration

The browser never receives the Azure Speech key. `api/tts.php` performs TTS server-side.

1. Copy `api/config.local.php.example` to `api/config.local.php`.
2. Add your Azure Speech key and region, for example `uksouth`.
3. Keep `config.local.php` out of source control/backups that are made public.
4. Reload the app and choose **Everita · Latvian · female · online** or **Sonia · British English · female · online**.
5. Press **Test selected voice**.

Instead of a PHP config file, the endpoint also accepts server environment variables `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`.

### Audio downloads

Local Piper voices still export WAV. Azure voices export MP3. Chat audio ZIPs preserve the format produced by the selected voice. Windows/Chrome system voices are playable but cannot be reliably captured by the Web Speech API, so the app now tells the learner to select a local app voice or configured online voice before downloading audio rather than silently exporting a different voice.
