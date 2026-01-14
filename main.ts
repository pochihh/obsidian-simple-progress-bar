import { App, Plugin, PluginSettingTab, Setting, MarkdownView } from 'obsidian';
import { NoteProgressBar } from './noteProgressBar';
import { SectionProgressBar } from './sectionProgressBar';

interface ProgressBarSettings {
	showNoteProgressBar: boolean;
	showRibbonIcon: boolean;
}

const DEFAULT_SETTINGS: ProgressBarSettings = {
	showNoteProgressBar: true,
	showRibbonIcon: false
};

export default class SimpleProgressBarPlugin extends Plugin {
	private noteProgressBar: NoteProgressBar;
	private sectionProgressBar: SectionProgressBar;
	private statusBarItem: HTMLElement;
	private ribbonIconEl: HTMLElement | null = null;
	settings: ProgressBarSettings;

	async onload() {
		// Initialize progress bar managers
		this.noteProgressBar = new NoteProgressBar();
		this.sectionProgressBar = new SectionProgressBar();

		// Load settings
		await this.loadSettings();

		// Add settings tab
		this.addSettingTab(new ProgressBarSettingTab(this.app, this));

		// Add ribbon icon if enabled in settings
		this.updateRibbonIcon();

		// Add command to toggle progress bar
		this.addCommand({
			id: 'toggle-progress-bar',
			name: 'Toggle note progress bar',
			callback: async () => {
				this.settings.showNoteProgressBar = !this.settings.showNoteProgressBar;
				await this.saveSettings();
				this.updateProgressBar();
			}
		});

		// Add a status bar item (optional, for debugging)
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.setText('Progress bar ready');

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
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view) {
					requestAnimationFrame(() => this.sectionProgressBar.updateAllEmbeddedBars(view));
				}
			})
		);

		// Register code block processor for embedded progress bars
		this.registerMarkdownCodeBlockProcessor('sp-bar', (source, el, ctx) => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view) {
				this.sectionProgressBar.renderEmbeddedProgressBar(source, el, ctx, view);
			}
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
		// Clean up all progress bars
		this.noteProgressBar.cleanup();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
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

		// Check if progress bar is enabled in settings
		if (!this.settings.showNoteProgressBar) {
			this.noteProgressBar.hideProgressBar(view);
			this.statusBarItem.setText('Progress bar: off');
			return;
		}

		// Update the note progress bar
		const result = this.noteProgressBar.updateProgressBar(view);

		if (!result) {
			this.statusBarItem.setText('No tasks');
		} else {
			this.statusBarItem.setText(`Tasks: ${result.checked}/${result.total} (${result.percentage}%)`);
		}
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
			this.ribbonIconEl = this.addRibbonIcon('square-split-horizontal', 'Toggle note progress bar', async () => {
				this.settings.showNoteProgressBar = !this.settings.showNoteProgressBar;
				await this.saveSettings();
				this.updateProgressBar();
			});
			// Move icon to bottom of ribbon
			this.ribbonIconEl.addClass('clickable-icon');
			this.ribbonIconEl.parentElement?.appendChild(this.ribbonIconEl);
		}
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

		new Setting(containerEl)
			.setName('Simple progress bar settings')
			.setHeading();

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
