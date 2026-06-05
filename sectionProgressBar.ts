import { MarkdownView, MarkdownPostProcessorContext } from 'obsidian';
import { ProgressBarComponent } from './progressBarComponent';

interface ProgressBarInfo {
	el: HTMLElement | null;
	source: string;
	label: string;
	ctx: MarkdownPostProcessorContext | null;
	lineStart: number;
	id: number;
	lastPercentage?: number;
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
			const label = (match[1] || '').trim();
			const id = lineStart;

			// Prefer the exact line match, but preserve the DOM reference by ordinal when
			// lines were inserted above an existing sp-bar block. Without this, edits
			// above a rendered block shift its line-based id and leave the live element
			// disconnected from future updates until Obsidian reprocesses the markdown.
			const existingBar = existingById.get(id) ?? existing[indexedBars.length];
			if (existingBar?.el) {
				existingBar.el.dataset.barId = id.toString();
			}
			indexedBars.push({
				id,
				lineStart,
				label,
				source: label,
				el: existingBar?.el ?? null,
				ctx: existingBar?.ctx ?? null,
				lastPercentage: existingBar?.lastPercentage
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
			existingBar.label = source.trim();
			existingBar.ctx = ctx;
		} else {
			// Add new bar
			this.embeddedBars.get(filePath)!.push({
				el,
				source,
				label: source.trim(),
				ctx,
				lineStart: lineStart,
				id: barId
			});
		}

		// Store the ID on the element for later lookup
		el.dataset.barId = barId.toString();

		// Use requestAnimationFrame to ensure DOM is ready and getSectionInfo is stable
		window.requestAnimationFrame(() => {
			window.requestAnimationFrame(() => {
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

		// Get the label text (no default)
		const label = labelText || source.trim();

		if (!view || !view.file) return;

		// Ensure the element matches the expected barId; skip mismatches to avoid offset rendering
		if (el.dataset.barId && el.dataset.barId !== barId.toString()) {
			return;
		}

		const content = view.editor.getValue().replace(/\r\n/g, '\n').replace(/\r/g, '\n');

		const codeBlockLine = barInfo.lineStart;

		// Find the section containing this code block. In Reading view, visible
		// task checkbox clicks can update the rendered checkbox state before the
		// editor buffer changes, so prefer rendered DOM state when available.
		const { total, checked } = this.countCheckboxesForView(view, el, content, codeBlockLine);

		if (total === 0) {
			el.empty();
			el.createDiv({
				text: 'No checkboxes in this section',
				cls: 'sp-bar-no-tasks'
			});
			return;
		}

		// Calculate percentage
		const percentage = Math.round((checked / total) * 100);

		const existingPercentage = barInfo.lastPercentage ?? Number(el.dataset.progressPercentage ?? NaN);
		const existingContainer = el.querySelector<HTMLElement>('.sp-bar-embedded-container');
		if (existingPercentage === percentage && existingContainer) {
			const labelEl = existingContainer.querySelector<HTMLElement>('.sp-bar-embedded-label');
			if (labelEl) {
				labelEl.setText(label);
			}
			const fillEl = existingContainer.querySelector<HTMLElement>('.sp-bar-embedded-fill');
			if (fillEl) {
				fillEl.style.width = `${percentage}%`;
			}
			const textEl = existingContainer.querySelector<HTMLElement>('.sp-bar-embedded-text');
			if (textEl) {
				textEl.setText(`${checked}/${total} (${percentage}%)`);
			}
			el.dataset.progressPercentage = percentage.toString();
			barInfo.lastPercentage = percentage;
			return;
		}

		el.empty();

		// Create the progress bar container
		const container = el.createDiv('sp-bar-embedded-container');

		// Add label on the left (only if there's text)
		if (label) {
			container.createDiv({
				text: label,
				cls: 'sp-bar-embedded-label'
			});
		}

		// Add progress bar and text container
		const progressContainer = container.createDiv('sp-bar-embedded-progress');

		// Use the ProgressBarComponent to create the progress bar with celebration animation
		ProgressBarComponent.create(
			progressContainer,
			percentage,
			'sp-bar-embedded-track',
			'sp-bar-embedded-fill',
			{
				stateContainer: el,
				previousPercentage: barInfo.lastPercentage
			}
		);
		barInfo.lastPercentage = percentage;

		// Add text on the right
		progressContainer.createDiv({
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
	 * Counts checkboxes for this embedded bar. Reading view may have fresher
	 * checkbox state in the rendered DOM than in the editor buffer immediately
	 * after a visible task click.
	 */
	private countCheckboxesForView(view: MarkdownView, barEl: HTMLElement, content: string, codeBlockLine: number): { total: number; checked: number } {
		if (view.getMode?.() === 'preview') {
			const renderedCounts = this.countRenderedCheckboxesInSection(view, barEl);
			if (renderedCounts && renderedCounts.total > 0) {
				return renderedCounts;
			}
		}

		return this.countCheckboxesInSection(content, codeBlockLine);
	}

	private countRenderedCheckboxesInSection(view: MarkdownView, barEl: HTMLElement): { total: number; checked: number } | null {
		const previewEl = view.contentEl.querySelector<HTMLElement>('.markdown-preview-sizer')
			?? view.contentEl.querySelector<HTMLElement>('.markdown-preview-view')
			?? view.contentEl;
		let sectionNode: HTMLElement = barEl;

		while (sectionNode.parentElement && sectionNode.parentElement !== previewEl) {
			sectionNode = sectionNode.parentElement;
		}

		if (sectionNode.parentElement !== previewEl) {
			sectionNode = barEl;
		}

		const headingLevel = (element: Element | null): number | null => {
			const directMatch = element?.tagName.match(/^H([1-6])$/);
			if (directMatch) return Number(directMatch[1]);

			const wrapperMatch = typeof element?.className === 'string'
				? element.className.match(/(?:^|\s)el-h([1-6])(?:\s|$)/)
				: null;
			if (wrapperMatch) return Number(wrapperMatch[1]);

			const childHeading = element?.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6');
			const childMatch = childHeading?.tagName.match(/^H([1-6])$/);
			return childMatch ? Number(childMatch[1]) : null;
		};

		let previousHeading: Element | null = null;
		for (let sibling = sectionNode.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
			if (headingLevel(sibling) !== null) {
				previousHeading = sibling;
				break;
			}
		}

		const currentHeadingLevel = headingLevel(previousHeading);
		let total = 0;
		let checked = 0;
		let node: Element | null = previousHeading ? previousHeading.nextElementSibling : previewEl.firstElementChild;

		while (node) {
			const level = headingLevel(node);
			if (currentHeadingLevel !== null && level !== null && level <= currentHeadingLevel) {
				break;
			}

			const checkboxes = [
				...(node.matches('input.task-list-item-checkbox') ? [node as HTMLInputElement] : []),
				...Array.from(node.querySelectorAll<HTMLInputElement>('input.task-list-item-checkbox'))
			];
			total += checkboxes.length;
			checked += checkboxes.filter((checkbox) => checkbox.checked).length;
			node = node.nextElementSibling;
		}

		return total > 0 ? { total, checked } : null;
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
			const line = lines[i] ?? '';
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
				const line = lines[i] ?? '';
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
		const uncheckedRegex = /(^|\n)[\t ]*[-*+]\s+\[ \]/g;
		// Match checked boxes: - [x] or - [X]
		const checkedRegex = /(^|\n)[\t ]*[-*+]\s+\[[xX]\]/g;

		const unchecked = (content.match(uncheckedRegex) || []).length;
		const checked = (content.match(checkedRegex) || []).length;
		const total = checked + unchecked;

		return { total, checked };
	}
}
