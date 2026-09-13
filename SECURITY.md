# Security

## Reporting

Please report privately through [GitHub's report form](https://github.com/engmung/Patternflow/security/advisories/new) (Security → Report a vulnerability), or by direct message to the maintainer on [Discord](https://discord.gg/Vr9QtsxeTk). Do not open a public issue for something exploitable. You will get a reply within a few days; there is no bounty.

## What is in scope

- **The community site** ([community.patternflow.work](https://community.patternflow.work)): accounts and sessions, uploads, the sandboxed iframe that runs published patterns, moderation.
- **The browser flasher and update handoff** ([patternflow.work/flash](https://patternflow.work/flash), `/update`): the firmware images it serves and where they come from.
- **The build worker** that turns a pattern into a `.pfm` module on the community host.
- **Published firmware images.** They must not carry credentials. Three early releases did carry the maintainer's Wi-Fi credentials, which is why the release workflow now refuses an image built with `patternflow_secrets.h`. If you find one that slipped through, that is a report.

## What is a documented trust model, not a vulnerability

The device's HTTP server on the LAN has **no authentication**: anyone on the same network can call any `/api/*` route, including `POST /update`. This is deliberate and documented in [docs/rest-api.md](docs/rest-api.md#transport) — the panel is an instrument on a home or venue network, with the same posture as ArduinoOTA's default. `PF_WEBUPDATE_ALWAYS_ARMED 0` is the one lever that narrows it. Reports that amount to "the LAN API is open" will be closed with a pointer here; reports of a way to reach that API from *outside* the LAN, or from a web page on another origin, are in scope.

## Supported versions

Only the images currently on [the shelf](https://patternflow.work/editions) and in the flasher manifest are supported. Older images are on their release tags and are not patched. Each release lists the `sha256` of every image it attaches; verify a download against it before flashing.
