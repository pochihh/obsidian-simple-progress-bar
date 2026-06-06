import { App, MarkdownView, MarkdownPostProcessorContext, TFile } from 'obsidian';
import { ProgressBarComponent } from './progressBarComponent';
import { countCheckboxesInSection } from './progressUtils';

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

	constructor(private app: App) {}

	/**
	 * Ensure we have an index of all sp-bar blocks in the file, even if they haven't been rendered yet.
	 */
	private indexBars(filePath: string, content: string) {
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
	}

	/**
	 * Renders an embedded progress bar in a code block.
	 *
	 * This intentionally uses ctx.sourcePath + vault contents instead of requiring
	 * the active editor. Reading mode can render markdown when a MarkdownView is
	 * not yet active, and using only getActiveViewOfType can leave the code block
	 * empty in that path.
	 */
	async renderEmbeddedProgressBar(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext, enabled: boolean) {
		const filePath = ctx.sourcePath;
		const content = await this.getContentForPath(filePath);

		// If we switched to a new file, clear the old file's bars
		if (this.currentFilePath !== null && this.currentFilePath !== filePath) {
			this.embeddedBars.delete(this.currentFilePath);
		}

		this.indexBars(filePath, content);
		this.currentFilePath = filePath;

		// Get section info to find line number
		const sectionInfo = ctx.getSectionInfo(el);
		let lineStart = sectionInfo?.lineStart ?? this.findNextUnclaimedBarLine(filePath, content);
		if (lineStart < 0) {
			lineStart = 0;
		}

		// Use lineStart as the unique ID (since each bar is on a different line)
		const barId = lineStart;

		// Check if this bar already exists (to prevent duplicates in our array)
		const bars = this.embeddedBars.get(filePath) || [];
		const existingBar = bars.find(b => b.id === barId);
		if (existingBar) {
			// Obsidian re-rendered this bar with a new DOM element
			// Update our stored reference to point to the new element
			existingBar.el = el;
			existingBar.source = source;
			existingBar.label = source.trim();
			existingBar.ctx = ctx;
		} else {
			bars.push({
				el,
				source,
				label: source.trim(),
				ctx,
				lineStart: lineStart,
				id: barId
			});
			this.embeddedBars.set(filePath, bars);
		}

		// Store the ID on the element for later lookup
		el.dataset.barId = barId.toString();

		if (!enabled) {
			this.renderDisabledState(el);
			return;
		}

		// Use requestAnimationFrame to ensure DOM is ready and getSectionInfo is stable
		window.requestAnimationFrame(() => {
			window.requestAnimationFrame(() => {
				void this.updateEmbeddedBar(filePath, barId, content);
			});
		});
	}

	private findNextUnclaimedBarLine(filePath: string, content: string): number {
		const codeBlockPattern = /^```sp-bar[^\n]*\n/gm;
		const matches = [...content.matchAll(codeBlockPattern)];
		const bars = this.embeddedBars.get(filePath) || [];

		for (const match of matches) {
			const calculatedLine = content.substring(0, match.index).split('\n').length - 1;
			const existingBar = bars.find(b => b.lineStart === calculatedLine && b.el);
			if (!existingBar) {
				return calculatedLine;
			}
		}

		return matches[0]?.index === undefined ? -1 : content.substring(0, matches[0].index).split('\n').length - 1;
	}

	/**
	 * Updates a single embedded progress bar
	 */
	private async updateEmbeddedBar(filePath: string, barId: number, providedContent?: string) {
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

		// Ensure the element matches the expected barId; skip mismatches to avoid offset rendering
		if (el.dataset.barId && el.dataset.barId !== barId.toString()) {
			return;
		}
		el.removeClass('is-hidden');
		el.style.removeProperty('display');

		const view = this.getMarkdownViewForPath(filePath);
		const content = (providedContent ?? await this.getContentForPath(filePath)).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

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
	async updateAllEmbeddedBars(view: MarkdownView, enabled: boolean) {
		if (!view.file) return;

		const filePath = view.file.path;
		const content = view.editor.getValue().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
		this.indexBars(filePath, content);
		this.currentFilePath = filePath;

		for (const [trackedFilePath, bars] of this.embeddedBars) {
			for (const bar of bars) {
				// Only update if the element is still connected to the DOM
				if (bar.el && bar.el.isConnected) {
					if (bar.el.dataset.barId && bar.el.dataset.barId !== bar.id.toString()) {
						continue;
					}

					if (!enabled) {
						this.renderDisabledState(bar.el);
						continue;
					}

					void this.updateEmbeddedBar(trackedFilePath, bar.id, trackedFilePath === filePath ? content : undefined);
				}
			}
		}
	}

	/**
	 * Counts checkboxes for this embedded bar. Reading view may have fresher
	 * checkbox state in the rendered DOM than in the editor buffer immediately
	 * after a visible task click.
	 */
	private countCheckboxesForView(view: MarkdownView | null, barEl: HTMLElement, content: string, codeBlockLine: number): { total: number; checked: number } {
		if (view?.getMode?.() === 'preview') {
			const renderedCounts = this.countRenderedCheckboxesInSection(view, barEl);
			if (renderedCounts && renderedCounts.total > 0) {
				return renderedCounts;
			}
		}

		return countCheckboxesInSection(content, codeBlockLine);
	}

	private countRenderedCheckboxesInSection(view: MarkdownView, barEl: HTMLElement): { total: number; checked: number } | null {
		const previewEl = view.contentEl.querySelector<HTMLElement>('.markdown-preview-sizer')
			?? view.contentEl.querySelector<HTMLElement>('.markdown-preview-view')
			?? view.contentEl;
		if (!previewEl.contains(barEl)) {
			return null;
		}

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


	private async getContentForPath(filePath: string): Promise<string> {
		const activeView = this.getMarkdownViewForPath(filePath);
		if (activeView) {
			return activeView.editor.getValue().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
		}

		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			return (await this.app.vault.cachedRead(file)).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
		}

		return '';
	}

	private getMarkdownViewForPath(filePath: string): MarkdownView | null {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView?.file?.path === filePath) {
			return activeView;
		}

		const leaves = this.app.workspace.getLeavesOfType('markdown');
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file?.path === filePath) {
				return view;
			}
		}

		return null;
	}

	private renderDisabledState(el: HTMLElement) {
		el.empty();
		el.addClass('is-hidden');
		el.style.setProperty('display', 'none');
	}

	cleanup() {
		this.embeddedBars.forEach((bars) => {
			bars.forEach((bar) => bar.el?.empty());
		});
		this.embeddedBars.clear();
		this.currentFilePath = null;
	}
}
