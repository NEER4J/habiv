# Ingest fixtures

Small bundles used by `jobs/` tests and by `scripts/dev/upload.mjs`.

- `single-html/index.html` — one-file AI-style reaction game that calls the bridge (`runStart`, `scoreSubmit`, `runEnd`).
- `generic-zip/` — vanilla canvas game with a `js/` folder and a stylesheet. Zip it with `cd fixtures/bundles/generic-zip && zip -r ../generic.zip .`.

Larger engine exports (Unity WebGL, Godot 4, Construct, Ren'Py, RPG Maker) are not committed. Export a
"Hello world" from each engine and drop the zip in this folder; every file here is git-ignored except the two above.
