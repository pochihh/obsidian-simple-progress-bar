import { MarkdownView, MarkdownPostProcessorContext } from 'obsidian';

interface ProgressBarInfo {
	el: HTMLElement | null;
	source: string;
	label: string;
	ctx: MarkdownPostProcessorContext | null;
	lineStart: number;
	id: number;
}

/**
 * Manages embedded section progress bars (sp-bar code blocks)
 */
export class SectionProgressBar {
	private embeddedBars: Map<string, ProgressBarInfo[]> = new Map();
	private currentFilePath: string | null = null;

	/**
	 * Ensure we have an index of all sp-bar blocks in the file, even if they haven't been rendered yet.
	 */
	private indexBars(view: MarkdownView) {
		if (!view.file) return;

		// Temporary workaround: if the note starts with an sp-bar code block,
		// prepend a newline so Obsidian doesn't keep the block in edit mode.
		// Idempotent: only applies if the very first line is ```sp-bar.
		const firstLine = view.editor.getLine(0);
		if (firstLine && firstLine.startsWith('```sp-bar')) {
			console.warn(
				'[simple-progress-bar] Added leading blank line before top sp-bar code block as a temporary workaround; see README known issues.'
			);
			const contentWithLeadingNewline = '\n' + view.editor.getValue();
			view.editor.setValue(contentWithLeadingNewline);
		}

		const filePath = view.file.path;
		const content = view.editor.getValue().replace(/\r\n/g, '\n').replace(/\r/g, '\n');

		const existing = this.embeddedBars.get(filePath) || [];
		const existingById = new Map(existing.map(bar => [bar.id, bar]));

		const pattern = /```sp-bar[^\n]*\n([\s\S]*?)```/g;
		const indexedBars: ProgressBarInfo[] = [];

		let match: RegExpExecArray | null;
		while ((match = pattern.exec(content)) !== null) {
			const before = content.substring(0, match.index);
			const lineStart = before.split('\n').length - 1;
			const label = (match[1] || '').trim() || 'Progress';
			const id = lineStart;

			const existingBar = existingById.get(id);
			indexedBars.push({
				id,
				lineStart,
				label,
				source: label,
				el: existingBar?.el ?? null,
				ctx: existingBar?.ctx ?? null
			});
		}

		this.embeddedBars.set(filePath, indexedBars);
		this.currentFilePath = filePath;
	}

	/**
	 * Renders an embedded progress bar in a code block
	 */
	renderEmbeddedProgressBar(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext, view: MarkdownView) {
		// Store reference for later updates
		const filePath = ctx.sourcePath;

		this.indexBars(view);

		// If we switched to a new file, clear the old file's bars
		if (this.currentFilePath !== null && this.currentFilePath !== filePath) {
			this.embeddedBars.delete(this.currentFilePath);
		}
		this.currentFilePath = filePath;

		// Initialize array if needed
		if (!this.embeddedBars.has(filePath)) {
			this.embeddedBars.set(filePath, []);
		}

		// Get section info to find line number
		const sectionInfo = ctx.getSectionInfo(el);
		let lineStart = 0;

		if (!sectionInfo) {
			// Fallback: Calculate from content by finding this specific code block
			const codeBlockPattern = /^```sp-bar\s*\n/gm;
			const matches = [...view.editor.getValue().matchAll(codeBlockPattern)];

			// Find this bar by checking which match corresponds to this element
			for (let i = 0; i < matches.length; i++) {
				const match = matches[i];
				const lines = view.editor.getValue().substring(0, match.index).split('\n');
				const calculatedLine = lines.length - 1;

				// Check if this line is already used
				const existingBar = this.embeddedBars.get(filePath)!.find(b => b.lineStart === calculatedLine);
				if (!existingBar) {
					lineStart = calculatedLine;
					break;
				}
			}
		} else {
			lineStart = sectionInfo.lineStart;
		}

		// Use lineStart as the unique ID (since each bar is on a different line)
		const barId = lineStart;

		// Check if this bar already exists (to prevent duplicates in our array)
		const existingBar = this.embeddedBars.get(filePath)!.find(b => b.id === barId);
		if (existingBar) {
			// Obsidian re-rendered this bar with a new DOM element
			// Update our stored reference to point to the new element
			existingBar.el = el;
			existingBar.source = source;
			existingBar.label = source.trim() || 'Progress';
			existingBar.ctx = ctx;
		} else {
			// Add new bar
			this.embeddedBars.get(filePath)!.push({
				el,
				source,
				label: source.trim() || 'Progress',
				ctx,
				lineStart: lineStart,
				id: barId
			});
		}

		// Store the ID on the element for later lookup
		el.dataset.barId = barId.toString();

		// Use requestAnimationFrame to ensure DOM is ready and getSectionInfo is stable
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				this.updateEmbeddedBar(filePath, barId, view);
			});
		});
	}

	/**
	 * Updates a single embedded progress bar
	 */
	private updateEmbeddedBar(filePath: string, barId: number, view: MarkdownView) {
		// Clear existing content
		const bars = this.embeddedBars.get(filePath) || [];
		const barInfo = bars.find(bar => bar.id === barId);

		if (!barInfo) {
			return;
		}

		const el = barInfo.el;
		const source = barInfo.source;
		const labelText = barInfo.label;

		if (!el) {
			return;
		}

		el.empty();

		// Get the label text (default to "Progress")
		const label = labelText || source.trim() || 'Progress';

		if (!view || !view.file) return;

		// Ensure the element matches the expected barId; skip mismatches to avoid offset rendering
		if (el.dataset.barId && el.dataset.barId !== barId.toString()) {
			return;
		}

		const content = view.editor.getValue().replace(/\r\n/g, '\n').replace(/\r/g, '\n');

		const codeBlockLine = barInfo.lineStart;

		// Find the section containing this code block
		const { total, checked } = this.countCheckboxesInSection(content, codeBlockLine);

		if (total === 0) {
			el.createEl('div', {
				text: 'No checkboxes in this section',
				cls: 'sp-bar-no-tasks'
			});
			return;
		}

		// Calculate percentage
		const percentage = Math.round((checked / total) * 100);

		// Create the progress bar container
		const container = el.createDiv('sp-bar-embedded-container');

		// Add label on the left
		container.createEl('div', {
			text: label,
			cls: 'sp-bar-embedded-label'
		});

		// Add progress bar and text container
		const progressContainer = container.createDiv('sp-bar-embedded-progress');

		// Add progress bar track
		const track = progressContainer.createDiv('sp-bar-embedded-track');
		track.createDiv('sp-bar-embedded-fill').style.width = `${percentage}%`;

		// Add text on the right
		progressContainer.createEl('div', {
			text: `${checked}/${total} (${percentage}%)`,
			cls: 'sp-bar-embedded-text'
		});
	}

	/**
	 * Updates all embedded progress bars
	 */
	updateAllEmbeddedBars(view: MarkdownView) {
		this.indexBars(view);
		for (const [filePath, bars] of this.embeddedBars) {
			for (const bar of bars) {
				// Only update if the element is still connected to the DOM
				if (bar.el && bar.el.isConnected) {
					if (bar.el.dataset.barId && bar.el.dataset.barId !== bar.id.toString()) {
						continue;
					}
					this.updateEmbeddedBar(filePath, bar.id, view);
					continue;
				}
			}
		}
	}

	/**
	 * Counts checkboxes in the section containing the code block
	 */
	private countCheckboxesInSection(content: string, codeBlockLine: number): { total: number; checked: number } {
		const lines = content.split('\n');

		// Find the heading above this code block
		let sectionStart = 0;
		let sectionLevel = 0;
		let foundHeading = false;

		// Search backwards for a heading
		for (let i = codeBlockLine - 1; i >= 0; i--) {
			const line = lines[i];
			const headingMatch = line.match(/^(#{1,6})\s+/);
			if (headingMatch) {
				sectionStart = i;
				sectionLevel = headingMatch[1].length;
				foundHeading = true;
				break;
			}
		}

		// Find the end of this section (next heading of same or higher level)
		let sectionEnd = lines.length;

		if (foundHeading) {
			// If we found a heading, find the next heading of same or higher level
			for (let i = codeBlockLine + 1; i < lines.length; i++) {
				const line = lines[i];
				const headingMatch = line.match(/^(#{1,6})\s+/);
				if (headingMatch && headingMatch[1].length <= sectionLevel) {
					sectionEnd = i;
					break;
				}
			}
		} else {
			// If no heading found, this is before the first heading
			// Special case: count ALL checkboxes in the entire document
			// This makes the first bar show total document progress
			sectionStart = 0;
			sectionEnd = lines.length;
		}

		// Count checkboxes in this section
		const sectionContent = lines.slice(sectionStart, sectionEnd).join('\n');
		return this.countCheckboxes(sectionContent);
	}

	/**
	 * Counts checkboxes in the given content
	 */
	private countCheckboxes(content: string): { total: number; checked: number } {
		// Match unchecked boxes: - [ ]
		const uncheckedRegex = /- \[ \]/g;
		// Match checked boxes: - [x] or - [X]
		const checkedRegex = /- \[[xX]\]/g;

		const unchecked = (content.match(uncheckedRegex) || []).length;
		const checked = (content.match(checkedRegex) || []).length;
		const total = checked + unchecked;

		return { total, checked };
	}
}
