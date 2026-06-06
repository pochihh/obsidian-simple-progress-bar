import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { NoteProgressBar } from './noteProgressBar';
import { SectionProgressBar } from './sectionProgressBar';
import { DEFAULT_SETTINGS, ProgressBarSettings, sanitizeProgressBarSettings } from './settings';

export default class SimpleProgressBarPlugin extends Plugin {
	private noteProgressBar: NoteProgressBar;
	private sectionProgressBar: SectionProgressBar;
	private updateScheduled = false;
	settings: ProgressBarSettings;

	async onload() {
		// Initialize progress bar managers
		this.noteProgressBar = new NoteProgressBar();
		this.sectionProgressBar = new SectionProgressBar(this.app);

		// Load settings
		await this.loadSettings();
		this.applyBarStyles();

		// Add settings tab
		this.addSettingTab(new ProgressBarSettingTab(this.app, this));

		// Commands let users automate the note progress bar without a ribbon icon.
		this.addCommand({
			id: 'toggle-progress-bar',
			name: 'Toggle note progress bar',
			callback: async () => this.setNoteProgressBarEnabled(!this.settings.showNoteProgressBar)
		});

		this.addCommand({
			id: 'show-progress-bar',
			name: 'Show note progress bar',
			callback: async () => this.setNoteProgressBarEnabled(true)
		});

		this.addCommand({
			id: 'hide-progress-bar',
			name: 'Hide note progress bar',
			callback: async () => this.setNoteProgressBarEnabled(false)
		});

		this.addCommand({
			id: 'insert-inline-progress-bar',
			name: 'Insert inline progress bar',
			callback: () => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view) {
					new Notice('Open a markdown note to insert a progress bar.');
					return;
				}

				this.insertInlineProgressBar(view.editor);
			}
		});

		// Register an event when the active leaf changes (switching notes)
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.updateProgressBars();
			})
		);

		// Register events when file content changes. Source/live-preview edits fire
		// editor-change; reading-view task toggles can instead arrive as a vault
		// modify or only as a DOM checkbox change before Obsidian has persisted.
		this.registerEvent(
			this.app.workspace.on('editor-change', () => this.scheduleProgressBarUpdate())
		);

		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view?.file === file) {
					this.scheduleProgressBarUpdate();
				}
			})
		);

		const handleTaskCheckboxChange = (event: MouseEvent | Event) => {
			const target = event.target as HTMLElement | null;
			if (target?.matches('input.task-list-item-checkbox, .task-list-item-checkbox')) {
				this.scheduleProgressBarUpdate();
			}
		};
		this.registerDomEvent(this.app.workspace.containerEl, 'change', handleTaskCheckboxChange);
		this.registerDomEvent(this.app.workspace.containerEl, 'click', handleTaskCheckboxChange);

		// Register code block processor for embedded progress bars. Do not depend on
		// the active leaf here: Reading mode can render markdown before the active
		// MarkdownView lookup is available or while another leaf is active.
		this.registerMarkdownCodeBlockProcessor('sp-bar', async (source, el, ctx) => {
			await this.sectionProgressBar.renderEmbeddedProgressBar(source, el, ctx, this.settings.showInlineProgressBar);
		});

		// Wait for workspace to be ready before initial update
		this.app.workspace.onLayoutReady(() => {
			// Add a small delay to ensure the editor content is fully loaded
			window.setTimeout(() => {
				this.updateProgressBars();
			}, 100);
		});
	}

	onunload() {
		// Clean up all progress bars
		this.noteProgressBar.cleanup();
		this.sectionProgressBar.cleanup();
		this.app.workspace.containerEl.style.removeProperty('--spb-note-bar-width');
		this.app.workspace.containerEl.style.removeProperty('--spb-note-bar-height');
		this.app.workspace.containerEl.style.removeProperty('--spb-inline-bar-width');
		this.app.workspace.containerEl.style.removeProperty('--spb-inline-bar-height');
	}

	async loadSettings() {
		this.settings = sanitizeProgressBarSettings(await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.applyBarStyles();
	}

	applyBarStyles() {
		const workspaceEl = this.app.workspace.containerEl;
		workspaceEl.style.setProperty('--spb-note-bar-width', `${this.settings.noteBarWidth}%`);
		workspaceEl.style.setProperty('--spb-note-bar-height', `${this.settings.noteBarHeight}px`);
		workspaceEl.style.setProperty('--spb-inline-bar-width', `${this.settings.inlineBarWidth}%`);
		workspaceEl.style.setProperty('--spb-inline-bar-height', `${this.settings.inlineBarHeight}px`);
	}

	/**
	 * Updates or creates the note progress bar
	 */
	updateProgressBar() {
		// Get the active markdown view
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);

		if (!view) {
			return;
		}

		// Check if progress bar is enabled in settings
		if (!this.settings.showNoteProgressBar) {
			this.noteProgressBar.hideProgressBar(view);
			return;
		}

		// Update the note progress bar
		this.noteProgressBar.updateProgressBar(view);
	}

	updateProgressBars() {
		this.updateProgressBar();
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view) {
			this.sectionProgressBar.updateAllEmbeddedBars(view, this.settings.showInlineProgressBar);
		}
	}

	private scheduleProgressBarUpdate() {
		if (this.updateScheduled) {
			return;
		}

		this.updateScheduled = true;
		window.setTimeout(() => {
			this.updateScheduled = false;
			this.updateProgressBar();
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view) {
				window.requestAnimationFrame(() => this.sectionProgressBar.updateAllEmbeddedBars(view, this.settings.showInlineProgressBar));
			}
		}, 0);
	}

	async setNoteProgressBarEnabled(enabled: boolean) {
		this.settings.showNoteProgressBar = enabled;
		await this.saveSettings();
		this.updateProgressBar();
	}

	async setInlineProgressBarEnabled(enabled: boolean) {
		this.settings.showInlineProgressBar = enabled;
		await this.saveSettings();
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view) {
			this.sectionProgressBar.updateAllEmbeddedBars(view, enabled);
		}
	}

	async resetSetting<K extends keyof ProgressBarSettings>(key: K) {
		this.settings[key] = DEFAULT_SETTINGS[key];
		await this.saveSettings();
		this.updateProgressBars();
	}

	private insertInlineProgressBar(editor: Editor) {
		const selectedText = editor.getSelection().trim();
		const label = selectedText || 'Progress';
		const cursor = editor.getCursor();
		const currentLine = editor.getLine(cursor.line) || '';
		const prefix = currentLine.slice(0, cursor.ch).trim().length > 0 ? '\n' : '';
		const block = `${prefix}\`\`\`sp-bar\n${label}\n\`\`\`\n`;
		editor.replaceSelection(block);
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
		const inlineProgressBlock = '```sp-bar\nProgress\n```';
		const addResetButton = <K extends keyof ProgressBarSettings>(setting: Setting, key: K, afterReset?: () => void) => {
			setting.addButton(button => button
				.setIcon('reset')
				.setTooltip('Reset to default')
				.onClick(async () => {
					await this.plugin.resetSetting(key);
					afterReset?.();
					this.display();
				}));
		};

		containerEl.empty();

		const instructionsEl = containerEl.createDiv({ cls: 'sp-bar-settings-help' });
		instructionsEl.createDiv({ cls: 'sp-bar-settings-help-title', text: 'Simple Progress Bar' });
		instructionsEl.createEl('p', {
			cls: 'sp-bar-settings-help-description',
			text: 'Shows task progress in the note header and supports inline section progress bars.'
		});

		new Setting(containerEl)
			.setName('Inline progress bar')
			.setHeading();

		new Setting(containerEl)
			.setName('Show inline progress bars')
			.setDesc('Displays progress bars rendered from ```sp-bar code blocks in notes.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showInlineProgressBar)
				.onChange(async (value) => {
					await this.plugin.setInlineProgressBarEnabled(value);
				}));

		const inlineWidthSetting = new Setting(containerEl)
			.setName('Inline progress bar width')
			.setDesc('Controls inline section progress bar width as a percentage of the available space.')
			.addSlider(slider => slider
				.setLimits(5, 100, 5)
				.setValue(this.plugin.settings.inlineBarWidth)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.inlineBarWidth = value;
					await this.plugin.saveSettings();
					this.plugin.updateProgressBars();
				}));
		addResetButton(inlineWidthSetting, 'inlineBarWidth');

		const inlineHeightSetting = new Setting(containerEl)
			.setName('Inline progress bar height')
			.setDesc('Controls inline section progress bar height in pixels.')
			.addSlider(slider => slider
				.setLimits(2, 20, 1)
				.setValue(this.plugin.settings.inlineBarHeight)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.inlineBarHeight = value;
					await this.plugin.saveSettings();
					this.plugin.updateProgressBars();
				}));
		addResetButton(inlineHeightSetting, 'inlineBarHeight');

		new Setting(containerEl)
			.setName('Insert with a command')
			.setDesc('Run “Simple Progress Bar: Insert inline progress bar” from the command palette to insert an inline progress bar for the current heading section.');

		const manualSetting = new Setting(containerEl)
			.setName('Insert manually')
			.setDesc('Paste this code block into a note to show progress for the current section. Change the text between the opening and closing lines to update the progress bar label.');
		manualSetting.descEl.createEl('pre', { cls: 'sp-bar-settings-code-block' })
			.createEl('code', { text: inlineProgressBlock });

		new Setting(containerEl)
			.setName('Note progress bar')
			.setHeading();

		new Setting(containerEl)
			.setName('Show note progress in the note header')
			.setDesc('Displays progress for all markdown tasks in the active note.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showNoteProgressBar)
				.onChange(async (value) => {
					await this.plugin.setNoteProgressBarEnabled(value);
				}));

		const noteWidthSetting = new Setting(containerEl)
			.setName('Note progress bar width')
			.setDesc('Controls the note header progress bar width as a percentage of the available space.')
			.addSlider(slider => slider
				.setLimits(5, 100, 5)
				.setValue(this.plugin.settings.noteBarWidth)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.noteBarWidth = value;
					await this.plugin.saveSettings();
					this.plugin.updateProgressBar();
				}));
		addResetButton(noteWidthSetting, 'noteBarWidth');

		const noteHeightSetting = new Setting(containerEl)
			.setName('Note progress bar height')
			.setDesc('Controls the note header progress bar height in pixels.')
			.addSlider(slider => slider
				.setLimits(2, 20, 1)
				.setValue(this.plugin.settings.noteBarHeight)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.noteBarHeight = value;
					await this.plugin.saveSettings();
					this.plugin.updateProgressBar();
				}));
		addResetButton(noteHeightSetting, 'noteBarHeight');

		new Setting(containerEl)
			.setName('Commands')
			.setDesc('Command palette: Toggle note progress bar, Show note progress bar, Hide note progress bar, Insert inline progress bar.');
	}

}
