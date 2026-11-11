#!/usr/bin/env python3
"""
Dance with Babi — build step.

The game is written as a handful of readable files in src/ plus an HTML
template. This script welds them into a single self-contained index.html so
the whole game can be opened from the filesystem, embedded in a sandboxed
iframe, or served by GitHub Pages without a single extra request.

    python3 tools/build.py
"""
import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "tools" / "template.html"
OUT = ROOT / "index.html"

STYLE = ROOT / "src" / "style.css"
SCRIPTS = ["math3d.js", "paths.js", "motion.js", "audio.js", "render.js", "game.js"]


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def main() -> None:
    html = read(TEMPLATE)

    css = read(STYLE).strip()
    html = html.replace(
        "<!-- /* INLINE:STYLE */ -->",
        "<style>\n" + css + "\n</style>",
    )

    js = "\n\n".join(
        "/* ==== src/%s ==== */\n%s" % (name, read(ROOT / "src" / name).strip())
        for name in SCRIPTS
    )
    html = html.replace(
        "<!-- /* INLINE:SCRIPT */ -->",
        "<script>\n" + js + "\n</script>",
    )

    # the login screen shows the key-art poster; inline it so the page
    # stays a single self-contained file with zero network requests
    poster = ROOT / "assets" / "poster-login.jpg"
    if poster.exists():
        b64 = base64.b64encode(poster.read_bytes()).decode("ascii")
        html = html.replace("__DWB_POSTER_B64__", "data:image/jpeg;base64," + b64)
    else:
        html = html.replace("__DWB_POSTER_B64__", "data:,")

    OUT.write_text(html, encoding="utf-8")
    kb = len(html.encode("utf-8")) / 1024
    print("wrote %s (%.1f KB, self-contained)" % (OUT.relative_to(ROOT), kb))


if __name__ == "__main__":
    main()
