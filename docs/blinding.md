# What blinding covers, and what it can't

## Covered

Until the visitor presses "See where you land":
- **The page.** `study.json` holds opaque codes, media URLs, the wording and the seed. It holds no item ids, labels, metadata or reference-file keys (a compile test scans for them).
- **URLs and file names.** Local media are copied into the build as `media/<code>.<ext>`. Remote media should be uploaded under `<code>.<ext>`. `verify` scans every media URL for banned terms.
- **Requests.** The page asks for `study.json`, the media and nothing else. `reveal.json` (labels, metadata, the reference panel) is fetched only on completion; the e2e tests watch the network to prove it.
- **Response headers.** `verify --media` fetches each remote file and fails if a header names a model (custom object metadata, for example).
- **Shipped code.** `verify --dist` scans every built file (except `reveal.json`) and every file name for banned terms, secrets and outside URLs.

## Not covered

- **`reveal.json` itself.** It is a static file next to the page. The page never requests it before completion, but anyone who types its URL can read the labels. Blinding protects the honest path through the page. It does not hold a secret: the page has nothing to authenticate a visitor with.
- **Embedded provenance.** Byte-exact clips keep what their makers embedded. StillDrawn's Runway and MiniMax clips carry C2PA content credentials, and a visitor who downloads a clip and inspects it can read them. Re-encoding would strip them but would break the release's byte-identity (and its request not to re-encode), so the example keeps the bytes and says so.
- **Public releases.** If the clips are published elsewhere (StillDrawn's are, with a `mapping.json` from the release's own opaque codes to cells), a visitor can match bytes or frames. blindpanel's codes are seeded separately from the release's, so they do not match it directly.
- **This repository.** `study.yaml` maps every code to its item, as it must. Blinding is a property of the page, not a secret.
- **People.** Someone who has seen the clips before is not blind. v0.2 may add an optional "seen these already?" flag.

For a casual visitor, these limits change nothing. For a study whose result depends on blinding, use media that carry no provenance, or say what yours carry, as StillDrawn's example does.
