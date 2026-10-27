# Rebuild the proposal and diagrams

Run from the repository root. The authoritative text is `docs/proposal.md`; the PDF appends the full eleven Markdown records in `docs/adr`. The three PNG/SVG figures are rendered from their Mermaid sources. Original requirements PDFs stay unchanged.

## Runtime and dependencies

The verified build uses Codex's bundled runtime version `26.1015.12040`: Python with ReportLab, pypdf, pdfplumber and Pillow; Node with Playwright; bundled Poppler. Resolve the current paths with `load_workspace_dependencies`. No project npm dependencies are added or changed.

Set `ARTIFACT_PYTHON` and `ARTIFACT_NODE` to the returned executables, and `ARTIFACT_NODE_MODULES` to the returned Node package directory. Set `ARTIFACT_CHROMIUM` to an installed headless Chromium executable compatible with Playwright, or omit it if Playwright's expected browser is installed. This build used the existing `chromium_headless_shell-1223` executable because the runtime's default browser path was absent. It starts a separate headless process and does not touch an interactive browser profile.

Set `PDF_FONT_DIR` if needed. The current macOS build defaults to `/System/Library/Fonts/Supplemental` and uses Arial.ttf, Arial Bold.ttf, Arial Italic.ttf and Courier New.ttf. Other environments need those font filenames in the chosen directory, or an intentional font mapping change in the exporter.

## Commands

```bash
"$ARTIFACT_PYTHON" docs/build/fetch-mermaid.py /private/tmp/chula-proposal/mermaid.min.js
export MERMAID_BUNDLE=/private/tmp/chula-proposal/mermaid.min.js
"$ARTIFACT_NODE" docs/build/render-diagrams.mjs
"$ARTIFACT_PYTHON" docs/build/export-proposal.py
```

Only the initial pinned Mermaid 11.12.0 package fetch needs internet access. It writes a temporary bundle, not node_modules or the lockfile. Browser launch may need host execution permissions in a sandbox. Do not install a different browser into the application repository to fix a missing artifact runtime path.

Final PDF is `docs/proposal.pdf`. The exporter uses A4 for narrative/ADR pages, A3 landscape for wide figures/NFR matrices and A3 portrait for the sequence diagram. This preserves readable labels rather than shrinking every diagram to A4. PDF bookmarks navigate sections and full ADRs; reference URLs are active links. The Markdown links preserve access to local requirements/evidence alongside the PDF.

## Verify before delivery

Render every page with the Poppler binary from the workspace dependency bundle:

```bash
mkdir -p output/pdf/qa
"$ARTIFACT_PDFTOPPM" -scale-to 1800 -png docs/proposal.pdf output/pdf/qa/final
```

Inspect every final page at readable size, including labels and tables; a thumbnail contact sheet alone is insufficient. Run `git diff --check`, check local Markdown links, compare the measured values to the evidence JSON, and verify that source PDFs match the supplied snapshots. `output/pdf/qa/build.json` records source/PDF hashes and page sizes; `diagram-render.json` records successful rendering. These QA intermediates are ignored by Git. The retained review summary is `docs/build/verification.json`.

The exporter checks required content and creates a PDF with embedded fonts. It does not rerun application tests or change benchmark evidence. The latest recorded overall NFR suite remains FAIL for the stopped-Ticket HTTP classification; rebuilding the report cannot turn that result into PASS.
