const format = 'blogpulse-notebook';
export const cardKey = (source, url) => JSON.stringify([source, url]);

export function tagsFrom(input) {
  const tags = typeof input === 'string' ? input.split(/[,，、\n]/) : input;
  if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string')) throw Error('标签格式不正确。');
  const result = [...new Set(tags.map(tag => tag.trim().toLowerCase()).filter(Boolean))];
  if (result.length > 20 || result.some(tag => tag.length > 48 || /[,，、\n]/.test(tag))) {
    throw Error('每张卡片最多 20 个标签，每个不超过 48 个字符。');
  }
  return result;
}

function checkCard(raw) {
  if (!raw || ['source', 'sourceName', 'url', 'title', 'digest', 'note', 'created', 'updated'].some(
    key => typeof raw[key] !== 'string')) throw Error('卡片字段不完整。');
  const {source, sourceName, url, title, digest, note, created, updated} = raw;
  if (!source.trim() || !title.trim() || !/^https?:\/\//i.test(url) ||
      !Number.isFinite(Date.parse(created)) || !Number.isFinite(Date.parse(updated))) throw Error('卡片地址、标题或时间无效。');
  new URL(url);
  if (note.length > 30000) throw Error('笔记不能超过 30000 个字符。');
  return {id: cardKey(source, url), source, sourceName, url, title, digest, note,
    tags: tagsFrom(raw.tags), created, updated};
}

export function snapshot(post, sourceName, demo = false) {
  const stamp = new Date().toISOString();
  const digest = post.summary ? (demo ? '示例导读：' : '') + post.summary :
    post.excerpt ? '原文节选：' + post.excerpt : '';
  return checkCard({...post, sourceName, digest, note: '', tags: [], created: stamp, updated: stamp});
}

export function selectCards(cards, query = '', tag = '', stage = '') {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return cards.filter(card => {
    const written = Boolean(card.note.trim());
    if ((tag && !card.tags.includes(tag)) || (stage === 'inbox' && written) || (stage === 'written' && !written)) return false;
    const text = [card.title, card.sourceName, card.digest, card.note, ...card.tags].join('\n').toLowerCase();
    return words.every(word => text.includes(word));
  }).sort((first, second) => Date.parse(second.updated) - Date.parse(first.updated) || first.id.localeCompare(second.id));
}

export function relatedCards(card, cards) {
  return selectCards(cards).filter(item => item.id !== card.id)
    .map(item => ({item, score: item.tags.filter(tag => card.tags.includes(tag)).length}))
    .filter(match => match.score).sort((first, second) => second.score - first.score)
    .slice(0, 4).map(match => match.item);
}

export function backup(cards) {
  return JSON.stringify({format, version: 1, cards: cards.map(checkCard)}, null, 2);
}

export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw Error('不是有效的 JSON 备份。'); }
  if (data?.format !== format || data.version !== 1 || !Array.isArray(data.cards)) throw Error('不是支持的 BlogPulse 知识库备份。');
  return data.cards.map(checkCard);
}

export function markdown(cards) {
  const inline = text => text.replace(/[\r\n]+/g, ' ').replace(/([\\`*_{}\[\]<>#!|])/g, '\\$1');
  const sections = selectCards(cards).map(card => [
    '## ' + inline(card.title), '来源：' + inline(card.sourceName) + ' · [阅读原文](<' +
      new URL(card.url).href.replace(/[<>]/g, char => encodeURIComponent(char)) + '>)',
    '收录：' + card.created.slice(0, 10) + (card.tags.length ? ' · 标签：' + card.tags.map(inline).join('、') : ''),
    '### 文章材料', (card.digest || '无摘要。').split(/\r?\n/).map(line => '> ' + inline(line)).join('\n'),
    '### 我的理解', card.note.trim() || '（尚未撰写）'
  ].join('\n\n'));
  return ['# 我的 BlogPulse 知识库', ...sections].join('\n\n---\n\n') + '\n';
}

const request = task => new Promise((resolve, reject) => {
  task.onsuccess = () => resolve(task.result);
  task.onerror = () => reject(task.error);
});

export function notebook(scope) {
  let opened;
  async function run(mode, work) {
    if (!opened) {
      const task = indexedDB.open('blogpulse-notebook-v1-' + scope, 1);
      task.onupgradeneeded = () => task.result.createObjectStore('cards', {keyPath: 'id'});
      opened = request(task).catch(error => { opened = null; throw error; });
    }
    const db = await opened;
    const transaction = db.transaction('cards', mode);
    const finished = new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error || Error('保存被取消。'));
    });
    try {
      const result = await work(transaction.objectStore('cards'));
      await finished;
      return result;
    } catch (error) {
      try { transaction.abort(); } catch {}
      await finished.catch(() => {});
      throw error;
    }
  }
  async function insertMissing(cards) {
    return run('readwrite', async store => {
      let added = 0;
      for (const card of cards) {
        if (await request(store.getKey(card.id)) !== undefined) continue;
        await request(store.add({...card, revision: 1}));
        added++;
      }
      return added;
    });
  }
  function revise(card, changes) {
    return run('readwrite', async store => {
      const current = await request(store.get(card.id));
      if (!current || current.revision !== card.revision || current.updated !== card.updated) {
        throw Error('卡片已在另一页面更改。请保留你的草稿，关闭并刷新后再试。');
      }
      if (!changes) return request(store.delete(card.id));
      const next = checkCard({...current, note: changes.note, tags: changes.tags, updated: new Date().toISOString()});
      return request(store.put({...next, revision: current.revision + 1}));
    });
  }
  return {
    all: () => run('readonly', store => request(store.getAll())),
    keys: () => run('readonly', store => request(store.getAllKeys())),
    collect: card => insertMissing([checkCard(card)]),
    restore: text => insertMissing(parseBackup(text)),
    update: (card, note, tags) => revise(card, {note, tags: tagsFrom(tags)}),
    remove: card => revise(card, null)
  };
}
