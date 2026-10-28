# Releasing

1. `npm run setup -- --ci` passes on a clean clone.
2. `npm version <x.y.z> --no-git-tag-version`; update CHANGELOG.md.
3. Run the maintainer's private identifier scan over the repository and its history. Its term list never enters this repository, so it is a local gate, not a CI step.
4. Commit, then tag `v<x.y.z>` and push the tag. `release.yml` builds, tests and runs `npm pack`, and attaches the tarball and its SHA-256 to a GitHub release.
5. Consumers vendor the tarball (`vendor/blindpanel-<x.y.z>.tgz`, referenced as `file:vendor/…`) and record its tag, commit and SHA-256 next to it. A git dependency would run build scripts at install time and fails while a repository is private.
