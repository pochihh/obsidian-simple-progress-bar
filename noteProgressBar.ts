import { MarkdownView } from 'obsidian';

/**
 * Manages the note-level progress bar displayed in the header
 */
export class NoteProgressBar {
	private progressBars: Map<MarkdownView, HTMLElement> = new Map();

	/**
	 * Updates or creates the progress bar for the current note
	 */
	updateProgressBar(view: MarkdownView | null): { checked: number; total: number; percentage: number } | null {
		if (!view) {
			return null;
		}

		// Get or create progress bar for this view
		let progressBarEl = this.progressBars.get(view);

		// Get the content of the current note
		const content = view.editor.getValue().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
		const { total, checked } = this.countCheckboxes(content);

		// If there are no checkboxes, hide the progress bar
		if (total === 0) {
			if (progressBarEl) {
				progressBarEl.addClass('is-hidden');
			}
			return null;
		}

		// Calculate percentage
		const percentage = Math.round((checked / total) * 100);

		// Create progress bar if it doesn't exist or is not in the DOM
		if (!progressBarEl || !progressBarEl.isConnected) {
			const newBar = this.createProgressBar(view);
			if (newBar) {
				progressBarEl = newBar;
				this.progressBars.set(view, progressBarEl);
			}
		}

		if (progressBarEl) {
			progressBarEl.removeClass('is-hidden');
			this.updateProgressBarContent(progressBarEl, checked, total, percentage);
		}

		return { checked, total, percentage };
	}

	/**
	 * Hides the progress bar
	 */
	hideProgressBar(view: MarkdownView | null) {
		if (!view) return;

		const progressBarEl = this.progressBars.get(view);
		if (progressBarEl) {
			progressBarEl.addClass('is-hidden');
		}
	}

	/**
	 * Creates the progress bar element and inserts it in the header
	 */
	private createProgressBar(view: MarkdownView): HTMLElement | null {
		// Get the view header actions area
		const viewActions = view.containerEl.querySelector('.view-actions');

		if (!viewActions) return null;

		// Create the progress bar container
		const progressBarEl = createDiv('simple-progress-bar-container');

		// Insert before the view actions (to the left of the view mode buttons)
		viewActions.parentElement?.insertBefore(progressBarEl, viewActions);

		return progressBarEl;
	}

	/**
	 * Updates the progress bar HTML content
	 */
	private updateProgressBarContent(progressBarEl: HTMLElement, checked: number, total: number, percentage: number) {
		progressBarEl.empty();

		progressBarEl.createEl('div', {
			text: `${checked}/${total} (${percentage}%)`,
			cls: 'simple-progress-bar-text'
		});

		const track = progressBarEl.createDiv('simple-progress-bar-track');
		track.createDiv('simple-progress-bar-fill').style.width = `${percentage}%`;
	}

	/**
	 * Counts checkboxes in the entire note
	 * Returns: { total: number, checked: number }
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

	/**
	 * Cleans up all progress bars
	 */
	cleanup() {
		this.progressBars.forEach((el) => {
			el.remove();
		});
		this.progressBars.clear();
	}
}
