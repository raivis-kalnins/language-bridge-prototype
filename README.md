# Valodu Tilts / Language Bridge — prototype v0.1

A free, local-first English ↔ Latvian language-learning PWA built from the uploaded Book Reader project structure.

## What is included now

- English and Latvian interface switch.
- Learning direction: Latvian → English or English → Latvian.
- Conversation practice with:
  - light no-download tutor mode;
  - optional in-browser local AI using WebLLM and `Llama-3.2-1B-Instruct-q4f16_1-MLC`;
  - microphone input through the browser SpeechRecognition API when the browser exposes it;
  - text-to-speech replies through browser speech synthesis.
- Pronunciation trainer:
  - listen to a model phrase;
  - repeat by microphone;
  - compare the recognised transcript with the target phrase;
  - simple similarity score and feedback.
- Starter English–Latvian dictionary with example sentences and direct Tēzaurs links.
- Grammar quiz bank for both languages.
- English ↔ Latvian matching game with local best score.
- Existing uploaded Book Reader preserved under `/reader/` as a separate listening/reading module.
- Installable PWA shell and offline caching for the core app.

## Important limitation: “unlimited free AI”

No third-party cloud AI API can safely be promised as permanently free and unlimited. The sustainable no-per-message-cost option is local inference on the learner’s device.

The prototype therefore offers optional WebLLM local inference. On first use the selected model is a large download (roughly around 1 GB depending on the exact cached model files) and requires a browser/device with WebGPU support. After caching, inference can run without a server-side AI bill.

The light practice mode works without loading a large AI model and is useful on older phones.

## Pronunciation scoring

The current score compares the phrase that speech recognition transcribed with the target phrase. This is useful practice feedback, but it is not a true phoneme/accent score. A stronger next version should add local Whisper transcription and then phoneme/forced-alignment analysis where suitable models exist.

## Open resources suitable for the production version

- Tēzaurs open data / Latvian WordNet for Latvian lemmas, definitions, forms and lexical relationships.
- CLARIN-LV datasets where licensing fits the intended use.
- Piper Latvian voices (for example open Latvian voices such as Aivars/Rudolfs) for local Latvian TTS.
- Whisper/Transformers.js for local speech recognition in supported browsers.
- OPUS-MT English↔Latvian models for local/server-side open translation when needed.

Always preserve source attribution and comply with each dataset/model licence.

## Deploy

This build is intentionally simple and fits the same PHP hosting style as the Book Reader.

1. Upload the whole `language-bridge` directory to an HTTPS web directory.
2. Ensure `index.php` is served by PHP 8+ (the file uses only basic PHP).
3. Open the site once online so the PWA service worker can cache the shell.
4. Local AI is loaded from the WebLLM CDN/model hosting only after the user presses **Load local AI**.
5. The included `/reader/` module keeps its own original deployment/config requirements. Review `/reader/README.md` before enabling its account/admin features publicly.

## Recommended next development steps

1. Replace browser speech recognition with a true local Whisper mode (keep browser speech as fallback).
2. Reuse the Book Reader's Latvian natural/Piper TTS in the conversation and pronunciation screens.
3. Import a licensed offline subset of Tēzaurs/WordNet into IndexedDB for a much larger dictionary.
4. Add spaced repetition (SRS), daily streaks and learner-created word lists.
5. Add 10–20 game types: sentence ordering, missing word, listening choice, minimal pairs, declension/case drills, verb conjugation races and story branching.
6. Add structured CEFR course packs (A1–C1) authored/reviewed by Latvian and English teachers.
7. Add an optional server AI adapter only for devices that cannot run local AI, with strict monthly budget/quotas rather than claiming unlimited cloud usage.

## Files

- `index.php` — app shell
- `assets/app.js` — all learning UI and local-AI integration
- `assets/app.css` — responsive UI
- `data/words.json` — starter bilingual vocabulary
- `manifest.webmanifest` / `service-worker.js` — PWA
- `reader/` — original uploaded Book Reader project
