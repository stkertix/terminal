const TERMINAL_URL = "src/terminal.html";
const WINDOW_WIDTH = 1100;
const WINDOW_HEIGHT = 720;
const FRAME_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "googlevideo.com",
  "ytimg.com",
  "ggpht.com",
  "google.com",
  "gstatic.com",
  "googleapis.com",
  "googleusercontent.com",
];
const FRAME_HEADERS = [
  { header: "x-frame-options", operation: "remove" },
  { header: "content-security-policy", operation: "remove" },
  { header: "content-security-policy-report-only", operation: "remove" },
  { header: "cross-origin-resource-policy", operation: "remove" },
];

const DOMAIN_KEY = "frameDomains";
let rememberedDomains = [];

export function frameRules(extensionId, domains = FRAME_DOMAINS) {
  const action = { type: "modifyHeaders", responseHeaders: FRAME_HEADERS };
  return [
    {
      id: 1,
      priority: 1,
      action,
      condition: {
        initiatorDomains: [extensionId],
        requestDomains: domains,
        resourceTypes: ["sub_frame"],
      },
    },
    {
      id: 2,
      priority: 1,
      action,
      condition: {
        initiatorDomains: domains,
        requestDomains: domains,
        resourceTypes: ["sub_frame"],
      },
    },
  ];
}

async function frameDomains(chromeApi, domain) {
  if (chromeApi.storage?.session) {
    const stored = await chromeApi.storage.session.get(DOMAIN_KEY);
    if (Array.isArray(stored[DOMAIN_KEY])) rememberedDomains = stored[DOMAIN_KEY];
  }
  if (domain && !FRAME_DOMAINS.includes(domain) && !rememberedDomains.includes(domain)) {
    rememberedDomains = [...rememberedDomains, domain];
    if (chromeApi.storage?.session) {
      await chromeApi.storage.session.set({ [DOMAIN_KEY]: rememberedDomains });
    }
  }
  return [...new Set([...FRAME_DOMAINS, ...rememberedDomains])];
}

export async function installFrameRules(chromeApi, tabId, domain) {
  const domains = await frameDomains(chromeApi, domain);
  await chromeApi.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1, 2],
    addRules: frameRules(chromeApi.runtime.id, domains),
  });

  if (typeof tabId !== "number") return;
  await chromeApi.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [3],
    addRules: [
      {
        id: 3,
        priority: 2,
        action: { type: "modifyHeaders", responseHeaders: FRAME_HEADERS },
        condition: {
          tabIds: [tabId],
          requestDomains: domains,
          resourceTypes: ["sub_frame"],
        },
      },
    ],
  });
}

export function pickWindowId(contexts) {
  const match = contexts.find((context) => typeof context.windowId === "number");
  return match ? match.windowId : null;
}

export async function openOrFocus(chromeApi) {
  const url = chromeApi.runtime.getURL(TERMINAL_URL);
  const contexts = await chromeApi.runtime.getContexts({
    contextTypes: ["TAB"],
    documentUrls: [url],
  });
  const existingId = pickWindowId(contexts);

  if (existingId !== null) {
    let existing = null;
    try {
      existing = await chromeApi.windows.get(existingId, { populate: true });
    } catch {
      existing = null;
    }
    if (existing) {
      const update = { focused: true };
      if (existing.state === "minimized") update.state = "normal";
      await chromeApi.windows.update(existingId, update);
      if (chromeApi.declarativeNetRequest) {
        await installFrameRules(chromeApi, existing.tabs?.[0]?.id);
      }
      return existingId;
    }
  }

  const created = await chromeApi.windows.create({
    url,
    type: "popup",
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    focused: true,
  });
  if (chromeApi.declarativeNetRequest && created.id != null) {
    const createdWindow = await chromeApi.windows.get(created.id, { populate: true });
    await installFrameRules(chromeApi, createdWindow.tabs?.[0]?.id);
  }
  return created.id ?? null;
}

let opening = null;

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "allow-framing") return;
    const domain = typeof message.domain === "string" ? message.domain : undefined;
    installFrameRules(chrome, sender.tab?.id, domain)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error("Failed to allow framing", error);
        sendResponse({ ok: false });
      });
    return true;
  });
}

if (typeof chrome !== "undefined" && chrome.declarativeNetRequest) {
  installFrameRules(chrome).catch((error) => {
    console.error("Failed to install framing rules", error);
  });
}

if (typeof chrome !== "undefined" && chrome.action) {
  chrome.action.onClicked.addListener(() => {
    if (opening) return;
    opening = openOrFocus(chrome)
      .catch((error) => {
        console.error("Failed to open terminal window", error);
      })
      .finally(() => {
        opening = null;
      });
  });
}
