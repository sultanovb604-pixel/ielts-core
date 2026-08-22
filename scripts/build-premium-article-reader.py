import json
import math
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT_DIR = ROOT / "data" / "english-content"
CATALOG_FILE = CONTENT_DIR / "catalog.json"
OUTPUT_DIR = CONTENT_DIR / "readers"
RENDER_DIR = ROOT / "tmp" / "pdfs" / "premium-article-ocr-55"
OCR_PACKAGES = ROOT / "tmp" / "ocr-packages"
POPPLER = Path.home() / ".cache" / "codex-runtimes" / "codex-primary-runtime" / "dependencies" / "native" / "poppler" / "Library" / "bin" / "pdftoppm.exe"

sys.path.insert(0, str(OCR_PACKAGES))
from PIL import Image
from rapidocr_onnxruntime import RapidOCR
import wordninja
import numpy as np


def normalize_text(value):
    value = str(value or "").replace("|", "I")
    value = value.replace("’", "'").replace("“", '"').replace("”", '"')
    value = re.sub(r"\s+([,.;:!?])", r"\1", value)
    value = re.sub(r"([,.;:!?])(?=[A-Za-z])", r"\1 ", value)
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(r"\bByl(?=[A-Z])", "By I", value)
    value = re.sub(r"\bStting\b", "Sitting", value, flags=re.I)
    value = re.sub(r"\bSomeresearcherssuggest\b", "Some researchers suggest", value, flags=re.I)

    def split_joined(match):
        token = match.group(0)
        pieces = wordninja.split(token)
        if len(pieces) <= 1:
            return token
        return " ".join(pieces)

    # OCR often removes spaces completely ("wasa", "anyonetoseeher").
    # WordNinja leaves ordinary dictionary words intact and only separates a
    # token when there is strong evidence that it contains multiple words.
    value = re.sub(r"[A-Za-z]{4,}(?:'[A-Za-z]+)?", split_joined, value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def is_noise(text):
    clean = text.strip()
    if not clean:
        return True
    if re.fullmatch(r"[\d\s|/.-]+", clean):
        return True
    if re.search(r"TWENTY\s*80|Health\s*&\s*Wellbeing|LIVE WELL", clean, re.I):
        return True
    return False


def is_heading(record, median_height):
    text = record["text"]
    letters = re.sub(r"[^A-Za-z]", "", text)
    upper_ratio = sum(char.isupper() for char in letters) / max(1, len(letters))
    return (
        (len(text) <= 95 and upper_ratio > 0.72 and len(letters) >= 4)
        or (record["height"] > median_height * 1.38 and len(text) <= 110)
        or (len(text) <= 70 and text.endswith("?") and record["height"] >= median_height * 1.05)
    )


def order_records(records, width, height):
    if len(records) < 8:
        return sorted(records, key=lambda item: (item["y0"], item["x0"]))

    midpoint = width / 2
    top_records = [item for item in records if item["y0"] < height * 0.18 and item["width"] > width * 0.32]
    top_ids = {id(item) for item in top_records}
    remaining = [item for item in records if id(item) not in top_ids]
    left = [item for item in remaining if (item["x0"] + item["x1"]) / 2 < midpoint]
    right = [item for item in remaining if (item["x0"] + item["x1"]) / 2 >= midpoint]
    two_columns = len(left) >= 4 and len(right) >= 4

    if not two_columns:
        return sorted(records, key=lambda item: (item["y0"], item["x0"]))
    return (
        sorted(top_records, key=lambda item: (item["y0"], item["x0"]))
        + sorted(left, key=lambda item: (item["y0"], item["x0"]))
        + sorted(right, key=lambda item: (item["y0"], item["x0"]))
    )


def records_to_blocks(records, page_number):
    if not records:
        return []
    median_height = sorted(item["height"] for item in records)[len(records) // 2]
    blocks = []
    current = []
    previous = None

    def flush(kind="paragraph"):
        nonlocal current
        text = " ".join(current)
        text = re.sub(r"-\s+", "", text)
        text = normalize_text(text)
        if len(text) >= 3 and not is_noise(text):
            blocks.append({"kind": kind, "text": text})
        current = []

    for record in records:
        text = normalize_text(record["text"])
        if is_noise(text) or float(record["score"]) < 0.70:
            continue
        heading = is_heading({**record, "text": text}, median_height)
        # Magazine drop caps are frequently detected as a one-letter heading.
        # Keep them with the following paragraph instead.
        if heading and len(re.sub(r"[^A-Za-z]", "", text)) > 2:
            flush()
            blocks.append({"kind": "heading", "text": text.title() if text.isupper() else text})
            previous = record
            continue

        gap = record["y0"] - previous["y1"] if previous else 0
        column_jump = previous and abs(record["x0"] - previous["x0"]) > 250 and record["y0"] < previous["y0"]
        if current and (gap > median_height * 1.65 or column_jump or len(" ".join(current)) > 520):
            flush()
        if len(text) == 1 and text.isalpha():
            current.append(text)
        elif current and len(current[-1]) == 1 and current[-1].isalpha() and text[:1].islower():
            current[-1] = current[-1] + text
        else:
            current.append(text)
        previous = record
    flush()

    for index, block in enumerate(blocks, start=1):
        block["id"] = f"p{page_number}-b{index}"
        block["page"] = page_number
    return blocks


def ocr_pdf(engine, pdf_path, article_id):
    article_render_dir = RENDER_DIR / article_id
    article_render_dir.mkdir(parents=True, exist_ok=True)
    prefix = article_render_dir / "page"
    existing = sorted(article_render_dir.glob("page-*.png"))
    if not existing:
        dpi = "145" if article_id == "article-sitting-smoking" else "55"
        subprocess.run([
            str(POPPLER), "-png", "-r", dpi, str(pdf_path), str(prefix)
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        existing = sorted(article_render_dir.glob("page-*.png"))

    all_blocks = []
    for page_index, image_path in enumerate(existing, start=1):
        image = Image.open(image_path).convert("RGB")
        pixels = np.asarray(image)
        midpoint = image.width // 2
        overlap = max(8, round(image.width * .008))
        columns = [pixels[:, :midpoint + overlap], pixels[:, midpoint - overlap:]]
        page_blocks = []
        line_count = 0
        for column_index, column in enumerate(columns):
            result, _ = engine(column)
            records = []
            for box, text, score in result or []:
                xs = [point[0] for point in box]
                ys = [point[1] for point in box]
                records.append({
                    "x0": min(xs), "x1": max(xs), "y0": min(ys), "y1": max(ys),
                    "width": max(xs) - min(xs), "height": max(ys) - min(ys),
                    "text": text, "score": score, "column": column_index
                })
            line_count += len(records)
            ordered = sorted(records, key=lambda item: (item["y0"], item["x0"]))
            page_blocks.extend(records_to_blocks(ordered, page_index))
        for block_index, block in enumerate(page_blocks, start=1):
            block["id"] = f"p{page_index}-b{block_index}"
        all_blocks.extend(page_blocks)
        print(f"  page {page_index}/{len(existing)}: {line_count} lines -> {len(all_blocks)} blocks", flush=True)
    return all_blocks


def main():
    if not POPPLER.exists():
        raise SystemExit(f"pdftoppm not found: {POPPLER}")
    catalog = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
    requested = set(sys.argv[1:])
    premium_articles = [
        item for item in catalog
        if item.get("collection") == "article"
        and (not requested or item.get("id") in requested)
    ]
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    engine = RapidOCR()

    for article in premium_articles:
        part = next((entry for entry in article.get("parts", []) if entry.get("key") == "article"), article.get("parts", [{}])[0])
        pdf_path = CONTENT_DIR / part["file"]
        print(f"{article['id']}: {article['title']}", flush=True)
        blocks = ocr_pdf(engine, pdf_path, article["id"])
        payload = {
            "id": article["id"],
            "title": article["title"],
            "description": article.get("description", ""),
            "sourceFormat": "pdf",
            "qualityStatus": "ocr-review",
            "pageCount": max((block.get("page", 0) for block in blocks), default=0),
            "blocks": blocks
        }
        output = OUTPUT_DIR / f"{article['id']}.json"
        output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  saved {len(blocks)} blocks -> {output.name}", flush=True)


if __name__ == "__main__":
    main()
