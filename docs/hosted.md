# Hosting a study for invited raters

`docs/deploy.md` serves a public study: anyone with the link rates, and nothing about the rater is known. Some studies need a known panel instead: a fixed group of raters, each with their own link, each rated once, paid through a recruitment platform. This page is the recipe. It uses the kit's parts as they are; the host adds the gate, the consent and the completion step.

## What the kit gives the host

- `mountSession(el, study, { session, storage, end })` runs the rating and emits `complete` with the submission. It never fetches `reveal.json` and never shows results: those belong to `mountResults`, which the host does not mount. Given a `session`, it resumes saved progress only when that progress was saved for the same session, so a reload brings a participant back to their place and another participant in the same browser starts fresh.
- `end: { text, button }` replaces the end screen's "Next you'll see which model made each clip…" sentence and its "See where you land" button, and leaves out the offer to rate the remaining clips: the host decides what comes next.
- `derivedSession(key)` turns a key such as `<order seed>:<study id>:session:<participant>` into a fixed session id, so each participant's order exists before anyone rates and can be listed in a registration.
- `validateSubmission(study, body)` is the server's whole check: format, study, instrument, a v4 session, the order re-derived from the session, every answer in range. `parts.clips.repeats` adds attention repeats.

## What the host adds

1. **A gate on every path, media included.** A per-participant link (`/?r=<token>`) sets an HttpOnly, Secure, signed cookie and redirects, so the token leaves the address bar. Every later request, including each clip and still, needs the cookie; a missing or bad one gets 401. Missing configuration opens nothing (fail closed). `reveal.json` is never served.
2. **A consent page before the first clip:** what is recorded, where it goes, how long it is kept, that nothing is stored until the participant presses Send, and who to contact.
3. **One session id per participant and study**, from `derivedSession`; the page passes it to `mountSession`, and the server refuses any other session for that participant. A derived session is predictable from its key, so it is never a secret: the signed cookie is the credential.
4. **A submit endpoint** that validates with `validateSubmission`, stores one row per (study, participant) under a unique key, answers a repeated send as already stored, and releases a platform completion code only after the store has confirmed every part the participant was asked to do.
5. **No tally** (`modes.public.tally: false`), `noindex` on every page and header, no third-party scripts, and no platform participant id on the page, in the URL or in the store.
6. **Several studies in one sitting:** mount the next study after the previous one's answers are stored, with a break screen between them.

A reference host built this way serves StillDrawn's adherence studies (amendment A13 of its pre-registration) to paid raters.
