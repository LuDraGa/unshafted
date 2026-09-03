import { diffPolicyText, findAffectedExposures, normalizePolicyHtml, splitPolicyBlocks } from '../index.mts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import type { Exposure } from '../index.mts';

const FIXTURE_ROOT = fileURLToPath(new URL('./fixtures/site-policy/', import.meta.url));

const normalizedFixture = (group: string, name: string) =>
  normalizePolicyHtml(readFileSync(`${FIXTURE_ROOT}${group}/${name}`, 'utf8')).text;

test('blocks carry their nearest preceding heading', () => {
  const blocks = splitPolicyBlocks('# Title\n\nIntro text.\n\n## Section One\n\nBody of one.\n\nMore of one.');

  // Two headings plus three body paragraphs; a heading is itself a block, so rewording one
  // registers as a change.
  assert.equal(blocks.length, 5);
  assert.equal(blocks[0]?.text, '# Title');
  assert.equal(blocks[1]?.heading, 'Title');
  assert.equal(blocks[1]?.text, 'Intro text.');
  assert.equal(blocks[3]?.heading, 'Section One');
  assert.equal(blocks[4]?.heading, 'Section One');
  assert.equal(blocks[4]?.text, 'More of one.');
});

test('diffing an unchanged document reports nothing', () => {
  const text = normalizedFixture('stable', 'nav-markup.a.html');
  const diff = diffPolicyText(text, text);

  assert.equal(diff.hasChanges, false);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.changedHeadings, []);
});

test('diffing survives cosmetic markup changes', () => {
  const diff = diffPolicyText(
    normalizedFixture('stable', 'nav-markup.a.html'),
    normalizedFixture('stable', 'nav-markup.b.html'),
  );

  assert.equal(diff.hasChanges, false);
});

test('diffing names the section that actually changed', () => {
  const diff = diffPolicyText(
    normalizedFixture('changed', 'arbitration-reworded.a.html'),
    normalizedFixture('changed', 'arbitration-reworded.b.html'),
  );

  assert.equal(diff.hasChanges, true);
  assert.deepEqual(diff.changedHeadings, ['3. Binding arbitration']);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.removed.length, 1);
  assert.ok(diff.unchangedCount > 5, 'unrelated sections should be untouched');
});

test('diffing distinguishes an addition from a removal', () => {
  const added = diffPolicyText(
    normalizedFixture('changed', 'clause-added.a.html'),
    normalizedFixture('changed', 'clause-added.b.html'),
  );
  assert.ok(added.added.length > 0);

  const removed = diffPolicyText(
    normalizedFixture('changed', 'clause-removed.a.html'),
    normalizedFixture('changed', 'clause-removed.b.html'),
  );
  assert.ok(removed.removed.length > 0);
  assert.equal(removed.added.length, 0);
});

test('a changed "last updated" date is reported as a change', () => {
  const diff = diffPolicyText(
    normalizedFixture('changed', 'date-updated.a.html'),
    normalizedFixture('changed', 'date-updated.b.html'),
  );
  assert.equal(diff.hasChanges, true);
});

const arbitrationExposure: Exposure = {
  title: 'Binding individual arbitration',
  severity: 'high',
  category: 'Disputes',
  whatItMeans: 'Disputes go to arbitration.',
  whyItMatters: 'You give up class actions.',
  reference: { label: '3. Binding arbitration', quote: 'resolved by binding individual' },
};

const retentionExposure: Exposure = {
  title: 'Long data retention',
  severity: 'medium',
  category: 'Data/Privacy',
  whatItMeans: 'Data is kept after closure.',
  whyItMatters: 'Your data outlives your account.',
  reference: { label: '4. Data retention', quote: '24 months thereafter' },
};

test('affected exposures are found by quoted clause', () => {
  const diff = diffPolicyText(
    normalizedFixture('changed', 'arbitration-reworded.a.html'),
    normalizedFixture('changed', 'arbitration-reworded.b.html'),
  );

  const affected = findAffectedExposures(diff, [arbitrationExposure, retentionExposure]);
  assert.deepEqual(
    affected.map(exposure => exposure.title),
    ['Binding individual arbitration'],
  );
});

test('affected exposures are empty when nothing changed', () => {
  const text = normalizedFixture('stable', 'nav-markup.a.html');
  assert.deepEqual(findAffectedExposures(diffPolicyText(text, text), [arbitrationExposure]), []);
});

test('exposure matching ignores whitespace and casing differences', () => {
  const diff = diffPolicyText('# A\n\nold body', '# A\n\nRESOLVED   BY Binding Individual arbitration now');
  const affected = findAffectedExposures(diff, [arbitrationExposure]);
  assert.equal(affected.length, 1);
});
