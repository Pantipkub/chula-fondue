#!/usr/bin/env python3
"""Build docs/proposal.pdf from Markdown, full ADR sources and rendered diagrams.

Run with the bundled Python from load_workspace_dependencies; see README.md here.
"""
from pathlib import Path
import hashlib
import html
import json
import os
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A3, A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, Image, KeepTogether, NextPageTemplate,
    PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle,
)
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / 'docs'
QA = ROOT / 'output/pdf/qa'
QA.mkdir(parents=True, exist_ok=True)
FONTS = Path(os.environ.get('PDF_FONT_DIR', '/System/Library/Fonts/Supplemental'))
for name, filename in [('Arial', 'Arial.ttf'), ('Arial-Bold', 'Arial Bold.ttf'),
                       ('Arial-Italic', 'Arial Italic.ttf'), ('Mono', 'Courier New.ttf')]:
    pdfmetrics.registerFont(TTFont(name, str(FONTS / filename)))
pdfmetrics.registerFontFamily('Arial', normal='Arial', bold='Arial-Bold', italic='Arial-Italic', boldItalic='Arial-Bold')

NAVY = colors.HexColor('#16344f')
TEAL = colors.HexColor('#147d83')
MUTED = colors.HexColor('#5c6f80')
GRID = colors.HexColor('#d6dfe6')
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='BodyCF', fontName='Arial', fontSize=10.1, leading=14.1,
                          textColor=colors.HexColor('#233548'), spaceAfter=7, splitLongWords=True))
styles.add(ParagraphStyle(name='TitleCF', parent=styles['BodyCF'], fontName='Arial-Bold', fontSize=31,
                          leading=36, textColor=NAVY, spaceBefore=22, spaceAfter=17, keepWithNext=True))
styles.add(ParagraphStyle(name='SectionCF', parent=styles['BodyCF'], fontName='Arial-Bold', fontSize=17,
                          leading=21, textColor=NAVY, spaceBefore=3, spaceAfter=12, keepWithNext=True))
styles.add(ParagraphStyle(name='SubCF', parent=styles['BodyCF'], fontName='Arial-Bold', fontSize=11.2,
                          leading=15, textColor=TEAL, spaceBefore=8, spaceAfter=5, keepWithNext=True))
styles.add(ParagraphStyle(name='CellCF', parent=styles['BodyCF'], fontSize=8.9, leading=11.7, spaceAfter=0))
styles.add(ParagraphStyle(name='CellWideCF', parent=styles['CellCF'], fontSize=10.3, leading=13.6))
styles.add(ParagraphStyle(name='HeadCF', parent=styles['CellCF'], fontName='Arial-Bold', textColor=colors.white))
styles.add(ParagraphStyle(name='HeadWideCF', parent=styles['HeadCF'], fontSize=10.1, leading=13))
styles.add(ParagraphStyle(name='CaptionCF', parent=styles['BodyCF'], fontSize=9.1, leading=12.2, textColor=MUTED))
styles.add(ParagraphStyle(name='CodeCF', parent=styles['BodyCF'], fontName='Mono', fontSize=8.6, leading=11))


def inline(text):
    parts = re.split(r'(\*\*.*?\*\*|`[^`]+`|\[[^\]]+\]\([^\)]+\))', text)
    result = []
    for token in parts:
        if token.startswith('**') and token.endswith('**'):
            result.append('<b>' + html.escape(token[2:-2]) + '</b>')
        elif token.startswith('`') and token.endswith('`'):
            result.append('<font name="Mono" size="8.6">' + html.escape(token[1:-1]) + '</font>')
        elif token.startswith('['):
            match = re.fullmatch(r'\[([^\]]+)\]\(([^\)]+)\)', token)
            if match:
                label, target = match.groups()
                adr = re.match(r'adr/(\d{3})-', target)
                if adr:
                    result.append(f'<link href="#adr-{adr[1]}" color="#147d83">{html.escape(label)}</link>')
                elif target.startswith('https://'):
                    result.append(f'<link href="{html.escape(target, quote=True)}" color="#147d83">{html.escape(label)}</link>')
                else:
                    result.append(html.escape(label))
            else:
                result.append(html.escape(token))
        else:
            result.append(html.escape(token))
    return ''.join(result)


def p(text, style='BodyCF'):
    return Paragraph(inline(text), styles[style])


class Proposal(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(str(filename), pagesize=A4, title='Chula Fondue revised proposal and ADRs',
                         author='Chula Fondue project team', subject='Service discovery, NFR evidence and revised microservice design',
                         leftMargin=43, rightMargin=43, topMargin=50, bottomMargin=43,
                         allowSplitting=True, pageCompression=1)
        self.headings = []
        templates = []
        for name, size in [('portrait', A4), ('landscape', landscape(A3)), ('diagram-portrait', A3)]:
            width, height = size
            frame = Frame(43, 43, width - 86, height - 93, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
            templates.append(PageTemplate(id=name, frames=[frame], pagesize=size, onPage=self.decorate))
        self.addPageTemplates(templates)

    def decorate(self, canvas, doc):
        width, height = doc.pageTemplate.pagesize
        canvas.saveState()
        canvas.setFillColor(MUTED)
        canvas.setFont('Arial', 8)
        canvas.drawString(43, height - 26, 'CHULA FONDUE  |  WEEKLY PROGRESS')
        canvas.drawRightString(width - 43, height - 26, '27 OCTOBER 2026')
        canvas.drawString(43, 23, 'Revised design and measured local evidence')
        canvas.drawRightString(width - 43, 23, f'{doc.page}')
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name in ['TitleCF', 'SectionCF']:
            text = flowable.getPlainText()
            adr = re.match(r'ADR-(\d{3})', text)
            key = f'adr-{adr[1]}' if adr else 'section-' + hashlib.sha1(text.encode()).hexdigest()[:12]
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text, key, level=0)
            self.headings.append({'title': text, 'page': self.page})


orientation = 'portrait'
story = []


def new_page(mode='portrait'):
    global orientation
    orientation = mode
    story.extend([NextPageTemplate(mode), PageBreak()])


def make_table(rows):
    rows = [[cell.strip() for cell in row] for row in rows]
    width = (landscape(A3) if orientation == 'landscape' else A3 if orientation == 'diagram-portrait' else A4)[0] - 86
    columns = len(rows[0])
    # The wide matrices use deliberate proportions rather than equal tiny columns.
    if columns == 6:
        ratios = [.13, .16, .17, .18, .21, .15]
    elif columns == 7:
        ratios = [.28, .12, .12, .12, .12, .12, .12]
    elif columns == 4:
        ratios = [.12, .27, .30, .31] if rows[0][0] == 'ADR' else [.15, .32, .31, .22]
    elif columns == 3:
        ratios = [.36, .22, .42] if rows[0][1] == 'Protocol' else [.25, .38, .37]
    elif columns == 2:
        ratios = [.42, .58]
    else:
        ratios = [1 / columns] * columns
    normal = 'CellWideCF' if orientation == 'landscape' else 'CellCF'
    header = 'HeadWideCF' if orientation == 'landscape' else 'HeadCF'
    data = [[p(cell.strip(), header if i == 0 else normal) for cell in row] for i, row in enumerate(rows)]
    table = Table(data, colWidths=[width * ratio for ratio in ratios], repeatRows=1, hAlign='LEFT')
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), NAVY),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f4f7fa')]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 7), ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LINEBELOW', (0, 0), (-1, 0), .5, NAVY),
        ('LINEBELOW', (0, 1), (-1, -1), .3, GRID),
    ]))
    story.extend([table, Spacer(1, 9)])


def parse_markdown(source, adr=False):
    lines = source.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        if not line:
            index += 1
            continue
        if line == '<!-- pagebreak -->':
            new_page()
        elif line == '<!-- landscape -->':
            new_page('landscape')
        elif line == '<!-- diagram-portrait -->':
            new_page('diagram-portrait')
        elif line == '<!-- adr-appendix -->':
            for source_file in sorted((DOCS / 'adr').glob('[0-9][0-9][0-9]-*.md')):
                new_page()
                parse_markdown(source_file.read_text(), adr=True)
        elif line.startswith('# '):
            story.append(p(line[2:], 'SectionCF' if adr else 'TitleCF'))
        elif line.startswith('## '):
            story.append(p(line[3:], 'SubCF' if adr or not re.match(r'\d+ ', line[3:]) else 'SectionCF'))
        elif line.startswith('### '):
            story.append(p(line[4:], 'SubCF'))
        elif line.startswith('!['):
            match = re.fullmatch(r'!\[([^\]]*)\]\(([^)]+)\)', line)
            image = Image(str(DOCS / match[2]))
            max_width = (landscape(A3) if orientation == 'landscape' else A3 if orientation == 'diagram-portrait' else A4)[0] - 86
            max_height = 600 if orientation == 'landscape' else 910 if orientation == 'diagram-portrait' else 520
            scale = min(max_width / image.imageWidth, max_height / image.imageHeight)
            image.drawWidth = image.imageWidth * scale
            image.drawHeight = image.imageHeight * scale
            story.extend([image, Spacer(1, 7)])
        elif line.startswith('|'):
            rows = []
            while index < len(lines) and lines[index].strip().startswith('|'):
                cells = lines[index].strip().strip('|').split('|')
                if not all(re.fullmatch(r'\s*:?-+:?\s*', cell) for cell in cells):
                    rows.append(cells)
                index += 1
            make_table(rows)
            continue
        elif line.startswith('- '):
            # One list item per flowable so long references can wrap cleanly.
            para = Paragraph('<font color="#147d83">•</font>  ' + inline(line[2:]), styles['BodyCF'])
            story.append(para)
        elif line.startswith('```'):
            code = []
            index += 1
            while index < len(lines) and not lines[index].startswith('```'):
                code.append(lines[index])
                index += 1
            for code_line in code:
                story.append(p(code_line, 'CodeCF'))
        else:
            text = [line]
            index += 1
            while index < len(lines) and lines[index].strip() and not re.match(r'^(#|\||!\[|<!--|- |```)', lines[index].strip()):
                text.append(lines[index].strip())
                index += 1
            content = ' '.join(text)
            story.append(p(content, 'CaptionCF' if content.startswith('**Figure ') else 'BodyCF'))
            continue
        index += 1


parse_markdown((DOCS / 'proposal.md').read_text())
output = DOCS / 'proposal.pdf'
document = Proposal(output)
document.build(story)
reader = PdfReader(output)
all_text = '\n'.join(page.extract_text() or '' for page in reader.pages)
for required in [*[f'ADR-{i:03d}' for i in range(1, 12)], 'UC-05', '27.68', '23.37', '3,027.05', 'Overall', 'FAIL']:
    assert required in all_text, f'Missing required PDF content: {required}'
sources = [DOCS / 'proposal.md', *sorted((DOCS / 'adr').glob('*.md')),
           *sorted((DOCS / 'diagrams').glob('*.mmd'))]
manifest = {
    'pdf': 'docs/proposal.pdf', 'pages': len(reader.pages),
    'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
    'sourceSha256': {str(file.relative_to(ROOT)): hashlib.sha256(file.read_bytes()).hexdigest() for file in sources},
    'headings': document.headings,
    'pageSizes': [[float(page.mediabox.width), float(page.mediabox.height)] for page in reader.pages],
    'contentPresence': 'PASS', 'visualReview': 'PENDING',
}
(QA / 'build.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'output': str(output), 'pages': len(reader.pages), 'bytes': output.stat().st_size, 'content': 'PASS'}, indent=2))
