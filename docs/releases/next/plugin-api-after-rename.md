### Fixed

- Keeps plugins working: a plugin's own code and pages find the API again, so a plugin that draws a code block, lists a folder or offers another plugin does what it did before.
- Shows the plugin market's plugins again: a plugin's manifest is read as before, so the catalog is not empty and the official plugins can be installed.
- Finds the new release: the updater reads the manifest the release publishes, so **Settings › General › About Moxie › Check for Updates** finds the version that is out.
- Installs on Linux again: the package's desktop entry points at the app, and the app's own files are found where they now live.
