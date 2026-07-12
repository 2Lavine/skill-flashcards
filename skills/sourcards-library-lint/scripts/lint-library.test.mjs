import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  lintLibraryOrganization,
  nameSimilarity,
  normalizeName,
} from '../../../lib/org-lint.mjs';

test('normalizeName collapses punctuation/case', () => {
  assert.equal(normalizeName('  心理-学  '), '心理学');
  assert.equal(normalizeName('Cognitive Science'), 'cognitive science');
});

test('nameSimilarity exact, substring, and near bigram', () => {
  assert.equal(nameSimilarity('心理学', '心理学'), 1);
  assert.equal(nameSimilarity('认知心理学', '心理学'), 0.85);
  // bigram near-dup (shared multi-char stem), not single-char CJK typos
  assert.ok(nameSimilarity('机器学习基础', '机器学习基矗') >= 0.7);
});

test('flags empty, single, small, duplicate decks', () => {
  const result = lintLibraryOrganization({
    decks: [
      { id: '1', name: 'Default', cardCount: 0 },
      { id: '2', name: '机器学习基础', cardCount: 0 },
      { id: '3', name: '机器学习基矗', cardCount: 1 },
      { id: '4', name: '数学', cardCount: 3 },
    ],
    categories: [],
    uncategorized: [],
  });
  const types = result.issues.map((i) => i.type);
  assert.ok(types.includes('empty_deck'));
  assert.ok(types.includes('single_card_deck'));
  assert.ok(types.includes('small_deck'));
  assert.ok(types.includes('duplicate_deck_name'));
  assert.ok(
    !result.issues.some((i) => i.type === 'empty_deck' && i.detail.includes('Default')),
  );
});

test('flags category size, near-dup, cross-deck', () => {
  const result = lintLibraryOrganization({
    decks: [
      { id: 'a', name: '心理学', cardCount: 10 },
      { id: 'b', name: '神经科学', cardCount: 8 },
    ],
    categories: [
      { deckId: 'a', deckName: '心理学', category: '认知神经科学', cardCount: 1 },
      { deckId: 'a', deckName: '心理学', category: '认知神经科字', cardCount: 2 },
      { deckId: 'b', deckName: '神经科学', category: '认知神经科学', cardCount: 5 },
    ],
    uncategorized: [{ deckId: 'a', deckName: '心理学', cardCount: 3 }],
  });
  const types = new Set(result.issues.map((i) => i.type));
  assert.ok(types.has('small_category'));
  assert.ok(types.has('duplicate_category_name'));
  assert.ok(types.has('cross_deck_category'));
  assert.equal(result.summary.total_uncategorized, 3);
  assert.equal(result.summary.total_issues, result.issues.length);
});

test('clean library', () => {
  const result = lintLibraryOrganization({
    decks: [{ id: '1', name: '数学', cardCount: 20 }],
    categories: [
      { deckId: '1', deckName: '数学', category: '概率论', cardCount: 10 },
      { deckId: '1', deckName: '数学', category: '线性代数', cardCount: 10 },
    ],
  });
  assert.equal(result.issues.length, 0);
  assert.equal(result.summary.total_issues, 0);
});
