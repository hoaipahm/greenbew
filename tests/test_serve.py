"""Checks for the actual local preview server's audio range responses."""
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
import sys
from threading import Thread
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from serve import MediaHandler, ROOT, parse_byte_range


class ByteRangeTests(unittest.TestCase):
    def test_valid_ranges(self):
        for header, expected in [("bytes=0-15", (0, 15)), ("bytes=90-", (90, 99)), ("bytes=-8", (92, 99)), ("bytes=90-999", (90, 99)), ("bytes=-999", (0, 99))]:
            with self.subTest(header=header):
                self.assertEqual(parse_byte_range(header, 100), expected)

    def test_invalid_ranges(self):
        for header in ["bytes=100-", "bytes=30-20", "bytes=-0", "bytes=-", "bytes=0-1,4-5", "bogus"]:
            with self.subTest(header=header), self.assertRaises(ValueError):
                parse_byte_range(header, 100)


class PreviewServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), partial(MediaHandler, directory=str(ROOT)))
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"
        cls.media = "/assets/no-im-not-a-human-ost.mp3"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def test_partial_get_returns_only_requested_bytes(self):
        request = Request(self.base + self.media, headers={"Range": "bytes=4096-4111"})
        with urlopen(request) as response:
            self.assertEqual(response.status, 206)
            self.assertEqual(response.headers["Accept-Ranges"], "bytes")
            self.assertEqual(response.headers["Content-Length"], "16")
            with (ROOT / self.media.lstrip("/")).open("rb") as original:
                original.seek(4096)
                self.assertEqual(response.read(), original.read(16))

    def test_partial_head_matches_audio_size(self):
        request = Request(self.base + self.media, method="HEAD", headers={"Range": "bytes=0-15"})
        with urlopen(request) as response:
            self.assertEqual(response.status, 206)
            self.assertEqual(response.headers["Content-Length"], "16")
            self.assertEqual(response.read(), b"")

    def test_unsatisfiable_range(self):
        request = Request(self.base + self.media, headers={"Range": "bytes=999999999-"})
        with self.assertRaises(HTTPError) as caught:
            urlopen(request)
        self.assertEqual(caught.exception.code, 416)
        caught.exception.close()

    def test_suffix_range(self):
        request = Request(self.base + self.media, headers={"Range": "bytes=-8"})
        with urlopen(request) as response:
            self.assertEqual(response.status, 206)
            self.assertEqual(len(response.read()), 8)

    def test_homepage(self):
        with urlopen(self.base + "/") as response:
            self.assertEqual(response.status, 200)
            self.assertIn(b"radio.js", response.read())

    def test_private_folders_not_served(self):
        with self.assertRaises(HTTPError) as caught:
            urlopen(self.base + "/.qa/firebase-config/")
        self.assertEqual(caught.exception.code, 404)
        caught.exception.close()


if __name__ == "__main__":
    unittest.main()
