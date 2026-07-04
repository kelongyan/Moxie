# Contributing to Moxie

Thanks for taking the time to contribute! 🎉

## Development setup

```bash
git clone https://github.com/kelongyan/Moxie.git
cd Moxie
npm install        # if Electron's binary download is blocked (e.g. in China):
                   #   ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
npm run dev        # hot-reload dev mode
```

See [`docs/development.md`](./docs/development.md) for the full build, packaging,
and architecture notes, and [`CLAUDE.md`](./CLAUDE.md) if you work with an AI agent.

## Before you open a pull request

- Run `npm run build` and make sure it bundles without errors (CI runs the same check).
- Keep changes focused; one logical change per PR.
- Match the surrounding code style (no linter is enforced — read the neighbours).
- If your change is user-facing, add a line under `## [Unreleased]` in [`CHANGELOG.md`](./CHANGELOG.md).

## Reporting bugs / requesting features

Use the issue templates. Include your OS, app version, and clear steps to reproduce.

## Commit messages

Write imperative, descriptive subjects (e.g. "Fix tab focus loss on rename").
There's no strict convention — clarity over ceremony.

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](./LICENSE).
