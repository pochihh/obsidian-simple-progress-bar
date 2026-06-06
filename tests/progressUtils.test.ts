import test from 'node:test';
import * as assert from 'node:assert/strict';
import { countMarkdownCheckboxes, countCheckboxesInSection } from '../progressUtils';

test('countMarkdownCheckboxes counts checked and unchecked markdown tasks', () => {
	const result = countMarkdownCheckboxes([
		'- [ ] unchecked',
		'- [x] checked lower',
		'* [X] checked upper',
		'+ [ ] another unchecked',
		'- not a task'
	].join('\n'));

	assert.deepEqual(result, { total: 4, checked: 2 });
});

test('countCheckboxesInSection counts tasks under the heading above a bar', () => {
	const content = [
		'# Project',
		'- [x] outside parent but still in Project',
		'## Alpha',
		'```sp-bar',
		'Alpha progress',
		'```',
		'- [x] done',
		'- [ ] todo',
		'### Nested',
		'- [x] nested done',
		'## Beta',
		'- [ ] beta task'
	].join('\n');

	assert.deepEqual(countCheckboxesInSection(content, 3), { total: 3, checked: 2 });
});

test('countCheckboxesInSection counts the entire document when the bar has no preceding heading', () => {
	const content = [
		'```sp-bar',
		'Whole note',
		'```',
		'- [x] done',
		'## Later',
		'- [ ] todo'
	].join('\n');

	assert.deepEqual(countCheckboxesInSection(content, 0), { total: 2, checked: 1 });
});
