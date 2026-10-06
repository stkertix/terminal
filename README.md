# Terminal Simulator

A Chrome extension that opens a terminal window. Each pane can run the local login shell, or a built-in simulator when the shell host is not available.

The window uses a black background and the Source Code Pro font. The font file is bundled with the extension.

## Requirements

- Google Chrome
- macOS, Python 3 at `/usr/bin/python3`, and the native hosts below, for the local shell and the stable-Chrome task manager

The simulator works without the native hosts.

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this directory.
4. Install the native hosts, then reload the extension:

```bash
native/install-macos.sh
```

The installer copies the hosts to `~/Library/Application Support/Terminal/` and registers them for this extension’s Chrome ID. Click the extension icon to open the terminal. If that window is already open, the next click focuses it. The window starts at 1100×720. A page served outside the extension cannot reach the native hosts.

## Tabs

**+** opens a tab. Each tab has its own panes, layout, and scrollback. **Ctrl+1** through **Ctrl+9** select the tab in that position. Double-click a tab name to rename it (40 characters). Enter or clicking away saves the name. Escape cancels. The last tab cannot be closed.

The last state is saved in `chrome.storage.local` and restored the next time the window opens: tab names, the active tab, layout, pane order, open panes, split sizes, and each simulator pane’s history, scrollback, and open page. Live shell scrollback is not saved.

## Panes

The toolbar switches among **Single**, **Columns**, **Rows**, and **Grid**. Drag a pane by its title bar to move it. Drag the gap between panes to resize them: each row has its own widths, and both panes in a row share that row’s height. Double-click a gap to reset that split.

Each pane has a **Shell** / **Simulator** switch. Shell is tried first. If native messaging is missing or the host is not installed, the pane stays on the simulator.

**Ctrl+L** clears the simulator screen. **Ctrl+C** stops a running simulator download, compile, install, monitor, or algorithm. The prompt is hidden while one of those jobs is running. Arrow up and down walk the command history of that pane.

## Simulator commands

| Command                      | Description                                         |
| ---------------------------- | --------------------------------------------------- |
| `help`                       | List commands                                       |
| `clear`                      | Clear the screen                                    |
| `echo`                       | Print arguments                                     |
| `date`                       | Show the local date and time                        |
| `history`                    | Show commands from this session                     |
| `whoami`                     | Print the current user                              |
| `hostname`                   | Print the host name                                 |
| `pwd`                        | Print the working directory                         |
| `ls`                         | List files                                          |
| `cat`                        | Print a file                                        |
| `uname`                      | Print system information                            |
| `download [name]`            | Simulate parallel downloads                         |
| `compile [TOOL MINUTES]`     | Simulate a build                                    |
| `install TOOL MINUTES LOOPS` | Run that compile the given number of times          |
| `monitor [CHART]`            | Show a fake host dashboard                          |
| `algorithm [KIND]`           | Show an ASCII visualization                         |
| `top`, `htop`                | Show the Chrome task manager                        |
| `open <url>`                 | Open a page in this pane                            |
| `exit`                       | Close this tab, or the window if it is the last tab |

`download` with no name queues several files. An optional name is used for the first file. Each item shows the file name, percent, remaining time, an `.onion` URL, a progress bar, and a package log. Durations are random from 1 to 25 minutes, and the downloads run together.

`compile` with no arguments picks a tool at random and runs for 1 to 25 minutes. Tools are `java`, `npm`, `go`, `rust`, `gcc`, `dotnet`, and `python`. `compile go 10` runs that build for the given number of minutes (1–1440). The log fills the pane. Each line starts with `[YYYY-MM-DD hh:mm:ss:zzz]`. The next line waits 1 ms (50%), 50 ms (30%), 100 ms (10%), 500 ms (5%), or 3000 ms (5%). Only the level label is colored: `[INFO]` blue, `[DEBUG]` green, `[WARN]` yellow, and `[ERROR]` red. The rest of the line stays gray. `install rust 5 3` repeats that compile three times (up to 100 loops). Earlier output is hidden while a compile or install runs, so only the build is visible. When the job finishes or **Ctrl+C** stops it, the earlier output returns, the build is hidden, and the pane shows a summary with the result, command, target, elapsed time, loops, and finish time.

`monitor` shows a CPU chart that fills the pane. Each column is one second, and the row count follows the pane height. The chart argument is `line` (the default), `bar-horizontal`, `bar-vertical`, or `heatmap`. Bar marks use `░ ▒ ▓ █`. The line chart uses braille dots, four dots high in each row, so the curve is finer. Low values are purple, then indigo, blue, green, yellow, and orange, up to red for the highest values. Earlier output is hidden while it runs, so only the chart is visible. The heatmap sorts its blocks with selection sort. The scan starts at the top left and moves toward the bottom right. When it finds the next color in order, that block swaps into place, so purple, indigo, blue, green, yellow, orange, and red gather into bands. When that sort finishes, or **Ctrl+C** stops any chart, the earlier output returns, the chart is hidden, and the pane shows a summary. Line and bar charts move about once a second.

`algorithm` fills the pane with an ASCII visualization. The kind is `matrix` (the default), `fractal`, `donut`, `maze`, `sort`, `conway`, `particle`, `labyrinth`, `lorenz`, or `wave`. Earlier output is hidden while it runs, so only the grid is visible. Each character is a braille cell, two dots wide and four dots high, so curves and fills are finer than a single block. Matrix stays green alphanumeric rain (`0-9`, `A-Z`). The fractal zooms through the Mandelbrot set on its own. The donut keeps spinning. Maze carving, selection sort, and labyrinth search finish by themselves. The other kinds run until **Ctrl+C**. Stopping or finishing restores the earlier output, hides the grid, and shows a summary. Colors run from purple for low values to red for high values, except the green matrix rain.

`top` and `htop` read Chrome process stats. On Chrome Dev they use `chrome.processes`. On stable Chrome they use the `com.terminal.tasks` host, which runs `ps`.

`open` accepts an `http` or `https` URL. A host without a scheme is opened as `https`. The first visit to a site asks for permission. **Terminal** in the pane title bar returns to the shell.

`cat README.txt` prints a short note. Any other path reports that the file does not exist.

## Local shell

`com.terminal.shell` starts the login shell in a PTY from the extension page. Input, output, and terminal size are exchanged with the page. Scrollback from the live shell is not saved.
