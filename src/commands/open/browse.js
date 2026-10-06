export function createBrowseView(env) {
  async function show(url) {
    const pageUrl = new URL(url);
    env.element.dataset.browse = pageUrl.href;
    env.element.classList.add("is-browsing");
    env.frame.title = pageUrl.hostname;
    env.title.textContent = pageUrl.hostname;
    if (globalThis.chrome?.runtime?.sendMessage) {
      try {
        await chrome.runtime.sendMessage({ type: "allow-framing", domain: pageUrl.hostname });
      } catch (error) {
        console.error("Failed to allow framing", error);
      }
    }
    if (env.frame.getAttribute("src") && env.frame.getAttribute("src") !== "about:blank") {
      env.frame.src = "about:blank";
      await new Promise((resolve) => {
        env.frame.addEventListener("load", resolve, { once: true });
      });
    }
    env.frame.src = pageUrl.href;
  }

  function hide() {
    env.element.classList.remove("is-browsing");
    delete env.element.dataset.browse;
    env.frame.removeAttribute("src");
    env.title.textContent = "user@host";
    env.input.focus();
    env.scheduleSave();
  }

  return { show, hide };
}
