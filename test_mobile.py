import json
import struct
import unittest

from build_mobile_feed import build
from reader_server import ASSETS, FILES


class PocketTests(unittest.TestCase):
    def test_public_edition_is_bounded_and_interleaved(self):
        sources = {key: {'name': key.upper(), 'url': f'https://{key}.example/feed'}
                   for key in ('first', 'second')}
        feed = '<rss><channel>' + ''.join(
            f'<item><title>{index}</title><link>/{index}</link><description>{"x" * 220}</description></item>'
            for index in range(12)) + '</channel></rss>'
        edition = build(sources, lambda url: feed.encode())
        self.assertEqual([post['source'] for post in edition['articles']], list(sources) * 8)
        self.assertEqual(edition['sources'][1]['count'], 8)
        self.assertEqual(len(edition['articles'][0]['excerpt']), 160)
        self.assertEqual(set(edition['articles'][0]), {'source', 'url', 'title', 'excerpt'})

    def test_install_manifest_matches_real_icons_and_start_page(self):
        manifest = json.loads((ASSETS / 'app.webmanifest').read_text(encoding='utf8'))
        self.assertEqual(manifest['display'], 'standalone')
        self.assertIn(manifest['start_url'][2:], FILES)
        for icon in manifest['icons']:
            raw = (ASSETS / icon['src']).read_bytes()
            self.assertEqual(raw[:8], b'\x89PNG\r\n\x1a\n')
            self.assertEqual(struct.unpack('>II', raw[16:24]), tuple(map(int, icon['sizes'].split('x'))))
