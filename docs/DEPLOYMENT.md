# Deployment

Two paths. The single file is the one most likely to actually reach users, so it
is the one to get right first.

---

## Path 1: the single file (primary)

```bash
npm ci
npm run build
```

Produces **`dist/ii-description-wizard.html`** - about 154 KB, one file, no
dependencies, no server, no internet.

### Distributing it

| Method             | Notes                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Email attachment   | Some gateways strip `.html`. Zip it, or use a share link.                                                             |
| Network share      | Users open it directly from the share. Works read-only.                                                               |
| SharePoint / Teams | Upload to a document library. SharePoint may render it in preview - tell people to use **Download** and open locally. |
| USB or local copy  | Works. It is one file.                                                                                                |

### Confirming it is genuinely self-contained

The build refuses to produce the file if anything external creeps in.
`scripts/inline.mjs` checks for external `<script src>` and `<link href>`, CSS
`@import` over http, `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`,
`sendBeacon`, and any absolute http URL in a string. Any hit fails the build.

To verify by hand:

1. Disconnect from the network.
2. Double-click `dist/ii-description-wizard.html`.
3. Complete a case and copy the output.

Everything works. The end-to-end suite asserts this too - it runs against this
exact file over `file://` and fails if a single network request is attempted.

### Clipboard from `file://`

The async clipboard API is unavailable in some browsers on `file://` origins. The
tool handles it: it falls back to `document.execCommand('copy')`, and if that is
also blocked it selects the text and tells the user to press Ctrl C. There is also
a **Download as .txt** button. No configuration needed.

### Updating people who have a copy

There is no auto-update - that would need a network request. The version is in the
footer of every screen. When you ship a new version, send the new file and tell
people the version number to look for.

---

## Path 2: GitHub Pages (secondary)

`.github/workflows/ci.yml` deploys on every push to `main`, but only after
typecheck, lint, unit tests, both builds, and the end-to-end suite all pass. A red
build does not deploy.

### One-time setup

1. **Settings → Pages → Source: GitHub Actions.**
2. Push to `main`.

The site publishes the standard build, and the single file is copied alongside it
at `/ii-description-wizard.html` so users can download their own offline copy
straight from the site.

### If Pages is not available

Internal hosting approval often lags. That is the whole reason the single file is
the primary path - the tool is fully usable with no hosting at all. Do not hold up
rollout waiting for Pages.

---

## Releasing

1. Update `CHANGELOG.md`.
2. Bump the version in **both** `package.json` and `src/config/index.ts`
   (`APP_VERSION`) - the second is what appears in the UI footer.
3. `npm run verify` - the full gate, in CI order.
4. Commit, tag `vX.Y.Z`, push the tag.
5. Attach `dist/ii-description-wizard.html` to the GitHub release.

CI also uploads the single file as a build artifact on every run, so you can grab
a build without releasing.

---

## Browser support

Built for **Chrome, Edge and Firefox, current and current minus two**, at an ES2020
target. This is an assumption pending confirmation - see the open questions in the
README.

To change the floor, edit `build.target` in `vite.config.ts` and re-run
`npm run verify`. Below roughly Chrome 88 or Firefox 85 you will also need to check
the CSS: `:has()` is used for option highlighting, and degrades to a missing
highlight rather than a broken layout.

The end-to-end suite runs on Chromium at desktop and tablet viewports. To add
Firefox or WebKit locally:

```bash
npx playwright install firefox webkit
```

then add projects to `playwright.config.ts`. On CI images that already ship a
Chromium build, set `PLAYWRIGHT_CHROMIUM_PATH` to it and Playwright will use it
rather than downloading another copy.

---

## Data and privacy in deployment

Nothing to configure, and nothing to host securely, because nothing leaves the
device:

- No analytics, no telemetry, no error reporting.
- Draft persistence is opt-in per session, stored only in that browser, cleared
  after 24 hours and by **Clear all data**.
- On shared kiosks, leave persistence off. It is off by default.

If someone asks what the tool sends anywhere: nothing. There is no network code in
it, and a test fails the build if any is added.
