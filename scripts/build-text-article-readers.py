import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "data" / "english-content"
OUTPUT = CONTENT / "readers"
RUNTIME = Path.home() / ".cache" / "codex-runtimes" / "codex-primary-runtime" / "dependencies" / "python"
sys.path.insert(0, str(RUNTIME))
import pdfplumber


def clean_line(value):
    value = str(value or "").replace("\u00ad", "").replace("ﬁ", "fi").replace("ﬂ", "fl")
    value = re.sub(r"@\w+|https?://\S+|t\.me/\S+", "", value, flags=re.I)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def noisy(line):
    if not line or re.fullmatch(r"[\d\W_]+", line):
        return True
    if re.search(r"telegram|subscribe|follow us|BM_IELTS|newscientist", line, re.I):
        return True
    letters = re.sub(r"[^A-Za-z]", "", line)
    return len(letters) < 2


def heading(line):
    letters = re.sub(r"[^A-Za-z]", "", line)
    if len(letters) < 4 or len(line) > 105:
        return False
    upper = sum(char.isupper() for char in letters) / len(letters)
    words = line.split()
    title_ratio = sum(word[:1].isupper() for word in words if re.search(r"[A-Za-z]", word)) / max(1, len(words))
    return upper > .76 or (len(words) <= 9 and title_ratio > .72 and not re.search(r"[.!?][\"']?$", line))


def duplicated_character_ratio(text):
    letters = re.sub(r"[^A-Za-z]", "", text)
    if not letters:
        return 1
    adjacent = sum(1 for left, right in zip(letters, letters[1:]) if left.lower() == right.lower())
    return adjacent / len(letters)


def page_blocks(page, page_number):
    text = page.extract_text(x_tolerance=2, y_tolerance=3) or ""
    lines = [clean_line(line) for line in text.splitlines()]
    lines = [line for line in lines if not noisy(line)]
    blocks, current = [], []

    def flush():
        nonlocal current
        if not current:
            return
        value = " ".join(current)
        value = re.sub(r"-\s+(?=[a-z])", "", value)
        value = re.sub(r"\s+([,.;:!?])", r"\1", value)
        value = re.sub(r"\s+", " ", value).strip()
        if len(value) >= 35:
            blocks.append({"kind": "paragraph", "text": value})
        current = []

    for line in lines:
        if heading(line):
            flush()
            blocks.append({"kind": "heading", "text": line})
            continue
        current.append(line)
        joined = " ".join(current)
        if len(joined) > 620 or (len(joined) > 180 and re.search(r"[.!?][\"']?$", line)):
            flush()
    flush()
    for index, block in enumerate(blocks, start=1):
        block.update({"id": f"p{page_number}-b{index}", "page": page_number})
    return blocks, text


def main():
    catalog = json.loads((CONTENT / "catalog.json").read_text(encoding="utf-8"))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    approved = []
    for article in [item for item in catalog if item.get("collection") == "article"]:
        part = next((entry for entry in article["parts"] if entry.get("key") == "article"), article["parts"][0])
        blocks, raw_pages = [], []
        with pdfplumber.open(CONTENT / part["file"]) as pdf:
            for page_number, page in enumerate(pdf.pages, start=1):
                page_result, raw = page_blocks(page, page_number)
                blocks.extend(page_result)
                raw_pages.append(raw)
        raw_text = "\n".join(raw_pages)
        ratio = duplicated_character_ratio(raw_text)
        paragraph_chars = sum(len(block["text"]) for block in blocks if block["kind"] == "paragraph")
        cid_count = raw_text.lower().count("(cid:")
        is_approved = paragraph_chars >= 900 and len(blocks) >= 5 and ratio < .075 and cid_count < 10
        print(f"{article['id']}: chars={paragraph_chars}, blocks={len(blocks)}, duplicate={ratio:.3f}, approved={is_approved}")
        if not is_approved:
            continue
        payload = {
            "id": article["id"], "title": article["title"], "description": article.get("description", ""),
            "sourceFormat": "pdf-text", "qualityStatus": "approved", "blocks": blocks
        }
        (OUTPUT / f"{article['id']}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        approved.append(article["id"])
    print(f"Approved interactive readers: {len(approved)}")


if __name__ == "__main__":
    main()
