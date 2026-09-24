# Validation — 2026-09-24

- Source: user-provided XenRebirthTranslator v0.14.2beta EirCandyvaultFix Portable.
- Ported verified graph and measured exit points. Native click-through arrow UI is retained; the website sends destinations through an authenticated loopback API.
- Six automated Python tests pass: repeated observations, directed learned links, restart persistence, forgotten-area suppression, unstable coordinates, transport opt-in, title normalization, Host/Origin/token checks, CORS preflight and command validation.
- Real bundled Tesseract recognizes a synthetic Eir title and Essene exit. A bright closed-map fixture is rejected.
- The user's portable runtime successfully imports dependencies and starts/stops hidden Tk UI in the normal Windows environment. The restricted execution environment cannot initialize Tk; the same test passed outside that restriction without capturing the screen.
- Browser integration tests pass: connection code, destination sending, Japanese search, clear, disconnect handling, disabled controls and 1440px/390px layouts. Existing capture controls remain. No JavaScript page errors.
- The repository-wide static verifier already fails in the unmodified local baseline at class-archer.html -> glossary.html#symbol-of-wind. This change does not alter either page. New page IDs, assets and download link were separately checked.
- Not verified: a live Xen Rebirth session, actual resolution-specific capture bounds, exclusive fullscreen, or production-browser local-network permission prompts. This is labelled beta and requires in-game calibration.
- Unknown areas update this PC's atlas and the connected website view. They are not automatically published to the shared community database. Images stay local; exported JSON contains the collected connection information only.
