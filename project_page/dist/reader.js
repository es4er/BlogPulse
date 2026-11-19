import {cardKey, notebook, snapshot} from './notebook.mjs';
import {mode, appPath} from './mobile.mjs';

const byId = id => document.getElementById(id);
const local = document.documentElement.dataset.mode === 'local';
const shelf = notebook(document.documentElement.dataset.mode);
const libraryUrl = appPath('library.html');
byId('my-library').href = libraryUrl;
let saved = new Set();
async function syncShelf() {
  try {
    saved = new Set(await shelf.keys());
    document.querySelectorAll('.collect').forEach(button => markButton(button));
  } catch {}
}
function markButton(button) {
  button.textContent = saved.has(button.dataset.key) ? '已收录 · 写笔记' : '＋ 加入知识库';
}
window.addEventListener('pageshow', syncShelf);
window.addEventListener('focus', syncShelf);
let selected = '', page = 1, sequence = 0, timer;
byId('mode').textContent = local ? '读取本机 SQLite 文章库，按收录顺序倒序展示。' : mode === 'demo' ? '用十个频道的固定样例体验阅读流程。' : '从十个公开频道挑选文章，收藏到自己的知识库。';
byId('badge').textContent = local ? 'LOCAL / 本机档案' : mode === 'demo' ? 'DEMO / 示例档案' : 'POCKET / 随身版';
byId('refresh').hidden = mode === 'demo';
let edition;
async function pocket(query) {
  edition ??= fetch('./edition.json', {cache: 'no-cache'}).then(async response => {
    if (!response.ok) throw Error('Edition unavailable');
    const data = await response.json();
    if (data.version !== 1 || !Array.isArray(data.articles)) throw Error('Invalid edition');
    return data;
  }).catch(error => { edition = null; throw error; });
  const data = await edition;
  const results = data.articles.filter(post => (!selected || post.source === selected) && post.title.toLowerCase().includes(query.toLowerCase()));
  const size = 18;
  byId('mode').textContent = '公开来源快照 · ' + new Date(data.generated).toLocaleString('zh-CN', {dateStyle:'medium', timeStyle:'short'}) + ' 采集，非实时订阅。';
  return {sources:data.sources, total:results.length, page, size, articles:results.slice((page-1)*size,page*size)};
}
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
  const kind = mode === 'demo' ? '示例导读' : isAI ? 'AI 摘要' : (post.excerpt || post.summary?.startsWith('原文节选：')) ? '原文节选' : '链接存档';
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
  const button = element('button', '', 'collect');
  button.dataset.key = cardKey(post.source, post.url);
  markButton(button);
  const message = element('span', '', 'collect-status');
  message.setAttribute('role', 'status');
  button.onclick = async () => {
    if (saved.has(button.dataset.key)) {
      location.href = libraryUrl + '#' + encodeURIComponent(button.dataset.key);
      return;
    }
    button.disabled = true;
    try {
      await shelf.collect(snapshot(post, names.get(post.source) || post.source, mode === 'demo'));
      saved.add(button.dataset.key);
      markButton(button);
      message.textContent = '已保存';
    } catch { message.textContent = '无法保存，请检查浏览器存储权限或空间。'; }
    finally { button.disabled = false; }
  };
  card.append(button, message);
  return card;
}
function render(data) {
  page = data.page;
  const names = new Map(data.sources.map(source => [source.id, source.name]));
  const total = data.sources.reduce((sum, source) => sum + source.count, 0);
  const channels = [{id: '', name: '全部频道', count: total}, ...data.sources];
  const filter = byId('phone-source');
  filter.replaceChildren(...channels.map(source => new Option(source.name + ' · ' + source.count, source.id)));
  filter.value = selected;
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
    } else data = mode === 'demo' ? demo(query) : await pocket(query);
    if (request === sequence) render(data);
  } catch {
    if (request === sequence) {
      byId('list').replaceChildren(element('p', local ? '无法读取本机档案。请确认 web 服务正在运行，然后刷新重试。离线时仍可打开已缓存的知识库。' : '没有可用的文章快照，请联网刷新；已收藏的卡片仍在知识库中。', 'notice'));
      byId('count').textContent = '连接失败';
      document.querySelector('.paging').hidden = true;
    }
  } finally {
    if (request === sequence) byId('list').setAttribute('aria-busy', 'false');
  }
}
byId('search').oninput = () => { clearTimeout(timer); page = 1; timer = setTimeout(load, 160); };
byId('phone-source').onchange = event => { selected = event.target.value; page = 1; load(); };
byId('refresh').onclick = () => { edition = null; page = 1; load(); };
byId('prev').onclick = () => { page--; load(); };
byId('next').onclick = () => { page++; load(); };
load();
