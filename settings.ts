export interface ProgressBarSettings {
	showNoteProgressBar: boolean;
	showInlineProgressBar: boolean;
	noteBarWidth: number;
	noteBarHeight: number;
	inlineBarWidth: number;
	inlineBarHeight: number;
}

interface LegacyProgressBarSettings {
	showNoteProgressBar?: unknown;
	showInlineProgressBar?: unknown;
	noteBarWidth?: unknown;
	noteBarHeight?: unknown;
	inlineBarWidth?: unknown;
	inlineBarHeight?: unknown;
	barWidth?: unknown;
	barHeight?: unknown;
}

export const DEFAULT_SETTINGS: ProgressBarSettings = {
	showNoteProgressBar: true,
	showInlineProgressBar: true,
	noteBarWidth: 20,
	noteBarHeight: 6,
	inlineBarWidth: 60,
	inlineBarHeight: 6
};

export function isNumberInRange(value: unknown, min: number, max: number): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function getBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function getRangeNumber(value: unknown, min: number, max: number, fallback: number): number {
	return isNumberInRange(value, min, max) ? value : fallback;
}

export function sanitizeProgressBarSettings(data: unknown): ProgressBarSettings {
	if (!data || typeof data !== 'object') {
		return { ...DEFAULT_SETTINGS };
	}

	const loaded = data as LegacyProgressBarSettings;
	const legacyBarWidth = isNumberInRange(loaded.barWidth, 5, 100) ? loaded.barWidth : undefined;
	const legacyBarHeight = isNumberInRange(loaded.barHeight, 2, 20) ? loaded.barHeight : undefined;

	return {
		showNoteProgressBar: getBoolean(loaded.showNoteProgressBar, DEFAULT_SETTINGS.showNoteProgressBar),
		showInlineProgressBar: getBoolean(loaded.showInlineProgressBar, DEFAULT_SETTINGS.showInlineProgressBar),
		noteBarWidth: getRangeNumber(loaded.noteBarWidth, 5, 100, legacyBarWidth ?? DEFAULT_SETTINGS.noteBarWidth),
		noteBarHeight: getRangeNumber(loaded.noteBarHeight, 2, 20, legacyBarHeight ?? DEFAULT_SETTINGS.noteBarHeight),
		inlineBarWidth: getRangeNumber(loaded.inlineBarWidth, 5, 100, legacyBarWidth ?? DEFAULT_SETTINGS.inlineBarWidth),
		inlineBarHeight: getRangeNumber(loaded.inlineBarHeight, 2, 20, legacyBarHeight ?? DEFAULT_SETTINGS.inlineBarHeight)
	};
}
