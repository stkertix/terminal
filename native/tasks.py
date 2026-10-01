#!/usr/bin/python3
"""Stream Google Chrome process stats to the extension until the port closes."""

import json
import os
import select
import struct
import subprocess
import sys

MAX_MESSAGE = 1024 * 1024


def send(payload):
    data = payload.encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def read_exact(count):
    data = b""
    while len(data) < count:
        chunk = sys.stdin.buffer.read(count - len(data))
        if not chunk:
            return None
        data += chunk
    return data


def role(command):
    marker = command.split("--type=", 1)[1].split()[0] if "--type=" in command else ""
    if marker == "renderer" or "Helper (Renderer)" in command:
        return "renderer", "Renderer"
    if marker in {"gpu-process", "gpu"} or "Helper (GPU)" in command:
        return "gpu", "GPU"
    if "crashpad" in command or marker == "crashpad":
        return "utility", "Crashpad"
    if marker == "utility" or "Helper" in command:
        return "utility", "Utility"
    if "/MacOS/Google Chrome" in command or command.endswith("Google Chrome"):
        return "browser", "Browser"
    return "other", "Chrome"


def chrome_rows():
    env = os.environ.copy()
    env["LC_ALL"] = "C"
    raw = subprocess.check_output(
        ["/bin/ps", "-ax", "-o", "pid=,pcpu=,rss=,command="],
        text=True,
        env=env,
    )
    rows = []
    for line in raw.splitlines():
        parts = line.strip().split(None, 3)
        if len(parts) < 4 or "Google Chrome.app" not in parts[3]:
            continue
        pid, cpu, rss, command = parts
        kind, title = role(command)
        try:
            rows.append(
                {
                    "pid": int(pid),
                    "cpu": float(cpu),
                    "memory": int(rss) * 1024,
                    "type": kind,
                    "title": title,
                }
            )
        except ValueError:
            continue
    return rows


def main():
    try:
        while True:
            send(json.dumps({"type": "processes", "rows": chrome_rows()}))
            ready, _, _ = select.select([sys.stdin.buffer], [], [], 1.0)
            if not ready:
                continue
            header = read_exact(4)
            if not header:
                return
            length = struct.unpack("<I", header)[0]
            if length > MAX_MESSAGE or read_exact(length) is None:
                return
    except BrokenPipeError:
        return
    except Exception as error:
        sys.stderr.write(f"task host failed: {error}\n")
        return


if __name__ == "__main__":
    main()
