# Language Bridge v0.6.5

Story-opening hotfix for `language.63.lv`.

## Main fix

- Story cards no longer use the old `data-story` SPA handler.
- Every card has a normal fallback URL: `?view=stories&story=<id>#storyReader`.
- Normal left-click also opens the story immediately in-app, updates the URL, re-renders the reader, and scrolls/focuses the selected story.
- Ctrl/Cmd-click, Shift-click and middle-click keep normal browser link behaviour.
- Query-string story links are restored on reload and the page scrolls to the reader.
- Cache version bumped to `0.6.5` with new JS/CSS/service-worker filenames.

## Deploy

This package is intended to be extracted directly into the `language.63.lv` document root. Preserve `api/config.local.php` if you already configured Azure Speech.

After upload:
1. Open `/version.json` and confirm `0.6.5`.
2. Open `/repair.html` and run **Clear app cache & reload** once.
3. Open Stories and click a different story card. The reader should change and scroll into view.
