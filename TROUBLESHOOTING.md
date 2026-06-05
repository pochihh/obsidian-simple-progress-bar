# Troubleshooting

## The 100% completion animation does not play

Simple Progress Bar respects the system reduced-motion preference. If your operating system tells Obsidian/Chromium that reduced motion is enabled, the plugin disables the 100% sparkle/flash celebration animation on purpose.

This is an accessibility feature: users who prefer reduced motion should not get decorative motion effects.

### Windows

On Windows, Obsidian may report:

```text
prefers-reduced-motion: reduce
```

when Windows animation effects are disabled.

Check:

```text
Windows Settings -> Accessibility -> Visual effects -> Animation effects
```

If **Animation effects** is **Off**, the 100% celebration animation will be suppressed. Turn it **On** if you want to see the completion animation.

You may not remember changing this directly. Windows can carry this setting forward from earlier accessibility/performance choices, setup migration, or system optimization tools.

### How to confirm in Obsidian Developer Tools

Open Obsidian Developer Tools and run:

```js
window.matchMedia('(prefers-reduced-motion: reduce)').matches
```

- `true` means Obsidian is asking plugins to reduce motion.
- `false` means motion animations are allowed.

### Expected plugin behavior

- Progress bar width transitions are minimized when reduced motion is enabled.
- The 100% sparkle/flash celebration does not play when reduced motion is enabled.
- Progress counts and progress bars still update normally.

## The plugin looks stale after building locally

If you build the plugin locally, make sure the rebuilt files are copied into the vault plugin folder:

```text
<vault>/.obsidian/plugins/simple-progress-bar/
```

Required files:

```text
main.js
manifest.json
styles.css
```

Then reload Obsidian or disable/enable the plugin from Settings -> Community plugins.

For Windows sandbox testing, the test vault path used by the local E2E harness is commonly:

```text
D:\Projects\test_vault\.obsidian\plugins\simple-progress-bar
```
