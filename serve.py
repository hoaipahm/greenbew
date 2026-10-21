"""Local preview with byte-range support so large audio files seek correctly."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import re
from typing import BinaryIO

ROOT = Path(__file__).resolve().parent


def parse_byte_range(value: str, size: int) -> tuple[int, int]:
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", value.strip())
    if not match or size <= 0:
        raise ValueError("Invalid byte range")
    first, last = match.groups()
    if not first:
        suffix = int(last) if last else 0
        if suffix <= 0:
            raise ValueError("Invalid suffix")
        return max(0, size - suffix), size - 1
    start = int(first)
    end = min(int(last), size - 1) if last else size - 1
    if start >= size or end < start:
        raise ValueError("Range outside resource")
    return start, end


class MediaHandler(SimpleHTTPRequestHandler):
    byte_range: tuple[int, int] | None = None

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def list_directory(self, path: str) -> None:
        self.send_error(404)
        return None

    def send_head(self) -> BinaryIO | None:
        self.byte_range = None
        file_path = Path(self.translate_path(self.path)).resolve()
        if not file_path.is_relative_to(ROOT) or any(part.startswith(".") for part in file_path.relative_to(ROOT).parts):
            self.send_error(404)
            return None
        if file_path.is_dir():
            return super().send_head()
        try:
            source = file_path.open("rb")
        except OSError:
            self.send_error(404)
            return None
        info = os.fstat(source.fileno())
        size = info.st_size
        requested = self.headers.get("Range")
        if requested:
            try:
                self.byte_range = parse_byte_range(requested, size)
            except ValueError:
                source.close()
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return None
        start, end = self.byte_range if self.byte_range else (0, size - 1)
        self.send_response(206 if self.byte_range else 200)
        self.send_header("Content-Type", self.guess_type(str(file_path)))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(max(0, end - start + 1)))
        self.send_header("Last-Modified", self.date_time_string(info.st_mtime))
        if self.byte_range:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        return source

    def copyfile(self, source: BinaryIO, outputfile: BinaryIO) -> None:
        try:
            if self.byte_range is None:
                super().copyfile(source, outputfile)
                return
            start, end = self.byte_range
            source.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = source.read(min(65536, remaining))
                if not chunk:
                    break
                outputfile.write(chunk)
                remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            # Browsers cancel old requests when the user seeks to another position.
            return


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--bind", default="127.0.0.1")
    args = parser.parse_args()
    handler = partial(MediaHandler, directory=str(ROOT))
    with ThreadingHTTPServer((args.bind, args.port), handler) as server:
        print(f"Hoai preview: http://{args.bind}:{server.server_port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("Preview stopped.")


if __name__ == "__main__":
    main()
