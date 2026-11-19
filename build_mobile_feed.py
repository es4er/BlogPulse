import itertools
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from blogpulse import entries, fetch


ROOT = Path(__file__).resolve().parent


def build(sources, loader=fetch, limit=8):
    def channel(item):
        key, source = item
        posts = entries(source, loader(source['url']))
        articles = [dict(source=key, url=url, title=title, excerpt=excerpt[:160])
                    for url, (title, excerpt) in itertools.islice(posts.items(), limit)]
        return {'id': key, 'name': source['name'], 'count': len(articles)}, articles

    with ThreadPoolExecutor(max_workers=4) as pool:
        channels = list(pool.map(channel, sources.items()))
    interleaved = itertools.zip_longest(*(articles for _, articles in channels))
    return {'version': 1, 'generated': datetime.now(timezone.utc).isoformat(timespec='seconds'),
            'sources': [source for source, _ in channels],
            'articles': [article for row in interleaved for article in row if article]}


if __name__ == '__main__':
    edition = build(json.loads((ROOT / 'config.json').read_text(encoding='utf8'))['sources'])
    target = ROOT / 'project_page/dist/edition.json'
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(edition, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')
    temporary.replace(target)
    print(f"Exported {len(edition['articles'])} public entries from {len(edition['sources'])} channels.")
