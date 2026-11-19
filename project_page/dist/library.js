import {backup, markdown, notebook, relatedCards, selectCards} from './notebook.mjs';
import {mode, appPath} from './mobile.mjs';

const scope = document.documentElement.dataset.mode;
const shelf = notebook(scope);
const readerUrl = appPath('reader.html');
const byId = id => document.getElementById(id);
const dialog = byId('editor');
let cards = [], tag = '', stage = '', limit = 24, editing = null, busy = false;
byId('scope').textContent = mode === 'local' ? '本机阅读台 · 浏览器私藏' : '随身阅读台 · 本设备私藏';
document.querySelector('[data-reader]').href = readerUrl;

function node(tagName, text, className) {
  const item = document.createElement(tagName);
  item.textContent = text;
  if (className) item.className = className;
  return item;
}
function action(text, click) {
  const button = node('button', text);
  button.type = 'button';
  button.onclick = click;
  return button;
}
function chooseTag(value) {
  tag = value;
  limit = 24;
  render();
}
function render() {
  const topics = new Map();
  for (const card of cards) for (const topic of card.tags) topics.set(topic, (topics.get(topic) || 0) + 1);
  if (!topics.has(tag)) tag = '';
  const options = [['', cards.length], ...Array.from(topics).sort(([first], [second]) => first.localeCompare(second, 'zh'))];
  const focus = document.activeElement?.dataset.topic;
  byId('topics').replaceChildren(...options.map(([topic, count]) => {
    const button = action('', () => chooseTag(topic));
    button.append(node('span', topic || '所有主题'), node('small', count));
    button.dataset.topic = topic;
    button.setAttribute('aria-pressed', String(topic === tag));
    return button;
  }));
  if (focus !== undefined) Array.from(byId('topics').children).find(button => button.dataset.topic === focus)?.focus();
  document.querySelectorAll('[data-stage]').forEach(button => button.setAttribute('aria-pressed', String(stage === button.dataset.stage)));
  const results = selectCards(cards, byId('query').value, tag, stage);
  byId('count').textContent = results.length + ' / ' + cards.length + ' 张';
  const list = byId('cards');
  list.replaceChildren();
  for (const card of results.slice(0, limit)) {
    const entry = node('article', '', 'knowledge-card');
    const meta = node('div', '', 'post-meta');
    meta.append(node('span', card.sourceName), node('small', card.note.trim() ? '已写笔记' : '待整理'));
    const title = node('h3', '');
    title.append(action(card.title, () => edit(card)));
    entry.append(meta, title, node('p', card.note.trim() || card.digest || '还没有笔记，点击标题开始整理。', 'preview-note'));
    const trail = node('div', '', 'trail');
    for (const topic of card.tags) trail.append(action('# ' + topic, () => chooseTag(topic)));
    trail.append(node('small', '更新于 ' + new Date(card.updated).toLocaleDateString('zh-CN')));
    entry.append(trail);
    list.append(entry);
  }
  if (!results.length) {
    list.append(node('p', cards.length ? '没有匹配的卡片。' : '还没有知识卡片。在阅读台找到一篇想留下的文章，点击「加入知识库」。', 'notice'));
    if (cards.length) list.append(action('清除筛选', () => { byId('query').value = ''; stage = ''; chooseTag(''); }));
    else {
      const link = node('a', '去阅读台选文章', 'text-link');
      link.href = readerUrl;
      list.append(link);
    }
  }
  byId('more').hidden = results.length <= limit;
  byId('backup').disabled = byId('markdown').disabled = !cards.length;
}

async function refresh() {
  cards = await shelf.all();
  render();
}
function dirty() {
  return editing && (byId('note').value !== editing.note || byId('tags').value !== editing.tags.join('，'));
}
function mayDiscard() {
  return !busy && (!dirty() || confirm('放弃未保存的修改？'));
}
function edit(card) {
  if (editing && !mayDiscard()) return;
  editing = card;
  byId('card-title').textContent = card.title;
  byId('original').href = card.url;
  byId('original').textContent = card.sourceName + ' · 阅读原文';
  byId('digest').textContent = card.digest || '这篇文章只有原文链接。';
  byId('note').value = card.note;
  byId('tags').value = card.tags.join('，');
  byId('edit-status').textContent = '';
  const related = relatedCards(card, cards);
  byId('related').replaceChildren();
  if (related.length) {
    byId('related').append(node('strong', '同主题卡片'));
    for (const item of related) byId('related').append(action(item.title, () => edit(item)));
  }
  if (!dialog.open) dialog.showModal();
  byId('note').focus();
}
function closeEditor() {
  editing = null;
  dialog.close();
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}
byId('close').onclick = () => { if (mayDiscard()) closeEditor(); };
dialog.oncancel = event => { event.preventDefault(); if (mayDiscard()) closeEditor(); };
window.addEventListener('beforeunload', event => {
  if (dirty()) { event.preventDefault(); event.returnValue = ''; }
});
async function change(remove) {
  if (busy || !editing) return;
  if (remove && !confirm('移出这篇文章并删除它的私人笔记？原文章仍保留在阅读台。')) return;
  busy = true;
  byId('save').disabled = byId('remove').disabled = true;
  try {
    if (remove) await shelf.remove(editing);
    else await shelf.update(editing, byId('note').value, byId('tags').value);
    closeEditor();
    await refresh();
    byId('status').textContent = remove ? '已移出知识库。' : '笔记与标签已保存。';
  } catch (error) {
    (dialog.open ? byId('edit-status') : byId('status')).textContent = error.message || '操作未完成，请重试。';
  } finally {
    busy = false;
    byId('save').disabled = byId('remove').disabled = false;
  }
}
byId('form').onsubmit = event => { event.preventDefault(); change(false); };
byId('remove').onclick = () => change(true);
byId('query').oninput = () => { limit = 24; render(); };
document.querySelectorAll('[data-stage]').forEach(button => button.onclick = () => { stage = button.dataset.stage; limit = 24; render(); });
byId('more').onclick = () => { limit += 24; render(); };

async function download(kind) {
  try {
    const all = await shelf.all();
    const json = kind === 'json';
    const blob = new Blob([json ? backup(all) : markdown(all)], {type: json ? 'application/json' : 'text/markdown;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'BlogPulse-' + new Date().toISOString().slice(0, 10) + '.' + kind;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    byId('status').textContent = '已准备下载 ' + all.length + ' 张卡片。';
  } catch { byId('status').textContent = '导出失败，请检查浏览器设置。'; }
}
byId('backup').onclick = () => download('json');
byId('markdown').onclick = () => download('md');
byId('restore').onclick = () => byId('file').click();
byId('file').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const added = await shelf.restore(await file.text());
    await refresh();
    byId('status').textContent = '已导入 ' + added + ' 张新卡片；已有卡片保持不变。';
  } catch (error) { byId('status').textContent = '导入失败：' + error.message; }
  finally { event.target.value = ''; }
};
async function reload(deepLink = false) {
  try {
    await refresh();
    if (deepLink && location.hash) {
      const selected = cards.find(card => card.id === decodeURIComponent(location.hash.slice(1)));
      if (selected) edit(selected);
      else byId('status').textContent = '这张卡片不在当前知识库中。';
    }
  } catch { byId('status').textContent = '无法读取知识库，请检查浏览器是否允许此站点保存数据。'; }
}
window.addEventListener('focus', () => { if (!editing) reload(); });
window.addEventListener('pageshow', event => { if (event.persisted && !editing) reload(); });
reload(true);
