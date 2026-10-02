# Terminal Simulator

A Chrome extension that opens a terminal window. Each pane can run the local login shell, or a built-in simulator when the shell host is not available.

## Requirements

- macOS
- Google Chrome
- Python 3 at `/usr/bin/python3` for the local shell and task manager hosts

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this directory.
4. Install the native hosts, then reload the extension:

```bash
native/install-macos.sh
```

The installer copies the hosts to `~/Library/Application Support/Terminal/` and registers them for this extension’s Chrome ID. Open the terminal from the extension icon. A page served outside the extension cannot reach the native hosts.

## Panes

The toolbar switches among **Single**, **Columns**, **Rows**, and **Grid**. Drag a pane by its title bar to move it. Drag the gap between panes to resize them: each row has its own widths, and both panes in a row share that row’s height.

Each pane has a **Shell** / **Simulator** switch. Shell is tried first. If native messaging is missing or the host is not installed, the pane stays on the simulator.

**Ctrl+L** clears the simulator screen. **Ctrl+C** stops a running simulator download, compile, or install. The prompt is hidden while one of those jobs is running.

## Simulator commands

| Command                           | Description                                |
| --------------------------------- | ------------------------------------------ |
| `help`                            | List commands                              |
| `clear`                           | Clear the screen                           |
| `echo`                            | Print arguments                            |
| `date`                            | Show the local date and time               |
| `history`                         | Show commands from this session            |
| `whoami`                          | Print the current user                     |
| `hostname`                        | Print the host name                        |
| `pwd`                             | Print the working directory                |
| `ls`                              | List files                                 |
| `cat`                             | Print a file                               |
| `uname`                           | Print system information                   |
| `download [name]`                 | Simulate parallel downloads                |
| `compile [TOOL MINUTES]`          | Simulate a build                           |
| `install TOOL MINUTES LOOPS`      | Run that compile the given number of times |
| `top`, `htop`                     | Show the Chrome task manager               |
| `open <url>`                      | Open a page in this pane                   |
| `exit`                            | Close the window                           |

`download` with no name queues several files. An optional name is used for the first file. Each item shows the file name, percent, remaining time, an `.onion` URL, a progress bar, and a package log. Durations are random from 1 to 25 minutes, and the downloads run together.

`compile` with no arguments picks a tool at random and runs for 1 to 25 minutes. Tools are `java`, `npm`, `go`, `rust`, `gcc`, `dotnet`, and `python`. `compile go 10` runs that build for the given number of minutes (1–1440). The log fills the pane, lines change every 100 ms to 1 second, and each line starts with `[YYYY-MM-DD hh:mm:ss:zzz]`. `install rust 5 3` repeats that compile three times (up to 100 loops). When the job finishes or **Ctrl+C** stops it, the pane shows a summary with the result, command, target, elapsed time, loops, and finish time.

`top` and `htop` read Chrome process stats. On Chrome Dev they use `chrome.processes`. On stable Chrome they use the `com.terminal.tasks` host, which runs `ps`.

## Local shell

`com.terminal.shell` starts the login shell in a PTY from the extension page. Input, output, and terminal size are exchanged with the page. Scrollback from the live shell is not saved.
