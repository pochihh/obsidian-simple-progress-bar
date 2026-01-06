# Development Guide

## Testing Your Plugin Locally

### Setup Steps

1. **Find your Obsidian vault's plugin folder**
   - Open Obsidian
   - Open Settings → Community plugins
   - Click on the folder icon next to "Installed plugins" (or navigate to `YourVault/.obsidian/plugins/`)

2. **Create a symlink or copy your plugin**

   **Option A: Symlink (Recommended for development)**
   ```bash
   # Navigate to your vault's plugin folder
   cd /path/to/your/vault/.obsidian/plugins/

   # Create a symlink to your plugin development folder
   ln -s /Users/toby/projects/obsidian-simple-progress-bar simple-progress-bar
   ```

   **Option B: Copy files**
   ```bash
   # Copy the plugin folder to your vault
   cp -r /Users/toby/projects/obsidian-simple-progress-bar /path/to/your/vault/.obsidian/plugins/simple-progress-bar
   ```

3. **Build the plugin**
   ```bash
   # In your plugin directory
   npm run dev
   ```
   This will watch for changes and automatically rebuild when you modify files.

4. **Enable the plugin in Obsidian**
   - Open Obsidian
   - Go to Settings → Community plugins
   - Turn OFF "Restricted mode" if it's on
   - Find "Simple Progress Bar" in the list
   - Toggle it on

5. **Check if it's working**
   - Open Developer Console (Ctrl/Cmd + Shift + I)
   - Look for the message: "Loading Simple Progress Bar plugin"

### Development Workflow

1. **Start the dev build watcher:**
   ```bash
   npm run dev
   ```
   Leave this running in a terminal.

2. **Make changes to your code** in [main.ts](main.ts)

3. **Reload Obsidian to see changes:**
   - Open Command Palette (Ctrl/Cmd + P)
   - Type "Reload app without saving"
   - Press Enter

   Or manually: Close and reopen Obsidian

4. **Check the console** for errors or your console.log messages

### Building for Production

When ready to share or release:
```bash
npm run build
```

This creates an optimized build. The files you need to distribute are:
- `main.js`
- `manifest.json`
- `styles.css` (if you create one)

## Project Structure

- [main.ts](main.ts) - Your plugin's main code
- [manifest.json](manifest.json) - Plugin metadata
- [package.json](package.json) - Dependencies and scripts
- [tsconfig.json](tsconfig.json) - TypeScript configuration
- [esbuild.config.mjs](esbuild.config.mjs) - Build configuration

## Next Steps

Now you can start implementing your progress bar feature! Your plugin will:
- Monitor checkboxes in notes
- Calculate completion percentage
- Display a progress bar

Check the Obsidian API docs for available methods:
https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin
