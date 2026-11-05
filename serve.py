#!/usr/bin/env python3
"""Serve the built site on localhost only (needed for the in-browser Python runner).

    python3 serve.py            # http://127.0.0.1:8765
    python3 serve.py 9000       # another port
"""
import http.server
import mimetypes
import os
import sys
import webbrowser
from functools import partial

HERE = os.path.dirname(os.path.abspath(__file__))
# In the repo the site lives in site/; in the exported zip this file sits next to index.html.
ROOT = os.path.join(HERE, "site") if os.path.isdir(os.path.join(HERE, "site")) else HERE
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("application/javascript", ".mjs")


class Handler(http.server.SimpleHTTPRequestHandler):
    """SimpleHTTPRequestHandler plus HTTP Range support, so browsers can seek inside the lesson audio."""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def send_head(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not rng or not os.path.isfile(path) or not rng.startswith("bytes="):
            return super().send_head()
        size = os.path.getsize(path)
        try:
            first, last = rng[6:].split("-", 1)
            start = int(first) if first else max(0, size - int(last))
            end = int(last) if (last and first) else size - 1
        except ValueError:
            return super().send_head()
        end = min(end, size - 1)
        if start > end or start >= size:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None
        f = open(path, "rb")
        self.send_response(206)
        self.send_header("Content-type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        f.seek(start)
        self._range_len = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        n = getattr(self, "_range_len", None)
        if n is None:
            return super().copyfile(source, outputfile)
        self._range_len = None
        while n > 0:
            chunk = source.read(min(65536, n))
            if not chunk:
                break
            outputfile.write(chunk)
            n -= len(chunk)

    def log_message(self, fmt, *args):  # quieter: skip the noisy runtime asset lines
        if "pyodide" not in " ".join(str(a) for a in args):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    if not os.path.isfile(os.path.join(ROOT, "index.html")):
        sys.exit("site/ not built yet. Run: ./.venv/bin/python build.py")
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), partial(Handler, directory=ROOT))
    url = f"http://127.0.0.1:{PORT}/"
    print(f"DSA Lab -> {url}  (Ctrl+C to stop)")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
