import { App, Plugin, PluginSettingTab, Setting, MarkdownView } from 'obsidian';

interface ProgressBarSettings {
	showNoteProgressBar: boolean;
	showRibbonIcon: boolean;
}

const DEFAULT_SETTINGS: ProgressBarSettings = {
	showNoteProgressBar: true,
	showRibbonIcon: false
};

export default class SimpleProgressBarPlugin extends Plugin {
	private progressBars: Map<MarkdownView, HTMLElement> = new Map();
	private statusBarItem: HTMLElement;
	private ribbonIconEl: HTMLElement | null = null;
	private embeddedBars: Map<HTMLElement, { source: string; ctx: any }> = new Map();
	settings: ProgressBarSettings;

	async onload() {
		console.log('Loading Simple Progress Bar plugin');

		// Load settings
		await this.loadSettings();

		// Add settings tab
		this.addSettingTab(new ProgressBarSettingTab(this.app, this));

		// Add ribbon icon if enabled in settings
		this.updateRibbonIcon();

		// Add command to toggle progress bar
		this.addCommand({
			id: 'toggle-progress-bar',
			name: 'Toggle Note Progress Bar',
			callback: async () => {
				this.settings.showNoteProgressBar = !this.settings.showNoteProgressBar;
				await this.saveSettings();
				this.updateProgressBar();
			}
		});

		// Add a status bar item (optional, for debugging)
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.setText('Progress Bar Ready');

		// Register an event when the active leaf changes (switching notes)
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.updateProgressBar();
			})
		);

		// Register an event when file content changes
		this.registerEvent(
			this.app.workspace.on('editor-change', () => {
				this.updateProgressBar();
				this.updateAllEmbeddedBars();
			})
		);

		// Register code block processor for embedded progress bars
		this.registerMarkdownCodeBlockProcessor('sp-bar', (source, el, ctx) => {
			this.renderEmbeddedProgressBar(source, el, ctx);
		});

		// Wait for workspace to be ready before initial update
		this.app.workspace.onLayoutReady(() => {
			// Add a small delay to ensure the editor content is fully loaded
			setTimeout(() => {
				this.updateProgressBar();
			}, 100);
		});
	}

	onunload() {
		console.log('Unloading Simple Progress Bar plugin');
		// Clean up all progress bars
		this.progressBars.forEach((el) => {
			el.remove();
		});
		this.progressBars.clear();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Counts checkboxes in the current note
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
	 * Updates or creates the progress bar
	 */
	updateProgressBar() {
		// Get the active markdown view
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);

		if (!view) {
			this.statusBarItem.setText('No active note');
			return;
		}

		// Get or create progress bar for this view
		let progressBarEl = this.progressBars.get(view);

		// Check if progress bar is enabled in settings
		if (!this.settings.showNoteProgressBar) {
			if (progressBarEl) {
				progressBarEl.addClass('is-hidden');
			}
			this.statusBarItem.setText('Progress Bar: Off');
			return;
		}

		// Get the content of the current note
		const content = view.editor.getValue();
		const { total, checked } = this.countCheckboxes(content);

		// If there are no checkboxes, hide the progress bar
		if (total === 0) {
			if (progressBarEl) {
				progressBarEl.addClass('is-hidden');
			}
			this.statusBarItem.setText('No tasks');
			return;
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

		// Update status bar
		this.statusBarItem.setText(`Tasks: ${checked}/${total} (${percentage}%)`);
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
		progressBarEl.innerHTML = `
			<div class="simple-progress-bar-text">${checked}/${total} (${percentage}%)</div>
			<div class="simple-progress-bar-track">
				<div class="simple-progress-bar-fill" style="width: ${percentage}%"></div>
			</div>
		`;
	}

	/**
	 * Updates the ribbon icon based on settings
	 */
	updateRibbonIcon() {
		// Remove existing ribbon icon if it exists
		if (this.ribbonIconEl) {
			this.ribbonIconEl.remove();
			this.ribbonIconEl = null;
		}

		// Add ribbon icon if enabled in settings
		if (this.settings.showRibbonIcon) {
			this.ribbonIconEl = this.addRibbonIcon('square-split-horizontal', 'Toggle Note Progress Bar', async () => {
				this.settings.showNoteProgressBar = !this.settings.showNoteProgressBar;
				await this.saveSettings();
				this.updateProgressBar();
			});
			// Move icon to bottom of ribbon
			this.ribbonIconEl.addClass('clickable-icon');
			this.ribbonIconEl.parentElement?.appendChild(this.ribbonIconEl);
		}
	}

	/**
	 * Renders an embedded progress bar in a code block
	 */
	private renderEmbeddedProgressBar(source: string, el: HTMLElement, ctx: any) {
		// Store reference for later updates
		this.embeddedBars.set(el, { source, ctx });

		// Render the initial state with a small delay to ensure content is loaded
		setTimeout(() => {
			this.updateEmbeddedBar(el, source, ctx);
		}, 100);
	}

	/**
	 * Updates a single embedded progress bar
	 */
	private updateEmbeddedBar(el: HTMLElement, source: string, ctx: any) {
		// Clear existing content
		el.empty();

		// Get the label text (default to "Progress")
		const labelText = source.trim() || 'Progress';

		// Get the active view to access the file content
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;

		const content = view.editor.getValue();

		// Find the section containing this code block
		const { total, checked } = this.countCheckboxesInSection(content, ctx);

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
			text: labelText,
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
	private updateAllEmbeddedBars() {
		this.embeddedBars.forEach((data, el) => {
			// Check if element still exists in DOM
			if (el.isConnected) {
				this.updateEmbeddedBar(el, data.source, data.ctx);
			} else {
				// Clean up removed elements
				this.embeddedBars.delete(el);
			}
		});
	}

	/**
	 * Counts checkboxes in the section containing the code block
	 */
	private countCheckboxesInSection(content: string, ctx: any): { total: number; checked: number } {
		// Get the line number where this code block appears
		const info = ctx.getSectionInfo(ctx.el);
		if (!info) return { total: 0, checked: 0 };

		const lines = content.split('\n');
		const codeBlockLine = info.lineStart;

		// Find the heading above this code block
		let sectionStart = 0;
		let sectionLevel = 0;

		// Search backwards for a heading
		for (let i = codeBlockLine - 1; i >= 0; i--) {
			const line = lines[i];
			const headingMatch = line.match(/^(#{1,6})\s+/);
			if (headingMatch) {
				sectionStart = i;
				sectionLevel = headingMatch[1].length;
				break;
			}
		}

		// Find the end of this section (next heading of same or higher level)
		let sectionEnd = lines.length;
		for (let i = codeBlockLine + 1; i < lines.length; i++) {
			const line = lines[i];
			const headingMatch = line.match(/^(#{1,6})\s+/);
			if (headingMatch && headingMatch[1].length <= sectionLevel) {
				sectionEnd = i;
				break;
			}
		}

		// Count checkboxes in this section
		const sectionContent = lines.slice(sectionStart, sectionEnd).join('\n');
		return this.countCheckboxes(sectionContent);
	}
}

class ProgressBarSettingTab extends PluginSettingTab {
	plugin: SimpleProgressBarPlugin;

	constructor(app: App, plugin: SimpleProgressBarPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Simple Progress Bar Settings' });

		// Toggle to show/hide progress bar
		new Setting(containerEl)
			.setName('Show progress bar')
			.setDesc('Display the progress bar in the note header')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showNoteProgressBar)
				.onChange(async (value) => {
					this.plugin.settings.showNoteProgressBar = value;
					await this.plugin.saveSettings();
					this.plugin.updateProgressBar();
				}));

		// Toggle to show/hide ribbon icon
		new Setting(containerEl)
			.setName('Show ribbon icon')
			.setDesc('Display the toggle button in the left sidebar ribbon')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showRibbonIcon)
				.onChange(async (value) => {
					this.plugin.settings.showRibbonIcon = value;
					await this.plugin.saveSettings();
					this.plugin.updateRibbonIcon();
				}));
	}
}
