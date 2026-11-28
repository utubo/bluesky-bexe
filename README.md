# bexe

# ![bexe icon](src/assets/icon.png) bexe

A lightweight, personal Bluesky client for Windows.

## Installation

Download the latest release from the [Releases page](https://github.com/utubo/bluesky-bexe/releases/latest).

## About

**bexe** is a minimalist Bluesky client built primarily for personal use—designed to sit quietly at the edge of your display just for browsing your timeline and posting.

It is the Bluesky counterpart to a Twitter client I previously built called *ﾋ.exe* (which is how the executable ended up being named `bexe.exe`).

### Key Concepts
- **Compact & Information-Dense:** Built around the idea of viewing as many posts as possible even in a narrow window. The first 4 posts in the timeline are displayed in 2 lines, while the 5th post onward are condensed into 1 line.
- **45-Second Delay:** Posts are displayed with a 45-second delay from real time.

## Notes & Tips

- **Use an App Password:** Please log in using an App Password rather than your main password. You can generate one in the official Bluesky app under **Settings > Privacy and Security > App Passwords** (so you can easily revoke access whenever you want).
- **Built for Personal Comfort:** This app is developed solely around what feels comfortable for me to use. Expect plenty of bugs.
- **Minimal Feature Set:** Account registration and other standard convenience features are not included (though I might add them if I ever feel like I need them).
- **Image Viewer Zoom:** You can zoom in and out in the image viewer by dragging with both the **left and right mouse buttons** held down simultaneously (start dragging with the left button, then hold the right button).
- **Quick Recovery:** If the UI or display ever glitches out, pressing **`Ctrl + R`** to reload usually fixes it.

## Known Issues (or Features)

- **Missed Posts on High-Volume Timelines:** If more than 50 posts are made within a 45-second window, some posts will be missed.
- **Imperfect Scroll Restoration:** Because threads and other views do not cache posts, returning via the Back button may not accurately restore your previous scroll position.
- **Restart Required for Mention Thread Settings:** Changes to the mention thread structure settings do not take effect until the app is restarted.

## Roadmap

- None planned.

