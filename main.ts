import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, setIcon } from 'obsidian';
import { NoteProgressBar } from './noteProgressBar';
import { SectionProgressBar } from './sectionProgressBar';

interface ProgressBarSettings {
	showNoteProgressBar: boolean;
}

const DEFAULT_SETTINGS: ProgressBarSettings = {
	showNoteProgressBar: true
};

function isProgressBarSettings(data: unknown): data is Partial<ProgressBarSettings> {
	if (!data || typeof data !== 'object') {
		return false;
	}

	const maybeSettings = data as Partial<Record<keyof ProgressBarSettings, unknown>>;
	return maybeSettings.showNoteProgressBar === undefined || typeof maybeSettings.showNoteProgressBar === 'boolean';
}

export default class SimpleProgressBarPlugin extends Plugin {
	private noteProgressBar: NoteProgressBar;
	private sectionProgressBar: SectionProgressBar;
	private updateScheduled = false;
	settings: ProgressBarSettings;

	async onload() {
		// Initialize progress bar managers
		this.noteProgressBar = new NoteProgressBar();
		this.sectionProgressBar = new SectionProgressBar();

		// Load settings
		await this.loadSettings();

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
				this.updateProgressBar();
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
			window.setTimeout(() => {
				this.updateProgressBar();
			}, 100);
		});
	}

	onunload() {
		// Clean up all progress bars
		this.noteProgressBar.cleanup();
	}

	async loadSettings() {
		const loadedData: unknown = await this.loadData();
		this.settings = {
			...DEFAULT_SETTINGS,
			...(isProgressBarSettings(loadedData) ? loadedData : {})
		};
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
				window.requestAnimationFrame(() => this.sectionProgressBar.updateAllEmbeddedBars(view));
			}
		}, 0);
	}

	async setNoteProgressBarEnabled(enabled: boolean) {
		this.settings.showNoteProgressBar = enabled;
		await this.saveSettings();
		this.updateProgressBar();
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
			.setName('Insert with a command')
			.setDesc('Run “Simple Progress Bar: Insert inline progress bar” from the command palette to insert an inline progress bar for the current heading section.');

		const manualSetting = new Setting(containerEl)
			.setName('Insert manually')
			.setDesc('Paste this code block into a note to show progress for the current section. Change the text between the opening and closing lines to update the progress bar label.');
		const codeWrapperEl = manualSetting.descEl.createDiv({ cls: 'sp-bar-settings-code-wrapper' });
		codeWrapperEl.createEl('pre', { cls: 'sp-bar-settings-code-block' })
			.createEl('code', { text: inlineProgressBlock });
		const copyButtonEl = codeWrapperEl.createEl('button', {
			cls: 'clickable-icon sp-bar-settings-copy-button',
			attr: {
				'aria-label': 'Copy sp-bar code block',
				type: 'button'
			}
		});
		setIcon(copyButtonEl, 'copy');
		copyButtonEl.addEventListener('click', () => {
			void navigator.clipboard.writeText(inlineProgressBlock).then(() => {
				new Notice('Progress bar block copied.');
			});
		});

		new Setting(containerEl)
			.setName('Note progress bar')
			.setHeading();

		new Setting(containerEl)
			.setName('Show note progress in the note header')
			.setDesc('Displays progress for all markdown tasks in the active note.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showNoteProgressBar)
				.onChange(async (value) => {
					this.plugin.settings.showNoteProgressBar = value;
					await this.plugin.saveSettings();
					this.plugin.updateProgressBar();
				}));
		new Setting(containerEl)
			.setName('Commands')
			.setDesc('Command palette: Toggle note progress bar, Show note progress bar, Hide note progress bar.');
	}
}
