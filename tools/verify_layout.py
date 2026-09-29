#!/usr/bin/env python3
"""Measure a compiled CV or cover letter's page layout, instead of eyeballing it.

Checks (all compile-clean, correct-page-count, verify_pdf.py-passing failures):
orphaned entry, internal hole, page ends early, thin final page, footer collision.
Page count is NOT checked here (verify_pdf.py --pages owns it).

Geometry comes from Poppler word bounding boxes (pdftotext -bbox). Without a
working Poppler, reports skipped: and exits 2 rather than inventing failures.

Usage:
    python tools/verify_layout.py cv/main_acme_ml_engineer.pdf
Exit codes: 0 clean, 1 layout problem, 2 bad invocation or no usable extractor.
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

GAP_LIMIT_PT = 100.0
BOTTOM_LIMIT_FRACTION = 0.25
LAST_PAGE_THIN_FRACTION = 0.35
FOOTER_BAND_PT = 90.0
INDENT_PT = 8.0
HEADING_HEIGHT_RATIO = 1.25

PAGE_RE = re.compile(r'<page width="([\d.]+)" height="([\d.]+)">(.*?)</page>', re.S)
WORD_RE = re.compile(
    r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="[\d.]+" yMax="([\d.]+)">([^<]*)</word>'
)


@dataclass
class Line:
    top: float
    bottom: float
    left: float
    height: float
    text: str


class Page:
    def __init__(self, height: float, lines: list[Line]):
        self.height = height
        self.lines = sorted(lines, key=lambda l: l.top)

    @property
    def body(self) -> list[Line]:
        cutoff = self.height - FOOTER_BAND_PT
        return [l for l in self.lines if l.top < cutoff]

    @property
    def empty(self) -> bool:
        return not self.body

    @property
    def bottom_space(self) -> float:
        return self.height - max(l.bottom for l in self.body) if self.body else self.height

    @property
    def left_edge(self) -> float:
        return min(l.left for l in self.body) if self.body else 0.0

    @property
    def body_median_height(self) -> float:
        heights = sorted(l.height for l in self.body)
        return heights[len(heights) // 2] if heights else 0.0

    @property
    def footer_crowded(self) -> bool:
        band = self.height - FOOTER_BAND_PT
        return len({round(l.top, 1) for l in self.lines if l.top >= band}) > 1

    def is_indented(self, line: Line) -> bool:
        return line.left > self.left_edge + INDENT_PT

    def is_heading(self, line: Line) -> bool:
        median = self.body_median_height
        return bool(median) and line.height > median * HEADING_HEIGHT_RATIO

    def largest_gap(self) -> tuple[float, float]:
        tops = sorted({round(l.top, 1) for l in self.body})
        if len(tops) < 2:
            return (0.0, 0.0)
        return max((tops[i + 1] - tops[i], tops[i]) for i in range(len(tops) - 1))


def parse_pdf(path: Path) -> list[Page]:
    if not shutil.which("pdftotext"):
        raise RuntimeError("pdftotext (Poppler) not found; install poppler-utils")
    try:
        out = subprocess.run(
            ["pdftotext", "-bbox", "-enc", "UTF-8", str(path), "-"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=True,
        ).stdout
    except subprocess.CalledProcessError as exc:
        stderr_lines = (exc.stderr or "").strip().splitlines()
        detail = stderr_lines[0] if stderr_lines else f"exit {exc.returncode}"
        raise RuntimeError(
            f"pdftotext could not produce bounding boxes for {path} ({detail})"
        ) from exc
    pages = []
    for _w, h, body in PAGE_RE.findall(out):
        buckets: dict[float, list[tuple[float, float, float, str]]] = {}
        for x_min, y_min, y_max, text in WORD_RE.findall(body):
            key = round(float(y_min), 0)
            buckets.setdefault(key, []).append((float(x_min), float(y_min), float(y_max), text))
        lines = [
            Line(
                top=min(w[1] for w in words),
                bottom=max(w[2] for w in words),
                left=min(w[0] for w in words),
                height=max(w[2] - w[1] for w in words),
                text=" ".join(w[3] for w in sorted(words)),
            )
            for words in buckets.values()
        ]
        pages.append(Page(float(h), lines))
    return pages


def find_orphans(pages: list[Page]) -> list[str]:
    problems = []
    body_lines = [l for p in pages for l in p.body]
    if not body_lines:
        return problems
    doc_left = min(l.left for l in body_lines)

    def indented(line: Line) -> bool:
        return line.left > doc_left + INDENT_PT

    for i in range(len(pages) - 1):
        here, nxt = pages[i], pages[i + 1]
        if here.empty or nxt.empty:
            continue
        last, first = here.body[-1], nxt.body[0]
        if here.is_heading(last):
            problems.append(
                f"p{i + 1} ends on the section heading {last.text.strip()!r} with its content "
                f"on p{i + 2}."
            )
        elif not indented(last) and indented(first):
            if not re.search(r"\w", last.text):
                problems.append(
                    f"p{i + 1} ends on a lone list marker whose text continues on p{i + 2}."
                )
            else:
                problems.append(
                    f"p{i + 1} ends on {last.text.strip()[:60]!r} while "
                    f"p{i + 2} opens with {first.text.strip()[:60]!r}: entry header orphaned. "
                    "Add \\needspace before that \\cventry, or shorten it"
                )
    return problems


def report(path: Path, pages: list[Page]) -> list[str]:
    problems: list[str] = []
    print(f"{path}: {len(pages)} page(s) (page count is verify_pdf.py's job, not checked here)")
    for i, page in enumerate(pages, 1):
        if page.empty:
            problems.append(f"p{i} contains no text")
            print(f"  p{i}: EMPTY")
            continue
        gap, gap_y = page.largest_gap()
        share = page.bottom_space / page.height
        print(
            f"  p{i}: text y {page.body[0].top:.0f}..{page.body[-1].bottom:.0f}"
            f" of {page.height:.0f}pt | bottom {page.bottom_space:.0f}pt ({share * 100:.0f}%)"
            f" | largest gap {gap:.0f}pt at y{gap_y:.0f}"
        )
        if gap > GAP_LIMIT_PT:
            problems.append(f"p{i} has a {gap:.0f}pt hole at y{gap_y:.0f}. Shorten the entry that follows the hole.")
        if i < len(pages) and share > BOTTOM_LIMIT_FRACTION:
            problems.append(f"p{i} ends {share * 100:.0f}% early although more pages follow.")
        if page.footer_crowded:
            problems.append(f"p{i} has body text inside the bottom margin band; cut content.")
        if i == len(pages) > 1 and share > LAST_PAGE_THIN_FRACTION:
            problems.append(f"p{i} is the last page and {share * 100:.0f}% empty; restore cut content.")
    problems.extend(find_orphans(pages))
    return problems


def _force_utf8_output() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure:
            reconfigure(encoding="utf-8")


def main() -> int:
    _force_utf8_output()
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("pdf", nargs="?", type=Path)
    args = ap.parse_args()
    if not args.pdf:
        ap.error("pdf is required")
    if not args.pdf.exists():
        print(f"error: {args.pdf} not found", file=sys.stderr)
        return 2
    try:
        pages = parse_pdf(args.pdf)
    except RuntimeError as exc:
        print(f"skipped: {exc}", file=sys.stderr)
        return 2
    problems = report(args.pdf, pages)
    if problems:
        print("\nLAYOUT PROBLEMS:")
        for m in problems:
            print(f"  - {m}")
        return 1
    print("layout: clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
