#!/usr/bin/env python3
"""
Render the manual.

manual.html holds every chapter. This produces the two editions handed out —
participants get theirs, administrators get theirs — plus a combined copy for
the committee's own reference.

    python3 build.py            all three
    python3 build.py 参加者用    just one, by key

Chapters are renumbered per edition, so each reads 01, 02, 03 … whichever
chapters it contains. Section ids are untouched, so the table of contents page
numbers still resolve.
"""
import re
import sys
from pathlib import Path

from weasyprint import HTML

HERE = Path(__file__).parent
SRC = HERE / 'manual.html'

EDITIONS = {
    '参加者用': {
        'file': '万歩計実績表_利用マニュアル_参加者用.pdf',
        'keep': ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's13'],
        'for': '参加者',
        'sub': 'Pedometer Record System — User Manual for participants',
        'groups': {'管理者（健康対策委員）の方へ / FOR ADMINISTRATORS': None},
    },
    '管理者用': {
        'file': '万歩計実績表_利用マニュアル_管理者用.pdf',
        'keep': ['s01', 's08', 's09', 's10', 's11', 's12', 's13'],
        'for': '健康対策委員（管理者）',
        'sub': 'Pedometer Record System — Administrator Manual',
        # 01 is the only chapter left above the administrator ones, so its
        # group gets a heading of its own rather than repeating theirs.
        'groups': {'参加者の方へ / FOR PARTICIPANTS': '共通 / GENERAL'},
    },
    '全体': {
        'file': '万歩計実績表_利用マニュアル_全体.pdf',
        'keep': None,                      # everything, numbering untouched
        'for': '参加者・健康対策委員（管理者）',
        'sub': 'Pedometer Record System — User Manual for participants and administrators',
        'groups': {},
    },
}


def drop_sections(html, keep):
    """Remove whole <section class="sec"> blocks that this edition omits."""
    def cut(m):
        return m.group(0) if m.group(1) in keep else ''
    return re.sub(r'<section class="sec" id="(s\d+)">.*?</section>\n', cut, html, flags=re.S)


def drop_toc_entries(html, keep):
    def cut(m):
        return m.group(0) if m.group(1) in keep else ''
    return re.sub(r'\s*<li><a href="#(s\d+)">.*?</li>\n', cut, html, flags=re.S)


def drop_empty_groups(html):
    """A group heading with no chapters left under it."""
    return re.sub(r'\s*<div class="grp">[^<]*</div>\s*<ol>\s*</ol>\n', '\n', html)


def rename_groups(html, mapping):
    for old, new in mapping.items():
        if new is None:
            continue
        html = html.replace(f'<div class="grp">{old}</div>', f'<div class="grp">{new}</div>')
    return html


def renumber(html, keep):
    """01, 02, 03 … in the order the chapters actually appear."""
    order = [s for s in keep if f'id="{s}"' in html]
    for i, sid in enumerate(order, 1):
        num = f'{i:02d}'
        html = re.sub(
            r'(<section class="sec" id="%s">\s*<div class="sec-h"><span class="num">)\d+(</span>)' % sid,
            r'\g<1>%s\g<2>' % num, html)
        html = re.sub(
            r'(<li><a href="#%s"><span class="n">)\d+(</span>)' % sid,
            r'\g<1>%s\g<2>' % num, html)
    return html


def build(key):
    ed = EDITIONS[key]
    html = SRC.read_text(encoding='utf-8')

    if ed['keep'] is not None:
        html = drop_sections(html, ed['keep'])
        html = drop_toc_entries(html, ed['keep'])
        html = rename_groups(html, ed['groups'])
        html = drop_empty_groups(html)
        html = renumber(html, ed['keep'])

    html = html.replace('<dd>参加者・総務（管理者）</dd>', f"<dd>{ed['for']}</dd>")
    html = html.replace(
        '<p class="sub-en">Pedometer Record System — User Manual for participants and administrators</p>',
        f"<p class=\"sub-en\">{ed['sub']}</p>")
    if key != '全体':
        html = html.replace('<h1>万歩計実績表<br>利用マニュアル</h1>',
                            f'<h1>万歩計実績表<br>利用マニュアル</h1>\n    <p class="edition">{key}</p>')

    out = HERE / ed['file']
    HTML(string=html, base_url=str(HERE)).write_pdf(out)
    print(f'{ed["file"]}')


if __name__ == '__main__':
    for k in (sys.argv[1:] or EDITIONS):
        build(k)
