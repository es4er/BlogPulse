import json
import sqlite3
from contextlib import closing
from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


ASSETS = Path(__file__).resolve().parent / 'project_page' / 'dist'
FILES = {'index.html': 'text/html', 'reader.html': 'text/html', 'station.css': 'text/css',
         'station.js': 'application/javascript', 'reader.js': 'application/javascript',
         'observatory.svg': 'image/svg+xml', 'mark.svg': 'image/svg+xml', 'catalog.js': 'application/javascript'}
PAGE_SIZE = 18
FILES.update({'library.html': 'text/html', 'library.js': 'application/javascript',
              'notebook.mjs': 'application/javascript', 'notebook.css': 'text/css'})
FILES.update({'app.webmanifest': 'application/manifest+json', 'sw.js': 'application/javascript',
              'mobile.mjs': 'application/javascript', 'mobile.css': 'text/css',
              'edition.json': 'application/json', **{f'icon-{size}.png': 'image/png' for size in (180, 192, 512)}})


def catalog(db, sources, source='', query='', page=1):
    counts = dict(db.execute('SELECT source, count(*) FROM article GROUP BY source'))
    options = [{'id': key, 'name': value.get('name', key), 'count': counts.pop(key, 0)}
               for key, value in sources.items()]
    options.extend({'id': key, 'name': key, 'count': count} for key, count in counts.items())
    where = "WHERE (?='' OR source=?) AND instr(lower(title), lower(?))>0"
    params = (source, source, query)
    total, = db.execute('SELECT count(*) FROM article ' + where, params).fetchone()
    page = min(max(1, page), max(1, (total + PAGE_SIZE - 1) // PAGE_SIZE))
    rows = db.execute('SELECT source, url, title, summary, substr(excerpt,1,360) FROM article '
                      + where + ' ORDER BY rowid DESC LIMIT ? OFFSET ?',
                      (*params, PAGE_SIZE, (page - 1) * PAGE_SIZE))
    return dict(sources=options, total=total, page=page, size=PAGE_SIZE,
                articles=[dict(source=key, url=url, title=title, summary=summary, excerpt=excerpt)
                          for key, url, title, summary, excerpt in rows])


class ReaderHandler(BaseHTTPRequestHandler):
    def __init__(self, *args, db_path, sources, **kwargs):
        self.db_path = db_path
        self.sources = sources
        super().__init__(*args, **kwargs)

    def do_GET(self):
        parts = urlsplit(self.path)
        if parts.path == '/api/articles':
            params = parse_qs(parts.query)
            try:
                page = int(params.get('page', ['1'])[0])
            except ValueError:
                return self.send_error(400, 'Invalid page')
            try:
                with closing(sqlite3.connect(Path(self.db_path).resolve().as_uri() + '?mode=ro', uri=True)) as db:
                    result = catalog(db, self.sources, params.get('source', [''])[0],
                                     params.get('q', [''])[0], page)
            except sqlite3.Error:
                return self.send_error(503, 'Archive unavailable')
            data = json.dumps(result, ensure_ascii=False).encode()
            mime = 'application/json'
        else:
            name = 'index.html' if parts.path == '/' else parts.path[1:]
            if name not in FILES:
                return self.send_error(404)
            mime = FILES[name]
            data = (ASSETS / name).read_bytes()
            if name in ('reader.html', 'library.html') and 'demo' not in parse_qs(parts.query, keep_blank_values=True):
                data = data.replace(b'data-mode="demo"', b'data-mode="local"')
        self.send_response(200)
        self.send_header('Content-Type', mime + '; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)


def serve(path, sources, port):
    handler = partial(ReaderHandler, db_path=path, sources=sources)
    with ThreadingHTTPServer(('127.0.0.1', port), handler) as server:
        print(f'BlogPulse: http://127.0.0.1:{port}/reader.html', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
