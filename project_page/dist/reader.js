const byId = id => document.getElementById(id);
const local = document.documentElement.dataset.mode === 'local';
let selected = '', page = 1, sequence = 0, timer;
byId('mode').textContent = local ? '读取本机 SQLite 文章库，按收录顺序倒序展示。' : '用十个频道的固定样例体验阅读流程，不连接本机数据，也不发送推送。';
byId('badge').textContent = local ? 'LOCAL / 本机档案' : 'DEMO / 示例档案';
byId('refresh').hidden = !local;
function element(tag, text, style) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (style) node.className = style;
  return node;
}
function demo(query) {
  const sources = examples.map(([id, name]) => ({id, name, count: 1}));
  const articles = examples.filter(([id, , title]) => (!selected || id === selected) && title.toLowerCase().includes(query.toLowerCase()))
    .map(([source, , title, url, summary]) => ({source, title, url, summary}));
  return {sources, articles, total: articles.length, size: 18, page: 1};
}
function article(post, names) {
  const card = document.createElement('article');
  const meta = element('div', '', 'post-meta');
  const isAI = post.summary?.startsWith('AI 摘要：');
  const kind = !local ? '示例导读' : isAI ? 'AI 摘要' : (post.excerpt || post.summary?.startsWith('原文节选：')) ? '原文节选' : '链接存档';
  meta.append(element('span', names.get(post.source) || post.source), element('small', kind));
  const heading = element('h3', '');
  const link = element('a', post.title);
  if (/^https?:\/\//i.test(post.url)) {
    link.href = post.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  heading.append(link);
  card.append(meta, heading, element('p', (post.summary || post.excerpt || '尚无摘要，点击标题阅读原文。').replace(/^(AI 摘要：|原文节选：)/, '')));
  return card;
}
function render(data) {
  page = data.page;
  const names = new Map(data.sources.map(source => [source.id, source.name]));
  const total = data.sources.reduce((sum, source) => sum + source.count, 0);
  const channels = [{id: '', name: '全部频道', count: total}, ...data.sources];
  const focused = document.activeElement?.dataset.channel;
  byId('sources').replaceChildren(...channels.map(source => {
    const button = element('button', '');
    button.append(element('span', source.name), element('small', source.count));
    button.dataset.channel = source.id;
    button.setAttribute('aria-pressed', String(source.id === selected));
    button.onclick = () => { selected = source.id; page = 1; load(); };
    return button;
  }));
  if (focused !== undefined) Array.from(byId('sources').children).find(button => button.dataset.channel === focused)?.focus();
  byId('selection').textContent = names.get(selected) || '全部文章';
  byId('count').textContent = data.total + ' 篇';
  byId('list').replaceChildren(...data.articles.map(post => article(post, names)));
  if (!data.total) byId('list').append(element('p', total ? '没有匹配的文章。试试其他关键词或切换频道。' : '档案库尚为空。在另一终端运行 py blogpulse.py once 后刷新。', 'notice'));
  const pages = Math.max(1, Math.ceil(data.total / data.size));
  document.querySelector('.paging').hidden = pages < 2;
  byId('prev').disabled = page === 1;
  byId('next').disabled = page === pages;
  byId('page').textContent = page + ' / ' + pages;
}
async function load() {
  const request = ++sequence;
  const query = byId('search').value.trim();
  byId('list').setAttribute('aria-busy', 'true');
  try {
    let data;
    if (local) {
      const params = new URLSearchParams({q: query, source: selected, page});
      const result = await fetch('./api/articles?' + params, {cache: 'no-store'});
      if (!result.ok) throw new Error();
      data = await result.json();
    } else data = demo(query);
    if (request === sequence) render(data);
  } catch {
    if (request === sequence) {
      byId('list').replaceChildren(element('p', '无法读取本机档案。请确认 web 服务正在运行，然后刷新重试。', 'notice'));
      byId('count').textContent = '连接失败';
      document.querySelector('.paging').hidden = true;
    }
  } finally {
    if (request === sequence) byId('list').setAttribute('aria-busy', 'false');
  }
}
byId('search').oninput = () => { clearTimeout(timer); page = 1; timer = setTimeout(load, 160); };
byId('refresh').onclick = load;
byId('prev').onclick = () => { page--; load(); };
byId('next').onclick = () => { page++; load(); };
load();
