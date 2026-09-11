"""Isolated, bounded text extraction. stdout is a private machine-readable result only."""

import json
import logging
import resource
import sys


def main():
    resource.setrlimit(resource.RLIMIT_CPU, (12, 12))
    if sys.platform == "linux":
        resource.setrlimit(resource.RLIMIT_AS, (256 * 1024**2, 256 * 1024**2))
    resource.setrlimit(resource.RLIMIT_FSIZE, (1024**2, 1024**2))
    logging.disable(logging.CRITICAL)
    from pypdf import PdfReader

    try:
        reader = PdfReader(sys.argv[1], strict=False)
        if reader.is_encrypted:
            return {"error": "PDF_ENCRYPTED"}
        if not 1 <= len(reader.pages) <= 30:
            return {"error": "PDF_PAGE_LIMIT"}
        parts = []
        empty_pages = 0
        for page in reader.pages:
            content = page.get_contents()
            if content and len(content.get_data()) > 8 * 1024**2:
                return {"error": "PDF_COMPLEX"}
            text = (page.extract_text() or "").replace("\x00", "")
            empty_pages += not any(char.isalnum() for char in text)
            parts.append(text)
            if sum(len(part) for part in parts) > 50000:
                return {"error": "PDF_TEXT_LIMIT"}
        text = "\n\n".join(parts).strip()
        if not any(char.isalnum() for char in text):
            return {"error": "PDF_NO_TEXT"}
        return {"text": text, "warnings": ["PDF_PARTIAL_TEXT"] if empty_pages else []}
    except MemoryError:
        return {"error": "PDF_COMPLEX"}
    except Exception:
        return {"error": "PDF_INVALID"}


if __name__ == "__main__":
    print(json.dumps(main(), ensure_ascii=False))
