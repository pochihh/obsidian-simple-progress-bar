import { App, Plugin, PluginSettingTab, Setting, MarkdownView } from 'obsidian';
import { NoteProgressBar } from './noteProgressBar';
import { SectionProgressBar } from './sectionProgressBar';

interface ProgressBarSettings {
	showNoteProgressBar: boolean;
}

const DEFAULT_SETTINGS: ProgressBarSettings = {
	showNoteProgressBar: true
};

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
			editorCallback: (editor) => {
				const selectedText = editor.getSelection().trim();
				const label = selectedText || 'Progress';
				const block = `\n\`\`\`sp-bar\n${label}\n\`\`\`\n`;
				editor.replaceSelection(block);
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
			activeWindow.setTimeout(() => {
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
		activeWindow.setTimeout(() => {
			this.updateScheduled = false;
			this.updateProgressBar();
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view) {
				activeWindow.requestAnimationFrame(() => this.sectionProgressBar.updateAllEmbeddedBars(view));
			}
		}, 0);
	}

	async setNoteProgressBarEnabled(enabled: boolean) {
		this.settings.showNoteProgressBar = enabled;
		await this.saveSettings();
		this.updateProgressBar();
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

		const instructionsEl = containerEl.createDiv({ cls: 'sp-bar-settings-instructions' });
		instructionsEl.createEl('h2', { text: 'How to use Simple Progress Bar' });
		instructionsEl.createEl('p', {
			text: 'The note progress bar appears in the active note header and counts every markdown checkbox in the note.'
		});
		instructionsEl.createEl('p', {
			text: 'To add an inline/section progress bar, use the command Simple Progress Bar: Insert inline progress bar, or manually add a ```sp-bar code block with an optional label. The bar counts checkboxes in the same heading section.'
		});
		instructionsEl.createEl('p', {
			text: 'Exact commands: Simple Progress Bar: Insert inline progress bar; Simple Progress Bar: Toggle note progress bar; Simple Progress Bar: Show note progress bar; Simple Progress Bar: Hide note progress bar.'
		});

		new Setting(containerEl)
			.setName('Note progress bar')
			.setHeading();

		new Setting(containerEl)
			.setName('Show in note header')
			.setDesc('Displays progress for all markdown tasks in the active note. You can also automate this with the commands: Toggle, Show, and Hide note progress bar.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showNoteProgressBar)
				.onChange(async (value) => {
					this.plugin.settings.showNoteProgressBar = value;
					await this.plugin.saveSettings();
					this.plugin.updateProgressBar();
				}));
	}
}
