// Pinned Mermaid bundle and bundled Playwright; no project dependency changes.
// Run from the repo root after following docs/build/README.md.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runtime = process.env.ARTIFACT_NODE_MODULES;
if (!runtime || !process.env.MERMAID_BUNDLE) throw new Error('Set ARTIFACT_NODE_MODULES and MERMAID_BUNDLE; see docs/build/README.md');
const require = createRequire(path.join(runtime, 'package.json'));
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.ARTIFACT_CHROMIUM && { executablePath: process.env.ARTIFACT_CHROMIUM }) });
const output = path.join(root, 'docs/diagrams');
const manifest = [];
try {
  const page = await browser.newPage({ viewport: { width: 1900, height: 1500 }, deviceScaleFactor: 2 });
  await page.setContent('<html><head><style>body{margin:0;background:white;font-family:Arial}#diagram{display:inline-block;padding:20px;background:white}svg{max-width:none!important;height:auto}</style></head><body><div id="diagram"></div></body></html>');
  await page.addScriptTag({ path: process.env.MERMAID_BUNDLE });
  for (const name of ['architecture', 'deployment', 'assign-ticket-sequence']) {
    const source = readFileSync(path.join(output, `${name}.mmd`), 'utf8');
    const result = await page.evaluate(async ({ source, name }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'base',
        themeVariables: { fontFamily: 'Arial, sans-serif', fontSize: '21px', primaryColor: '#e8f2ff', primaryBorderColor: '#2463a0', primaryTextColor: '#10243a', lineColor: '#52677b', secondaryColor: '#fff6db', tertiaryColor: '#f6f8fa', actorBkg: '#e8f2ff', actorBorder: '#2463a0', actorTextColor: '#10243a', noteBkgColor: '#fff6db', noteTextColor: '#513a12' },
        flowchart: { htmlLabels: true, useMaxWidth: false, nodeSpacing: 28, rankSpacing: 45, curve: 'linear', padding: 15, subGraphTitleMargin: { top: 12, bottom: 20 } },
        sequence: { useMaxWidth: false, actorFontSize: 21, messageFontSize: 20, noteFontSize: 18, width: 130, actorMargin: 35, diagramMarginX: 18, diagramMarginY: 12, wrap: true, messageMargin: 24, boxMargin: 10 },
      });
      const { svg } = await mermaid.render(`render-${name}`, source);
      document.querySelector('#diagram').innerHTML = svg;
      await document.fonts.ready;
      const element = document.querySelector('#diagram svg');
      const bounds = element.viewBox.baseVal;
      element.style.width = `${bounds.width}px`;
      element.style.height = `${bounds.height}px`;
      return { svg: element.outerHTML, width: bounds.width, height: bounds.height };
    }, { source, name });
    writeFileSync(path.join(output, `${name}.svg`), result.svg);
    await page.locator('#diagram').screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
    manifest.push({ name, source: `${name}.mmd`, svg: `${name}.svg`, png: `${name}.png`, width: result.width, height: result.height, renderStatus: 'PASS' });
    console.log(`${name}: ${result.width} x ${result.height}`);
  }
  mkdirSync(path.join(root, 'output/pdf/qa'), { recursive: true });
  writeFileSync(path.join(root, 'output/pdf/qa/diagram-render.json'), JSON.stringify({ mermaidVersion: '11.12.0', renderedAt: new Date().toISOString(), diagrams: manifest }, null, 2) + '\n');
} finally { await browser.close(); }
