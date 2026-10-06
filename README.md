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

**Ctrl+L** clears the simulator screen. **Ctrl+C** stops a running simulator download, compile, install, monitor, algorithm, or play. The prompt is hidden while one of those jobs is running. Arrow up and down walk the command history of that pane.

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
| `play [soccer|padel]`        | Watch a top-down soccer or padel match             |
| `tarot FULL NAME YYYY-MM-DD` | Read three tarot cards from a name and birth date  |
| `top`, `htop`                | Show the Chrome task manager                        |
| `open <url>`                 | Open a page in this pane                            |
| `exit`                       | Close this tab, or the window if it is the last tab |

`download` with no name queues several files. An optional name is used for the first file. Each item shows the file name, percent, remaining time, an `.onion` URL, a progress bar, and a package log. Durations are random from 1 to 25 minutes, and the downloads run together.

`compile` with no arguments picks a tool at random and runs for 1 to 25 minutes. Tools are `java`, `npm`, `go`, `rust`, `gcc`, `dotnet`, and `python`. `compile go 10` runs that build for the given number of minutes (1–1440). The log fills the pane. Each line starts with `[YYYY-MM-DD hh:mm:ss:zzz]`. The next line waits 1 ms (50%), 50 ms (30%), 100 ms (10%), 500 ms (5%), or 3000 ms (5%). Only the level label is colored: `[INFO]` blue, `[DEBUG]` green, `[WARN]` yellow, and `[ERROR]` red. The rest of the line stays gray. `install rust 5 3` repeats that compile three times (up to 100 loops). Earlier output is hidden while a compile or install runs, so only the build is visible. When the job finishes or **Ctrl+C** stops it, the earlier output returns, the build is hidden, and the pane shows a summary with the result, command, target, elapsed time, loops, and finish time.

`monitor` shows a CPU chart that fills the pane. Each column is one second, and the row count follows the pane height. The chart argument is `line` (the default), `bar-horizontal`, `bar-vertical`, or `heatmap`. Bar marks use `░ ▒ ▓ █`. The line chart uses braille dots, four dots high in each row, so the curve is finer. Low values are purple, then indigo, blue, green, yellow, and orange, up to red for the highest values. Earlier output is hidden while it runs, so only the chart is visible. The heatmap sorts its blocks with selection sort. The scan starts at the top left and moves toward the bottom right. When it finds the next color in order, that block swaps into place, so purple, indigo, blue, green, yellow, orange, and red gather into bands. When that sort finishes, or **Ctrl+C** stops any chart, the earlier output returns, the chart is hidden, and the pane shows a summary. Line and bar charts move about once a second.

`algorithm` fills the pane with an ASCII visualization. The kind is `matrix` (the default), `fractal`, `donut`, `maze`, `sort`, `conway`, `particle`, `labyrinth`, `lorenz`, or `wave`. Earlier output is hidden while it runs, so only the grid is visible. Each character is a braille cell, two dots wide and four dots high, so curves and fills are finer than a single block. Matrix stays green alphanumeric rain (`0-9`, `A-Z`). The fractal zooms through the Mandelbrot set on its own. The donut keeps spinning. Maze carving, selection sort, and labyrinth search finish by themselves. The other kinds run until **Ctrl+C**. Stopping or finishing restores the earlier output, hides the grid, and shows a summary. Colors run from purple for low values to red for high values, except the green matrix rain.

`play` with no game, or `play soccer`, shows a top-down soccer match, 11 versus 11. The pitch stays 105 by 68 metres, so it keeps that proportion and does not stretch to the pane. Home is a blue `●` under the name, away is a red `●`, and the referee is a yellow `●` under `REF`. A yellow card puts a yellow mark above that name. The ball is a white `●`. The pitch is braille, two dots wide and four dots high, with bright green touchlines, halfway line, center circle, penalty areas, six-yard boxes, and goals. Players press, pass, and shoot on their own. While a side has the ball, its midfielders and forwards pack around the carrier, and a short pass under pressure can come straight back as a one-two. A free kick puts four opponents in a wall. A corner packs both teams in front of the goal. Each side can make three substitutions. The match pauses while the replaced player walks to the bottom center and the new player comes on from there. A late challenge is a foul: a basic foul, a yellow card, or a red card. A second yellow is a sending-off, and that player leaves the pitch. A foul outside the box gives a free kick. A foul inside the box gives a penalty. A shot that misses the goal is a goal kick. A save or a defender's touch that runs over the goal line is a corner. A ball over the touchline is a throw-in. The player taking a throw-in or a corner stands outside the pitch and stays on screen. Kick off, free kicks, penalties, corners, and throw-ins each wait 2 to 3 seconds before the ball is played. After a goal, that kick off waits until the players have walked back to their positions. On a corner, throw-in, free kick, or penalty, the players walk into place before the ball is kicked or thrown. A level score at 90 minutes continues into extra time through 120. Earlier output is hidden while it runs. The title at the top left shows `HOME` in blue and `AWAY` in red, with the score and the current restart. The match clock sits at the top right of the pitch as `mm:ss`, with First Half, Second Half, or Extra Time and its elapsed time. Under the pitch, the bottom left and bottom right show the active player on each side: name, position, and a stamina bar that runs from green at full to red at empty. Restart text sits in the bottom center, under the pitch, at a medium size. The log colors the player by team and the event by its kind. A log on the right lists each event as `mm:ss - event`, with a divider for First Half, Second Half, and Extra Time, and that list stays in the summary. The ball sits against the left or right of the player who is carrying it. When the match is over, reloading the page keeps the summary and leaves the pitch hidden. Full time is about three minutes of real time, a little longer when extra time is played. A goal celebration runs for several seconds before the players walk back. **Ctrl+C** stops the match. Stopping or finishing restores the earlier output, hides the pitch, and shows a summary with the score.

`play padel` watches one set, two versus two. Home is blue on the left and away is red on the right, with a short name and `H` or `A` under it. The name is dim until that player hits the ball. The court is the same braille pitch, 20 by 10 metres, with a net, two service boxes on each side, and glass walls. A ball off the wall stays in play. Serves alternate from the right box, then the left, into the diagonal box. A point goes to the other side on a second bounce in the same half, a net, or a ball that leaves without a legal bounce. Scoring is tennis points in one set: 0, 15, 30, 40, and golden point at deuce. The set ends at 6 games with a lead of two, or at 7–5. The title shows the points and the games, as in `padel  HOME 0 - 0 AWAY  3-2`. A finished game shows a braille `GAME` highlight with the game score. The log under the court uses `mm:ss - event`, and the full list stays in the summary. One set is about a minute. **Ctrl+C** stops it. The summary matches soccer, with command `play padel` and score `HOME n - n AWAY`.

`top` and `htop` read Chrome process stats. On Chrome Dev they use `chrome.processes`. On stable Chrome they use the `com.terminal.tasks` host, which runs `ps`.

`open` accepts an `http` or `https` URL. A host without a scheme is opened as `https`. The first visit to a site asks for permission. **Terminal** in the pane title bar returns to the shell.

`cat README.txt` prints a short note. Any other path reports that the file does not exist.

## Local shell

`com.terminal.shell` starts the login shell in a PTY from the extension page. Input, output, and terminal size are exchanged with the page. Scrollback from the live shell is not saved.
