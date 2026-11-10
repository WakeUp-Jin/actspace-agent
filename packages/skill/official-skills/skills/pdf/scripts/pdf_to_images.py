"""Render PDF pages to PNG with pypdfium2 (ships with actspace-python).

Adapted from anthropics/skills `pdf/scripts/convert_pdf_to_images.py` (Apache 2.0),
which used pdf2image + poppler. Usage:

    actspace-python pdf_to_images.py input.pdf output_dir [--first N] [--last N] [--max-dim 1000]
"""

import argparse
import os
import sys

import pypdfium2 as pdfium


def convert(pdf_path, output_dir, first, last, max_dim):
    os.makedirs(output_dir, exist_ok=True)
    pdf = pdfium.PdfDocument(pdf_path)
    total = len(pdf)
    first = max(1, first)
    last = total if last is None else min(last, total)
    scale = 200 / 72  # 200 dpi
    for index in range(first - 1, last):
        image = pdf[index].render(scale=scale).to_pil()
        width, height = image.size
        if width > max_dim or height > max_dim:
            factor = min(max_dim / width, max_dim / height)
            image = image.resize((int(width * factor), int(height * factor)))
        path = os.path.join(output_dir, f"page_{index + 1}.png")
        image.save(path)
        print(f"Saved page {index + 1}/{total} as {path} (size: {image.size})")
    print(f"Converted {last - first + 1} pages to PNG images")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf")
    parser.add_argument("output_dir")
    parser.add_argument("--first", type=int, default=1)
    parser.add_argument("--last", type=int, default=None)
    parser.add_argument("--max-dim", type=int, default=1000)
    args = parser.parse_args()
    if not os.path.isfile(args.pdf):
        print(f"not a file: {args.pdf}", file=sys.stderr)
        sys.exit(1)
    convert(args.pdf, args.output_dir, args.first, args.last, args.max_dim)
