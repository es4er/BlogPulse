import assert from 'node:assert/strict';
import test from 'node:test';
import {backup, markdown, parseBackup, relatedCards, selectCards, snapshot, tagsFrom} from './project_page/dist/notebook.mjs';

const card = snapshot({source: 'lilian', url: 'https://example.org/article', title: 'Agent memory', excerpt: 'Example excerpt'}, 'Lil’Log');
const written = {...card, tags: ['记忆', 'agent'], note: '用检索代替重复阅读。'};

test('snapshot retains provenance and distinguishes excerpts from demo material', () => {
  assert.equal(card.digest, '原文节选：Example excerpt');
  assert.equal(snapshot({...card, summary: 'Example'}, 'Blog', true).digest, '示例导读：Example');
  assert.deepEqual(tagsFrom('Agent, 记忆， agent'), ['agent', '记忆']);
  assert.throws(() => tagsFrom('x'.repeat(49)));
});

test('search combines notes, title, tags and inbox stage', () => {
  assert.deepEqual(selectCards([written], 'agent 检索', '记忆', 'written'), [written]);
  assert.deepEqual(selectCards([written], '', 'agent', 'inbox'), []);
  assert.deepEqual(selectCards([card], 'excerpt', '', 'inbox'), [card]);
});

test('related notes exclude self and rank by shared tags', () => {
  const single = {...written, id: 'single', tags: ['agent']};
  const both = {...written, id: 'both'};
  assert.deepEqual(relatedCards(written, [single, written, both, {...card, id: 'other'}]), [both, single]);
});

test('JSON round-trip preserves notes, ignores supplied ids and rejects invalid records', () => {
  assert.deepEqual(parseBackup(backup([written])), [written]);
  const data = JSON.parse(backup([written]));
  data.cards[0].id = 'bogus';
  assert.equal(parseBackup(JSON.stringify(data))[0].id, written.id);
  data.cards.push({...written, url: 'file:///invalid'});
  assert.throws(() => parseBackup(JSON.stringify(data)));
  assert.throws(() => parseBackup('{"version":2}'));
});

test('Markdown preserves source, quoted material and the user’s own words separately', () => {
  const output = markdown([written]);
  for (const phrase of [card.title, card.url, 'Lil’Log', '> 原文节选：', '### 我的理解', written.note, '记忆']) {
    assert.ok(output.includes(phrase));
  }
});
