#!/usr/bin/python3
"""Native messaging host that runs the user's login shell on a PTY."""

import array
import base64
import fcntl
import json
import os
import pty
import select
import signal
import struct
import sys
import termios
import time
import traceback

CHUNK = 64 * 1024
MAX_MESSAGE = 1024 * 1024


def write_all(fd, data):
    view = memoryview(data)
    while len(view):
        try:
            written = os.write(fd, view)
        except BlockingIOError:
            select.select([], [fd], [])
            continue
        if written <= 0:
            raise BrokenPipeError
        view = view[written:]


def send(message):
    payload = json.dumps(message, separators=(",", ":")).encode("utf-8")
    if len(payload) > MAX_MESSAGE:
        return
    write_all(sys.stdout.fileno(), struct.pack("<I", len(payload)) + payload)


def pop_message(buf):
    if len(buf) < 4:
        return None
    length = struct.unpack_from("<I", buf)[0]
    if length > MAX_MESSAGE:
        raise ValueError("native message is too large")
    total = 4 + length
    if len(buf) < total:
        return None
    payload = bytes(buf[4:total])
    del buf[:total]
    return json.loads(payload.decode("utf-8"))


def set_nonblocking(fd):
    flags = fcntl.fcntl(fd, fcntl.F_GETFL)
    fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)


def resize(fd, cols, rows):
    try:
        cols = int(cols)
        rows = int(rows)
    except (TypeError, ValueError):
        return
    if cols < 1 or rows < 1 or cols > 500 or rows > 500:
        return
    winsize = array.array("H", [rows, cols, 0, 0])
    try:
        fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)
    except OSError:
        return


def launch_shell():
    try:
        winsize = array.array("H", [24, 80, 0, 0])
        fcntl.ioctl(1, termios.TIOCSWINSZ, winsize)
        os.chdir(os.path.expanduser("~"))
        os.environ["TERM"] = "xterm-256color"
        shell = os.environ.get("SHELL") or "/bin/zsh"
        if not (os.path.isabs(shell) and os.access(shell, os.X_OK)):
            shell = "/bin/zsh" if os.access("/bin/zsh", os.X_OK) else "/bin/bash"
        os.execv(shell, [shell, "-l"])
    finally:
        os._exit(127)


def read_pty(fd):
    try:
        return os.read(fd, CHUNK)
    except BlockingIOError:
        return None
    except OSError:
        return b""


def handle(message, master):
    if not isinstance(message, dict):
        return True
    kind = message.get("type")
    if kind == "input":
        raw = message.get("data")
        if not isinstance(raw, str) or raw == "":
            return True
        try:
            data = base64.b64decode(raw)
        except (ValueError, TypeError):
            return True
        if data:
            write_all(master, data)
        return True
    if kind == "resize":
        resize(master, message.get("cols"), message.get("rows"))
        return True
    if kind == "close":
        return False
    return True


def reap(pid, state):
    if state["done"]:
        return 0
    try:
        waited, status = os.waitpid(pid, os.WNOHANG)
    except ChildProcessError:
        state["done"] = True
        return 0
    if waited == 0:
        try:
            _waited, status = os.waitpid(pid, 0)
        except ChildProcessError:
            state["done"] = True
            return 0
    state["done"] = True
    if os.WIFEXITED(status):
        return os.WEXITSTATUS(status)
    if os.WIFSIGNALED(status):
        return 128 + os.WTERMSIG(status)
    return 0


def stop_shell(pid, master, state):
    if master is not None:
        try:
            os.close(master)
        except OSError:
            pass
    if not pid or state["done"]:
        return
    for sig in (signal.SIGHUP, signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(pid, sig)
        except ProcessLookupError:
            state["done"] = True
            return
        except PermissionError:
            try:
                os.kill(pid, sig)
            except ProcessLookupError:
                state["done"] = True
                return
        try:
            waited, _status = os.waitpid(pid, os.WNOHANG)
        except ChildProcessError:
            state["done"] = True
            return
        if waited:
            state["done"] = True
            return
        time.sleep(0.05)
    try:
        os.waitpid(pid, 0)
    except ChildProcessError:
        pass
    state["done"] = True


def pump(pid, master, state):
    stdin_fd = sys.stdin.fileno()
    buf = bytearray()
    alive = True
    while True:
        watch = [stdin_fd]
        if alive:
            watch.append(master)
        try:
            readable, _writable, _errors = select.select(watch, [], [])
        except InterruptedError:
            continue
        if alive and master in readable:
            data = read_pty(master)
            if data is None:
                pass
            elif data == b"":
                send({"type": "exit", "code": reap(pid, state)})
                return
            else:
                send({
                    "type": "output",
                    "data": base64.b64encode(data).decode("ascii"),
                })
        if stdin_fd in readable:
            try:
                chunk = os.read(stdin_fd, CHUNK)
            except BlockingIOError:
                continue
            if chunk == b"":
                return
            buf.extend(chunk)
            while True:
                message = pop_message(buf)
                if message is None:
                    break
                if not handle(message, master):
                    return


def main():
    pid, master = pty.fork()
    if pid == 0:
        launch_shell()
    state = {"done": False}
    try:
        set_nonblocking(master)
        set_nonblocking(sys.stdin.fileno())
        send({"type": "ready"})
        pump(pid, master, state)
    finally:
        stop_shell(pid, master, state)


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        sys.exit(0)
    except Exception:
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
