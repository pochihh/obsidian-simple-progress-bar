const WebSocket = require('ws');

async function getPageWebSocketUrl() {
  const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = targets.find((target) => target.type === 'page' && target.url.startsWith('app://obsidian.md'));
  if (!page) throw new Error('No Obsidian page target found on CDP port 9222');
  return page.webSocketDebuggerUrl;
}

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.ws = new WebSocket(url);
    this.ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      }
    });
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  async eval(expression, awaitPromise = true) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || JSON.stringify(result.exceptionDetails));
    }
    return result.result.value;
  }

  close() {
    this.ws.close();
  }
}

(async () => {
  const client = new CdpClient(await getPageWebSocketUrl());
  await client.open();
  await client.send('Runtime.enable');

  const result = await client.eval(`(async () => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const pluginId = 'simple-progress-bar';
    await app.plugins.loadManifests();
    if (app.plugins.enabledPlugins.has(pluginId)) {
      await app.plugins.disablePlugin(pluginId);
      await sleep(300);
    }
    await app.plugins.enablePluginAndSave(pluginId);
    await sleep(500);
    const plugin = app.plugins.plugins[pluginId];
    if (!plugin) throw new Error('Plugin did not load');

    const file = app.vault.getAbstractFileByPath('Simple Progress Bar Test.md');
    if (!file) throw new Error('Fixture note missing');
    const leaf = app.workspace.getLeaf(false);
    await leaf.openFile(file);
    await sleep(500);
    const view = leaf.view;
    if (!view || view.getViewType?.() !== 'markdown') throw new Error('No active MarkdownView');
    await view.setState({ ...view.getState(), mode: 'source', source: false }, { history: false });
    await sleep(400);
    await view.setState({ ...view.getState(), mode: 'preview' }, { history: false });
    await sleep(1600);

    const activeLeafEl = view.containerEl.closest('.workspace-leaf') ?? view.containerEl;
    const inlineContainer = activeLeafEl.querySelector('.sp-bar-embedded-container');
    const inlineText = inlineContainer?.querySelector('.sp-bar-embedded-text')?.textContent?.trim() ?? null;
    const inlineLabel = inlineContainer?.querySelector('.sp-bar-embedded-label')?.textContent?.trim() ?? null;
    const noteText = activeLeafEl.querySelector('.simple-progress-bar-text')?.textContent?.trim() ?? null;

    app.setting.open();
    app.setting.openTabById(pluginId);
    await sleep(500);
    const settingItems = Array.from(document.querySelectorAll('.modal.mod-settings .setting-item'));
    const resetRows = settingItems
      .map((item) => ({
        name: item.querySelector('.setting-item-name')?.textContent?.trim() ?? '',
        buttons: Array.from(item.querySelectorAll('button')).map((button) => ({
          text: button.textContent?.trim() ?? '',
          aria: button.getAttribute('aria-label') ?? button.getAttribute('title') ?? '',
          hasSvg: Boolean(button.querySelector('svg'))
        }))
      }))
      .filter((row) => row.buttons.some((button) => button.hasSvg && button.text === ''));

    for (const name of [
      'Inline progress bar width',
      'Inline progress bar height',
      'Note progress bar width',
      'Note progress bar height'
    ]) {
      const row = Array.from(document.querySelectorAll('.modal.mod-settings .setting-item'))
        .find((item) => item.querySelector('.setting-item-name')?.textContent?.trim() === name);
      const resetButton = Array.from(row?.querySelectorAll('button') ?? [])
        .find((button) => (button.textContent?.trim() ?? '') === '' && Boolean(button.querySelector('svg')));
      if (!resetButton) throw new Error('No icon-only reset button to click for ' + name);
      resetButton.click();
      await sleep(150);
    }

    return {
      pluginLoaded: Boolean(plugin),
      mode: view.getMode(),
      inlineLabel,
      inlineText,
      noteText,
      settings: plugin.settings,
      iconOnlyResetRows: resetRows.map(row => row.name),
      resetSettings: plugin.settings,
      consoleErrors: []
    };
  })()`);

  console.log(JSON.stringify(result, null, 2));

  if (!result.pluginLoaded) throw new Error('Plugin not loaded');
  if (result.mode !== 'preview') throw new Error(`Expected preview mode, got ${result.mode}`);
  if (result.inlineLabel !== 'Inline section progress') throw new Error(`Unexpected inline label: ${result.inlineLabel}`);
  if (result.inlineText !== '1/3 (33%)') throw new Error(`Unexpected inline text: ${result.inlineText}`);
  if (result.noteText !== '2/5 (40%)') throw new Error(`Unexpected note text: ${result.noteText}`);
  for (const expected of [
    'Inline progress bar width',
    'Inline progress bar height',
    'Note progress bar width',
    'Note progress bar height'
  ]) {
    if (!result.iconOnlyResetRows.includes(expected)) {
      throw new Error(`Missing icon-only reset button for: ${expected}`);
    }
  }
  for (const notExpected of [
    'Show inline progress bars',
    'Show note progress in the note header'
  ]) {
    if (result.iconOnlyResetRows.includes(notExpected)) {
      throw new Error(`Toggle should not have an icon-only reset button: ${notExpected}`);
    }
  }
  const defaults = {
    showNoteProgressBar: true,
    showInlineProgressBar: true,
    noteBarWidth: 20,
    noteBarHeight: 6,
    inlineBarWidth: 60,
    inlineBarHeight: 6
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (result.resetSettings[key] !== value) {
      throw new Error(`Reset did not restore ${key}: ${result.resetSettings[key]} !== ${value}`);
    }
  }

  client.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
