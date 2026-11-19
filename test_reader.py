import tempfile
import threading
import unittest
from contextlib import closing
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

import requests

from blogpulse import database
from reader_server import FILES, PAGE_SIZE, ReaderHandler


class ReaderTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / 'reader.sqlite3'
        with closing(database(path)) as db, db:
            db.executemany('INSERT INTO article VALUES (?,?,?,?,?)',
                           [('science', f'https://example.org/{index}', f'Post {index} 数学',
                             'text', None) for index in range(PAGE_SIZE + 2)])
        class QuietHandler(ReaderHandler):
            def log_message(self, *args):
                pass

        handler = partial(QuietHandler, db_path=path, sources={'science': {'name': '科学空间'}})
        server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        self.base = f'http://127.0.0.1:{server.server_port}/'

    def test_live_and_static_modes(self):
        for asset in FILES:
            self.assertEqual(requests.get(self.base + asset).status_code, 200, asset)
        self.assertIn('data-mode="local"', requests.get(self.base + 'reader.html').text)
        self.assertIn('data-mode="demo"', requests.get(self.base + 'reader.html?demo=1').text)
        self.assertIn('data-mode="local"', requests.get(self.base + 'library.html').text)
        self.assertIn('data-mode="demo"', requests.get(self.base + 'library.html?demo=1').text)
        self.assertIn('application/javascript', requests.get(self.base + 'notebook.mjs').headers['Content-Type'])
        self.assertEqual(requests.get(self.base + 'config.json').status_code, 404)

    def test_archive_api(self):
        endpoint = self.base + 'api/articles'
        result = requests.get(endpoint, params={'q': 'POST', 'source': 'science', 'page': 2}).json()
        self.assertEqual(result['total'], PAGE_SIZE + 2)
        self.assertEqual([post['title'] for post in result['articles']], ['Post 1 数学', 'Post 0 数学'])
        self.assertEqual(result['sources'][0]['count'], result['total'])
        for params in [{'q': 'absent'}, {'source': 'other'}, {'q': '%'}]:
            self.assertFalse(requests.get(endpoint, params=params).json()['articles'])
        self.assertEqual(requests.get(endpoint, params={'q': '数学'}).json()['total'], PAGE_SIZE + 2)
        self.assertEqual(requests.get(endpoint, params={'page': 'abc'}).status_code, 400)
