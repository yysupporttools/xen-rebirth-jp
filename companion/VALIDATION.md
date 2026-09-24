# Validation — 2026-09-24

- Title contamination fix: verified both locally collected real Arcarinas Square images now resolve to Arcarinas Square. Route to Alicia Forest begins through Brynhilld Trisects, with the measured south exit available. Added a synthetic title/adjacent Guild Plaza regression and migration test. Existing polluted atlas names merge on next startup with a backup. Real user images are not included in the repository or ZIP.

- Launcher fix: removed the PowerShell script dependency after a Restricted execution-policy failure. The native batch launcher discovers a sibling portable runtime or accepts a dragged portable directory. Executed the installed desktop batch with the diagnostic switch; portable imports and OCR path passed without changing execution policy or opening/capturing the game.

- Source: user-provided XenRebirthTranslator v0.14.2beta EirCandyvaultFix Portable.
- Ported verified graph and measured exit points. Native click-through arrow UI is retained; the website sends destinations through an authenticated loopback API.
- Six automated Python tests pass: repeated observations, directed learned links, restart persistence, forgotten-area suppression, unstable coordinates, transport opt-in, title normalization, Host/Origin/token checks, CORS preflight and command validation.
- Real bundled Tesseract recognizes a synthetic Eir title and Essene exit. A bright closed-map fixture is rejected.
- The user's portable runtime successfully imports dependencies and starts/stops hidden Tk UI in the normal Windows environment. The restricted execution environment cannot initialize Tk; the same test passed outside that restriction without capturing the screen.
- Browser integration tests pass: connection code, destination sending, Japanese search, clear, disconnect handling, disabled controls and 1440px/390px layouts. Existing capture controls remain. No JavaScript page errors.
- The repository-wide static verifier already fails in the unmodified local baseline at class-archer.html -> glossary.html#symbol-of-wind. This change does not alter either page. New page IDs, assets and download link were separately checked.
- Not verified: a live Xen Rebirth session, actual resolution-specific capture bounds, exclusive fullscreen, or production-browser local-network permission prompts. This is labelled beta and requires in-game calibration.
- Unknown areas update this PC's atlas and the connected website view. They are not automatically published to the shared community database. Images stay local; exported JSON contains the collected connection information only.
