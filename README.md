# YouTube Playlist Reverse Traversal

A lightweight userscript that makes YouTube playlist navigation behave in reverse order.

It is designed for playlists that are displayed newest-to-oldest, where YouTube's normal **Next** button keeps moving farther into the displayed order, but you want to watch in the opposite logical direction. When reverse mode is enabled, the script swaps playlist traversal so the player controls, keyboard shortcuts, automatic end-of-video advance, and supported media keys move through the playlist in the reversed direction.

## What this script does

`YouTube_Playlist_Reverse_Traversal.user.js` adds a toggle button inside YouTube's playlist panel. When enabled, it changes traversal behavior for playlist watch pages:

- Adds a YouTube-style reverse toggle button to the playlist action row.
- Persists the toggle state in browser `localStorage`.
- Reverses the effective behavior of the player **Next** and **Previous** controls.
- Intercepts `Shift+N` and `Shift+P` so keyboard playlist traversal follows the reversed order.
- Automatically advances to the reversed logical next item when a video ends or is close to ending.
- Updates supported Media Session handlers for hardware/media-key next and previous actions.
- Skips playlist entries that appear to be private, deleted, unavailable, removed, premieres, or upcoming videos.
- Restores YouTube's original button state when reverse mode is disabled or when leaving a playlist watch page.
- Runs without external dependencies, build tools, or userscript manager grants.

## Intended use case

Some YouTube playlists are visually ordered like this:

```text
Part 16
Part 15
...
Part 2
Part 1
```

If you start at `Part 1` and want to continue to `Part 2`, YouTube's normal playlist traversal may not match the logical order you want. This userscript treats the previous DOM playlist item as the logical **Next** item and the next DOM playlist item as the logical **Previous** item while reverse mode is enabled.

In short:

```text
Logical Next     = previous visible playlist item
Logical Previous = next visible playlist item
```

The script does **not** visually reorder the playlist. It changes how traversal works.

## Repository contents

```text
.
├── README.md
└── YouTube_Playlist_Reverse_Traversal.user.js
```

## Requirements

- A modern browser that supports userscripts.
- A userscript manager, such as:
  - Tampermonkey
  - Violentmonkey
  - Greasemonkey
- YouTube watch pages with a playlist parameter, such as:

```text
https://www.youtube.com/watch?v=VIDEO_ID&list=PLAYLIST_ID
```

The script matches both desktop and mobile YouTube URLs:

```javascript
// @match https://www.youtube.com/*
// @match https://m.youtube.com/*
```

Desktop YouTube playlist watch pages are the primary target. Mobile YouTube is included in the match list, but YouTube's mobile DOM can differ from desktop and may be less reliable.

## Installation

### Option 1: Install from GitHub

1. Install a userscript manager in your browser.
2. Open the raw userscript install link: [`YouTube_Playlist_Reverse_Traversal.user.js`](https://raw.githubusercontent.com/ramhaidar/YouTube-Playlist-Reverse-Traversal/main/YouTube_Playlist_Reverse_Traversal.user.js).
3. If your userscript manager detects the file, confirm the installation prompt.
4. Make sure the script is enabled.
5. Open a YouTube playlist watch page.

### Option 2: Import the local file

If your userscript manager supports importing local userscript files:

1. Open the userscript manager's import or install flow.
2. Select `YouTube_Playlist_Reverse_Traversal.user.js`.
3. Confirm installation.
4. Visit YouTube and open a playlist watch page.

## Usage

1. Open a YouTube watch page that belongs to a playlist.

   The URL must include a `list=` query parameter:

   ```text
   https://www.youtube.com/watch?v=VIDEO_ID&list=PLAYLIST_ID
   ```

2. Wait for the playlist panel to load.

3. Find the reverse toggle button in the playlist action row.

4. Click the toggle.

5. Use YouTube normally.

When the toggle is enabled:

- The button is marked as pressed with `aria-pressed="true"`.
- The button title changes to `Reverse playlist: ON`.
- The button label changes to `Reverse playlist order is on`.
- The enabled state is saved in `localStorage` and persists across page loads.

When the toggle is disabled:

- The button is marked as not pressed with `aria-pressed="false"`.
- The button title changes to `Reverse playlist: OFF`.
- YouTube's player controls are restored to their original attributes.

## Behavior reference

| Action | Normal YouTube behavior | Reverse mode behavior |
| --- | --- | --- |
| Click player **Next** | Move to YouTube's next playlist item | Move to the previous visible playlist item |
| Click player **Previous** | Move to YouTube's previous playlist item | Move to the next visible playlist item |
| Press `Shift+N` | YouTube next shortcut | Reversed logical next |
| Press `Shift+P` | YouTube previous shortcut | Reversed logical previous |
| Video ends | YouTube advances normally | Script advances to reversed logical next |
| Near end of video | YouTube may prepare/advance normally | Script attempts reversed logical next within the final `1.25` seconds |
| Media key next track | Browser/YouTube default, where available | Reversed logical next, where Media Session handlers are accepted |
| Media key previous track | Browser/YouTube default, where available | Reversed logical previous, where Media Session handlers are accepted |

## How it works

The script is a single self-contained userscript. It runs at `document-start` and bootstraps itself against YouTube's single-page-app navigation model.

### 1. Detects playlist watch pages

Reverse behavior only activates on watch pages with a playlist:

```javascript
pathname === "/watch" && searchParams.has("list")
```

This prevents the toggle and navigation overrides from affecting ordinary YouTube pages.

### 2. Adds a playlist-panel toggle

The script looks for YouTube's playlist panel:

```javascript
ytd-playlist-panel-renderer
```

It then tries several selectors for the playlist action row, because YouTube's internal DOM changes over time:

```javascript
#playlist-actions #playlist-action-menu ytd-menu-renderer #top-level-buttons-computed
#playlist-action-menu #top-level-buttons-computed
#playlist-actions #start-actions
#playlist-actions
```

Once an action row is found, the script appends a custom icon button with the wrapper ID:

```javascript
yt-reverse-playlist-action
```

### 3. Stores enabled state locally

The enabled state is stored under this `localStorage` key:

```javascript
yt_reverse_playlist_traversal_enabled
```

No remote storage or network calls are used.

### 4. Finds playlist items

The script reads visible playlist panel entries with:

```javascript
ytd-playlist-panel-video-renderer
```

It only keeps entries that contain a watch link:

```javascript
a[href*='/watch']
```

### 5. Finds the current item

The script determines the current playlist index by first checking YouTube's selected playlist item:

```javascript
ytd-playlist-panel-video-renderer[selected]
```

If that is not available, it falls back to comparing the current URL's `v=` video ID with video IDs extracted from playlist item links.

### 6. Maps reversed controls

The core mapping is:

```javascript
if (control === "next") return getRelativePlayableItem(-1);
if (control === "prev") return getRelativePlayableItem(1);
```

That means:

- **Next** searches backward through the visible playlist DOM.
- **Previous** searches forward through the visible playlist DOM.

The script skips entries whose text suggests they are not playable, including:

- `private video`
- `deleted video`
- `video unavailable`
- `unavailable`
- `removed`
- `premieres`
- `upcoming`

### 7. Intercepts player controls

When reverse mode is enabled, clicks on these YouTube player controls are intercepted in the capture phase:

```javascript
.ytp-next-button
.ytp-prev-button
```

The script prevents YouTube's default action and navigates to the reversed target item instead.

It also updates button attributes such as:

- `href`
- `title`
- `aria-label`
- `aria-disabled`
- `data-preview`
- `data-tooltip-text`
- `data-title-no-tooltip`
- `data-tooltip-title`

Before changing those attributes, the original values are captured. When reverse mode is disabled, they are restored.

### 8. Handles keyboard shortcuts

The script intercepts keydown events for:

- `Shift+N`
- `Shift+P`

It ignores keyboard events that originate from typing/editing targets, including:

- `input`
- `textarea`
- `select`
- `[contenteditable]`

This prevents shortcut handling from interfering while the user is typing.

### 9. Handles video end and near-end auto-advance

The script attaches listeners to the main video element:

```javascript
video.html5-main-video, video
```

It listens for:

- `timeupdate`
- `ended`

On `ended`, it navigates to the reversed logical next item.

On `timeupdate`, it also attempts navigation when the video has `1.25` seconds or less remaining. This near-end check helps handle cases where YouTube transitions before a clean `ended` event path is useful.

To avoid duplicate rapid redirects, navigation is guarded by a redirect lock of `1800` milliseconds.

### 10. Handles YouTube SPA navigation

YouTube updates pages without full reloads. The script schedules reboots when relevant navigation or page-update events fire:

```javascript
yt-navigate-finish
yt-page-data-updated
popstate
visibilitychange
```

It also uses a `MutationObserver` on `document.documentElement` so it can reattach controls and listeners when YouTube changes the DOM.

## Privacy and permissions

The userscript metadata declares:

```javascript
// @grant none
// @noframes
```

This means:

- The script does not request privileged userscript APIs.
- The script runs with normal page-level browser APIs.
- The script does not run inside frames.
- The script does not add any external network requests.
- The script stores only one local preference in `localStorage`.

Stored key:

```javascript
yt_reverse_playlist_traversal_enabled
```

Stored value:

```text
"true" or "false"
```

## Compatibility notes

This userscript depends on YouTube's internal DOM structure and CSS class names. YouTube can change those at any time.

Known compatibility considerations:

- Best suited for desktop YouTube playlist watch pages.
- Requires playlist items to exist in the visible playlist panel DOM.
- Does not fetch the complete playlist from the YouTube API.
- Does not reorder the playlist UI.
- Does not modify YouTube account settings.
- Does not change playlist metadata.
- May need updates if YouTube changes playlist panel selectors or player button markup.

## Troubleshooting

### The toggle button does not appear

Check the following:

1. The userscript is installed and enabled.
2. Your current page URL includes `/watch` and a `list=` query parameter.
3. The playlist panel is visible on the page.
4. Your userscript manager is allowed to run scripts on `youtube.com`.
5. Refresh the page after enabling the userscript.

If it still does not appear, YouTube may have changed the playlist action row DOM selectors.

### The toggle appears, but Next/Previous do not reverse

Check the following:

1. The toggle is enabled and shows `Reverse playlist: ON`.
2. The playlist panel contains the current video and neighboring playlist entries.
3. The neighboring entries are playable and not unavailable/private/deleted/upcoming items.
4. Refresh the page and try again.

If the player buttons changed internally, the script may need updated selectors for `.ytp-next-button` or `.ytp-prev-button` behavior.

### Auto-advance does not work

Possible causes:

- Reverse mode is disabled.
- The page is not a playlist watch page.
- The video element has not been attached yet.
- The next reversed target is unavailable or missing from the DOM.
- YouTube handled navigation before the script could redirect.

The script listens to both `ended` and near-end `timeupdate` events, but YouTube's own playback behavior can still vary.

### Keyboard shortcuts do not work

Reverse keyboard shortcuts only apply when all of these are true:

- Reverse mode is enabled.
- The page is a playlist watch page.
- The key combination is exactly `Shift+N` or `Shift+P`.
- `Ctrl`, `Alt`, and `Meta` are not pressed.
- The event target is not an input, textarea, select, or editable element.

### Media keys do not work

Media Session support depends on the browser and page state. Some browsers or environments may reject custom Media Session handlers. The script catches those failures silently so playback is not broken.

## Development notes

There is no build step. The userscript source file is the distributable artifact.

### Key constants

| Constant | Purpose |
| --- | --- |
| `STORAGE_KEY` | `localStorage` key for reverse mode state |
| `WRAPPER_ID` | DOM ID for the inserted playlist action wrapper |
| `STYLE_ID` | DOM ID for the inserted style block |
| `REDIRECT_LOCK_MS` | Prevents rapid duplicate redirects |
| `NEAR_END_SECONDS` | Remaining-time threshold for near-end auto-advance |

### Key functions

| Function | Purpose |
| --- | --- |
| `isWatchWithPlaylist()` | Checks whether the current page is a playlist watch page |
| `createPanelButton()` | Creates/inserts the reverse toggle button |
| `updatePanelButton()` | Updates toggle visibility and accessibility attributes |
| `getPlaylistItems()` | Collects visible playlist panel items |
| `findCurrentIndex()` | Locates the current video within visible playlist items |
| `getRelativePlayableItem(direction)` | Finds the next playable item in a DOM direction |
| `getTargetForControl(control)` | Maps logical next/previous to reversed playlist targets |
| `navigateByControl(control)` | Performs guarded reversed navigation |
| `updatePlayerControls()` | Updates or restores YouTube player button attributes |
| `onGlobalClick(event)` | Intercepts player next/previous clicks |
| `onKeyDown(event)` | Intercepts `Shift+N` and `Shift+P` |
| `updateMediaSessionHandlers()` | Registers reversed media-session next/previous handlers |
| `boot()` | Reattaches UI, listeners, and control state after page changes |

### Manual test checklist

Use this checklist after changing the script:

- [ ] Install the userscript in a userscript manager.
- [ ] Open a desktop YouTube watch URL with a `list=` parameter.
- [ ] Confirm the reverse toggle appears in the playlist panel action row.
- [ ] Confirm the toggle changes between ON and OFF states.
- [ ] Confirm the ON/OFF state persists after refresh.
- [ ] With reverse mode enabled, click **Next** and verify it moves to the previous visible playlist item.
- [ ] With reverse mode enabled, click **Previous** and verify it moves to the next visible playlist item.
- [ ] With reverse mode enabled, press `Shift+N` and verify reversed logical next navigation.
- [ ] With reverse mode enabled, press `Shift+P` and verify reversed logical previous navigation.
- [ ] Confirm shortcuts do not fire while typing in an input or editable field.
- [ ] Let a video reach the end and verify reversed auto-advance.
- [ ] Disable reverse mode and confirm YouTube's normal controls are restored.
- [ ] Navigate to another YouTube page and back to a playlist watch page; confirm the script reattaches correctly.
- [ ] Test playlists with unavailable/private/deleted entries and verify those entries are skipped when possible.

## File metadata

Current userscript metadata:

```javascript
// @name         YouTube Playlist Reverse Traversal
// @namespace    local.youtube.playlist.reverse
// @version      2026.05.02.2
// @description  Adds a reverse playlist toggle inside YouTube's playlist panel and swaps Previous/Next controls when enabled.
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @updateURL    https://raw.githubusercontent.com/ramhaidar/YouTube-Playlist-Reverse-Traversal/main/YouTube_Playlist_Reverse_Traversal.user.js
// @downloadURL  https://raw.githubusercontent.com/ramhaidar/YouTube-Playlist-Reverse-Traversal/main/YouTube_Playlist_Reverse_Traversal.user.js
// @run-at       document-start
// @grant        none
// @noframes
```

## License

No license file is currently included in this repository.

Before redistributing, publishing, or accepting external contributions, choose and add a license such as MIT, Apache-2.0, GPL-3.0, or another license appropriate for the project.
