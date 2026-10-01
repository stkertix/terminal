const HOST_NAME = "com.terminal.shell";

function encodeText(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function decodeBase64(data) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function closedShell() {
  return {
    write() {},
    resize() {},
    close() {},
  };
}

function nativeError() {
  const message = globalThis.chrome?.runtime?.lastError?.message;
  return typeof message === "string" ? message : "";
}

export function connectLocalShell({ onReady, onOutput, onExit, onFailure }) {
  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.connectNative) {
    queueMicrotask(() => onFailure("Native messaging is unavailable. Open Terminal from the extension icon."));
    return closedShell();
  }

  let port;
  try {
    port = runtime.connectNative(HOST_NAME);
  } catch (error) {
    const message = nativeError() || (error instanceof Error ? error.message : "");
    queueMicrotask(() => onFailure(message));
    return closedShell();
  }

  let ready = false;
  let closed = false;
  let queued = "";
  let size = null;
  const decoder = new TextDecoder();

  function post(message) {
    if (closed) return;
    try {
      port.postMessage(message);
    } catch {
      // The port is already closed when the host exits.
    }
  }

  port.onMessage.addListener((message) => {
    if (closed || !message || typeof message.type !== "string") return;
    if (message.type === "ready") {
      ready = true;
      onReady();
      if (queued) {
        post({ type: "input", data: encodeText(queued) });
        queued = "";
      }
      if (size) post({ type: "resize", cols: size.cols, rows: size.rows });
      return;
    }
    if (message.type === "output" && typeof message.data === "string") {
      try {
        onOutput(decoder.decode(decodeBase64(message.data), { stream: true }));
      } catch {
        // Keep the session if one chunk cannot be decoded.
      }
      return;
    }
    if (message.type === "exit") onExit();
  });

  port.onDisconnect.addListener(() => {
    if (closed) return;
    closed = true;
    if (ready) onExit();
    else onFailure(nativeError());
  });

  return {
    write(text) {
      if (closed || !text) return;
      if (!ready) {
        queued += text;
        return;
      }
      post({ type: "input", data: encodeText(text) });
    },
    resize(cols, rows) {
      if (closed || cols < 1 || rows < 1) return;
      size = { cols, rows };
      if (ready) post({ type: "resize", cols, rows });
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        port.postMessage({ type: "close" });
      } catch {
        // Already disconnected.
      }
      try {
        port.disconnect();
      } catch {
        // Already disconnected.
      }
    },
  };
}
