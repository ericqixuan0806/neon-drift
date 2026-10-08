# Neon Drift

A single-file Canvas arcade game for modern browsers.

**Play:** https://ericqixuan0806.github.io/neon-drift/

Open `index.html` in a browser. It redirects to [`neon-drift.html`](./neon-drift.html), the standalone game source. No build step is required.

The menu ship button cycles through five core colorways (Classic, Ember, Mint, Violet, and Gold). Rose, Ice, and Lime remain achievement unlocks.

Progress and settings are stored in browser local storage. Saves are versioned and validated; supported legacy saves migrate automatically. Invalid or newer-version data is preserved in read-only recovery mode, and the Settings screen can export a recovery file. Daily challenges and login streaks use UTC dates.

Run the dependency-free syntax, save, and state regression checks with Node.js:

```sh
node --test tests/save-state.test.cjs
```
