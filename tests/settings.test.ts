import test from 'node:test';
import * as assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, sanitizeProgressBarSettings } from '../settings';

test('sanitizeProgressBarSettings migrates legacy shared width and height to note and inline settings', () => {
	const settings = sanitizeProgressBarSettings({
		showNoteProgressBar: false,
		barWidth: 45,
		barHeight: 12
	});

	assert.equal(settings.showNoteProgressBar, false);
	assert.equal(settings.showInlineProgressBar, DEFAULT_SETTINGS.showInlineProgressBar);
	assert.equal(settings.noteBarWidth, 45);
	assert.equal(settings.inlineBarWidth, 45);
	assert.equal(settings.noteBarHeight, 12);
	assert.equal(settings.inlineBarHeight, 12);
});

test('sanitizeProgressBarSettings preserves valid fields while defaulting invalid fields', () => {
	const settings = sanitizeProgressBarSettings({
		showInlineProgressBar: false,
		noteBarWidth: 55,
		noteBarHeight: 999,
		inlineBarWidth: 'wide',
		inlineBarHeight: 9
	});

	assert.equal(settings.showInlineProgressBar, false);
	assert.equal(settings.noteBarWidth, 55);
	assert.equal(settings.noteBarHeight, DEFAULT_SETTINGS.noteBarHeight);
	assert.equal(settings.inlineBarWidth, DEFAULT_SETTINGS.inlineBarWidth);
	assert.equal(settings.inlineBarHeight, 9);
});
