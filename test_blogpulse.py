import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

import blogpulse as app


class PipelineTests(unittest.TestCase):
    def test_formats(self):
        source = {'url': 'https://example.org'}
        atom = b'<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Hello</title><link rel="self" href="/xml"/><link href="/post"/><summary>Evidence</summary></entry></feed>'
        self.assertEqual(app.entries(source, atom), {'https://example.org/post': ('Hello', 'Evidence')})
        source['selector'] = 'main a'
        self.assertEqual(app.entries(source, b'<main><a href="/post">Hello</a><a href="/post">Read more</a></main>'),
                         {'https://example.org/post': ('Hello', '')})
        with self.assertRaises(ValueError):
            app.entries(source, b'<main>unavailable</main>')

    def test_pipeline_with_restart(self):
        posts = ['old']
        calls = []
        rejected = [True]

        class Server(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                self.send_response(200)
                self.end_headers()
                if self.path == '/feed':
                    items = ''.join(f'<item><title>{post}</title><link>/{post}</link></item>' for post in posts)
                    self.wfile.write(f'<rss><channel>{items}</channel></rss>'.encode())
                else:
                    self.wfile.write(b'<article><p>Source material.</p></article>')

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                calls.append((self.path, body))
                self.send_response(503 if self.path == '/second' and rejected[0] else 200)
                self.end_headers()
                if self.path == '/chat/completions':
                    self.wfile.write(b'{"choices":[{"message":{"content":"Summary"}}]}')

        server = ThreadingHTTPServer(('127.0.0.1', 0), Server)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        base = f'http://127.0.0.1:{server.server_port}'
        config = {'sources': {'one': {'url': base + '/feed', 'name': 'Example'}},
                  'subscriptions': {name: {'channel': 'webhook', 'sources': ['one'], 'url_env': name}
                                    for name in ('first', 'second')}}
        config['subscriptions']['unsubscribed'] = {'channel': 'webhook', 'sources': [], 'url_env': 'unused'}
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {
                'AI_MODEL': 'test', 'AI_API_KEY': 'dummy', 'AI_BASE_URL': base,
                'first': base + '/first', 'second': base + '/second', 'NO_PROXY': '127.0.0.1'}):
            path = Path(directory) / 'db.sqlite3'
            db = app.database(path)
            try:
                self.assertEqual(app.cycle(config, db), 0)
                self.assertFalse(calls)
                posts.insert(0, 'new')
                self.assertEqual(app.cycle(config, db), 1)
            finally:
                db.close()
            rejected[0] = False
            db = app.database(path)
            try:
                self.assertEqual(app.cycle(config, db), 0)
                self.assertEqual(app.cycle(config, db), 0)
            finally:
                db.close()
        self.assertEqual([path for path, body in calls], ['/chat/completions', '/first', '/second', '/second'])
        self.assertIn('Source material.', calls[0][1]['messages'][1]['content'])
        self.assertEqual(calls[1][1]['summary'], 'AI 摘要：Summary')

    def test_without_model(self):
        with patch.dict(os.environ, {'AI_MODEL': ''}):
            self.assertTrue(app.summarize('Title', 'unused', 'material ' * 40).startswith('原文节选：'))

    def test_directory_sources_extract_only_headlines(self):
        config = json.loads(Path(__file__).with_name('config.json').read_text(encoding='utf8'))
        for key, markup in {
            'tml': '<main><a href="/blog/p/"><h2>Headline</h2>Author</a></main>',
            'cursor': '<a class="blog-directory__row" href="/blog/p"><time>Date</time><p>Headline</p></a>',
            'lmsys': '<a href="/blog/p"><h3>Headline</h3><p>Description</p></a>',
        }.items():
            with self.subTest(key=key):
                parsed = app.entries(config['sources'][key], markup)
                self.assertEqual(list(parsed.values()), [('Headline', '')])

    def test_high_volume_links_skip_article_and_ai_calls(self):
        config = json.loads(Path(__file__).with_name('config.json').read_text(encoding='utf8'))
        config['sources'] = {'hackernews': config['sources']['hackernews']}
        feed = '<rss><channel><item><title>{0}</title><link>https://example.org/{0}</link><description>Comments</description></item></channel></rss>'
        db = app.database(':memory:')
        self.addCleanup(db.close)
        with patch.object(app, 'fetch', side_effect=[feed.format('first'), feed.format('next')]), patch.object(app, 'summarize') as model, patch.object(app, 'deliver') as send:
            self.assertEqual(app.cycle(config, db), 0)
            self.assertEqual(app.cycle(config, db), 0)
            model.assert_not_called()
            self.assertEqual(send.call_count, 1)
            self.assertIn('仅收录链接', send.call_args.args[1]['summary'])
