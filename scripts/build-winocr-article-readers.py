import asyncio
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "data" / "english-content"
CATALOG = CONTENT / "catalog.json"
OUTPUT = CONTENT / "readers"
RENDER = ROOT / "tmp" / "pdfs" / "winocr-articles"
WINRT = ROOT / "tmp" / "winocr-packages"
WORD_PACKAGES = ROOT / "tmp" / "ocr-packages"
POPPLER = Path.home() / ".cache" / "codex-runtimes" / "codex-primary-runtime" / "dependencies" / "native" / "poppler" / "Library" / "bin" / "pdftoppm.exe"
sys.path[:0] = [str(WINRT), str(WORD_PACKAGES)]

from winrt.windows.globalization import Language
from winrt.windows.graphics.imaging import BitmapDecoder
from winrt.windows.media.ocr import OcrEngine
from winrt.windows.storage.streams import DataWriter, InMemoryRandomAccessStream
import wordninja


def normalise(value):
    value = str(value or "").replace("|", "I")
    value = re.sub(r"\bAST(?=\s+Christmas)", "At", value)
    value = re.sub(r"\b([A-Z])\s+([a-z]{2,})\b", lambda m: m.group(1) + m.group(2), value)
    fixes = (
        (r"^ave you\b", "Have you"), (r"^e've\b", "We've"),
        (r"^elissa\b", "Melissa"), (r"^n a gloomy\b", "On a gloomy"),
        (r"^hr ill-seekers\b", "Thrill-seekers"), (r"\bIwas\b", "I was"),
        (r"\bnormal is ed\b", "normalised"), (r"\bpop ul ar\b", "popular"),
        (r"\bbe com inga\b", "becoming a"), (r"\bd an cer\b", "dancer"),
        (r"\bBu t\b", "But"), (r"\bthrillseeking\b", "thrill-seeking"),
    )
    for pattern, replacement in fixes:
        value = re.sub(pattern, replacement, value, flags=re.I)

    def split_joined(match):
        token = match.group(0)
        parts = wordninja.split(token)
        return " ".join(parts) if 1 < len(parts) <= 5 else token

    value = re.sub(r"[A-Za-z]{5,}(?:'[A-Za-z]+)?", split_joined, value)
    value = re.sub(r"\s+([,.;:!?])", r"\1", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def noise(text):
    if not text or re.fullmatch(r"[\d\W_]+", text):
        return True
    if re.search(r"telegram|subscribe|@\w+|t\.me/|crime monthly\s*\d*$|new scientist\s*\d*$", text, re.I):
        return True
    return False


def looks_like_heading(record, median_height):
    text = record["text"]
    letters = re.sub(r"[^A-Za-z]", "", text)
    if len(letters) < 4 or len(text) > 130:
        return False
    upper = sum(char.isupper() for char in letters) / len(letters)
    return upper > .76 or record["height"] > median_height * 1.42


def records_to_blocks(records, page_number, page_width):
    records = [record for record in records if not noise(record["text"])]
    if not records:
        return []
    heights = sorted(record["height"] for record in records if record["height"] > 0)
    median_height = heights[len(heights) // 2] if heights else 20
    blocks, current = [], []
    previous = None

    def flush():
        nonlocal current
        if not current:
            return
        text = normalise(" ".join(current))
        text = re.sub(r"-\s+(?=[a-z])", "", text)
        if len(text) >= 28:
            blocks.append({"kind": "paragraph", "text": text})
        current = []

    for record in records:
        text = normalise(record["text"])
        if noise(text):
            continue
        if looks_like_heading({**record, "text": text}, median_height):
            flush()
            blocks.append({"kind": "heading", "text": text})
            previous = record
            continue
        column_jump = previous and record["y"] + median_height < previous["y"] and abs(record["x"] - previous["x"]) > page_width * .18
        paragraph_indent = previous and record["x"] - previous["x"] > median_height * .7 and re.search(r"[.!?][\"']?$", previous["text"])
        large_gap = previous and record["y"] - (previous["y"] + previous["height"]) > median_height * .8
        if current and (column_jump or paragraph_indent or large_gap or len(" ".join(current)) > 760):
            flush()
        current.append(text)
        previous = record
    flush()
    # Image-heavy cover pages may contain only labels and headlines. The page
    # is still represented by the title in the reader, so do not expose noise.
    paragraph_chars = sum(len(block["text"]) for block in blocks if block["kind"] == "paragraph")
    if paragraph_chars < 180:
        blocks = [block for block in blocks if block["kind"] == "heading" and len(block["text"]) >= 8][:3]
    for index, block in enumerate(blocks, start=1):
        block.update({"id": f"p{page_number}-b{index}", "page": page_number})
    return blocks


async def decode_bitmap(image_path):
    stream = InMemoryRandomAccessStream()
    writer = DataWriter(stream)
    writer.write_bytes(image_path.read_bytes())
    await writer.store_async()
    await writer.flush_async()
    stream.seek(0)
    decoder = await BitmapDecoder.create_async(stream)
    return await decoder.get_software_bitmap_async()


async def ocr_page(engine, image_path, page_number):
    bitmap = await decode_bitmap(image_path)
    result = await engine.recognize_async(bitmap)
    records = []
    for line in result.lines:
        if not line.words:
            continue
        boxes = [word.bounding_rect for word in line.words]
        x = min(box.x for box in boxes)
        y = min(box.y for box in boxes)
        x1 = max(box.x + box.width for box in boxes)
        y1 = max(box.y + box.height for box in boxes)
        records.append({"x": x, "y": y, "width": x1 - x, "height": y1 - y, "text": line.text})
    return records_to_blocks(records, page_number, bitmap.pixel_width), len(records)


def render_pdf(article_id, pdf_path):
    target = RENDER / article_id
    target.mkdir(parents=True, exist_ok=True)
    pages = sorted(target.glob("page-*.png"))
    if pages:
        return pages
    dpi = "145" if article_id == "article-sitting-smoking" else "55"
    subprocess.run([str(POPPLER), "-png", "-r", dpi, str(pdf_path), str(target / "page")], check=True)
    return sorted(target.glob("page-*.png"))


async def main():
    requested = set(sys.argv[1:])
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    articles = [item for item in catalog if item.get("collection") == "article" and (not requested or item["id"] in requested)]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    RENDER.mkdir(parents=True, exist_ok=True)
    engine = OcrEngine.try_create_from_language(Language("en-US"))
    if not engine:
        raise SystemExit("Windows English OCR language is unavailable")

    for article in articles:
        part = next((entry for entry in article["parts"] if entry.get("key") == "article"), article["parts"][0])
        pages = render_pdf(article["id"], CONTENT / part["file"])
        blocks, line_total = [], 0
        print(f"{article['id']}: {len(pages)} pages", flush=True)
        for index, image_path in enumerate(pages, start=1):
            page_blocks, lines = await ocr_page(engine, image_path, index)
            blocks.extend(page_blocks)
            line_total += lines
            print(f"  page {index}/{len(pages)}: {lines} lines, {len(page_blocks)} blocks", flush=True)
        paragraph_chars = sum(len(block["text"]) for block in blocks if block["kind"] == "paragraph")
        page_coverage = len({block["page"] for block in blocks})
        quality = "approved" if paragraph_chars >= 800 and page_coverage >= max(1, len(pages) - 1) else "ocr-review"
        payload = {
            "id": article["id"], "title": article["title"], "description": article.get("description", ""),
            "sourceFormat": "windows-ocr", "qualityStatus": quality, "pageCount": len(pages),
            "pageCoverage": page_coverage, "lineCount": line_total, "characterCount": paragraph_chars, "blocks": blocks
        }
        (OUTPUT / f"{article['id']}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  saved: {paragraph_chars} paragraph chars, coverage {page_coverage}/{len(pages)}, {quality}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
