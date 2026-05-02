// ==UserScript==
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
// ==/UserScript==

(() => {
  "use strict";

  const STORAGE_KEY = "yt_reverse_playlist_traversal_enabled";
  const WRAPPER_ID = "yt-reverse-playlist-action";
  const STYLE_ID = "yt-reverse-playlist-style";
  const REDIRECT_LOCK_MS = 1800;
  const NEAR_END_SECONDS = 1.25;

  let currentVideo = null;
  let lastRedirectAt = 0;
  let bootTimer = null;
  let observer = null;

  const getEnabled = () => localStorage.getItem(STORAGE_KEY) === "true";

  const setEnabled = (value) => {
    localStorage.setItem(STORAGE_KEY, String(Boolean(value)));
    updatePanelButton();
    updatePlayerControls();
    updateMediaSessionHandlers();
  };

  const isWatchWithPlaylist = () => {
    const url = new URL(location.href);
    return url.pathname === "/watch" && url.searchParams.has("list");
  };

  const getCurrentVideoId = () => {
    try {
      return new URL(location.href).searchParams.get("v");
    } catch {
      return null;
    }
  };

  const normalizeText = (value) => String(value || "").replace(/\s+/g, " ").trim();

  const appendText = (el, text) => {
    el.appendChild(document.createTextNode(text));
    return el;
  };

  const setAttrs = (el, attrs) => {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null) continue;
      el.setAttribute(key, String(value));
    }
    return el;
  };

  const addStyle = () => {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;

    appendText(
      style,
      `
        #${WRAPPER_ID} {
          display: inline-flex;
          align-items: center;
          vertical-align: middle;
        }

        #${WRAPPER_ID}[hidden] {
          display: none !important;
        }

        #${WRAPPER_ID} button {
          color: var(--yt-spec-text-primary, #f1f1f1);
        }

        #${WRAPPER_ID} button[aria-pressed="true"] {
          color: var(--yt-spec-call-to-action, #3ea6ff);
        }

        #${WRAPPER_ID} svg {
          pointer-events: none;
          display: block;
          width: 24px;
          height: 24px;
          fill: currentColor;
        }
      `
    );

    const parent = document.head || document.documentElement;
    parent.appendChild(style);
  };

  const createSvgIcon = () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    setAttrs(svg, {
      height: "24",
      width: "24",
      viewBox: "0 0 24 24",
      focusable: "false",
      "aria-hidden": "true",
    });

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      "M7 7h9.17l-2.58-2.59L15 3l5 5-5 5-1.41-1.41L16.17 9H7a3 3 0 0 0-3 3v1H2v-1a5 5 0 0 1 5-5Zm10 10H7.83l2.58 2.59L9 21l-5-5 5-5 1.41 1.41L7.83 15H17a3 3 0 0 0 3-3v-1h2v1a5 5 0 0 1-5 5Z"
    );

    svg.appendChild(path);
    return svg;
  };

  const createYouTubeLikeIconButton = () => {
    const button = document.createElement("button");

    setAttrs(button, {
      type: "button",
      class:
        "ytSpecButtonShapeNextHost ytSpecButtonShapeNextText ytSpecButtonShapeNextMono ytSpecButtonShapeNextSizeM ytSpecButtonShapeNextIconOnlyDefault ytSpecButtonShapeNextEnableBackdropFilterExperiment",
      "aria-pressed": "false",
      "aria-label": "Reverse playlist order",
      title: "Reverse playlist order",
    });

    const iconDiv = document.createElement("div");
    iconDiv.className = "ytSpecButtonShapeNextIcon";
    iconDiv.setAttribute("aria-hidden", "true");

    const wrapper1 = document.createElement("span");
    wrapper1.className = "ytIconWrapperHost";
    wrapper1.style.width = "24px";
    wrapper1.style.height = "24px";

    const wrapper2 = document.createElement("span");
    wrapper2.className = "yt-icon-shape ytSpecIconShapeHost";

    wrapper2.appendChild(createSvgIcon());
    wrapper1.appendChild(wrapper2);
    iconDiv.appendChild(wrapper1);
    button.appendChild(iconDiv);

    // Optional YouTube-like touch ripple structure.
    const touch = document.createElement("yt-touch-feedback-shape");
    touch.className = "ytSpecTouchFeedbackShapeHost ytSpecTouchFeedbackShapeTouchResponse";
    touch.setAttribute("aria-hidden", "true");

    const stroke = document.createElement("div");
    stroke.className = "ytSpecTouchFeedbackShapeStroke";

    const fill = document.createElement("div");
    fill.className = "ytSpecTouchFeedbackShapeFill";

    touch.appendChild(stroke);
    touch.appendChild(fill);
    button.appendChild(touch);

    return button;
  };

  const getPlaylistPanel = () => document.querySelector("ytd-playlist-panel-renderer");

  const getPlaylistActionRow = () => {
    const panel = getPlaylistPanel();
    if (!panel) return null;

    return (
      panel.querySelector("#playlist-actions #playlist-action-menu ytd-menu-renderer #top-level-buttons-computed") ||
      panel.querySelector("#playlist-action-menu #top-level-buttons-computed") ||
      panel.querySelector("#playlist-actions #start-actions") ||
      panel.querySelector("#playlist-actions")
    );
  };

  const createPanelButton = () => {
    addStyle();

    let wrapper = document.getElementById(WRAPPER_ID);

    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.id = WRAPPER_ID;
      wrapper.className = "style-scope ytd-menu-renderer";

      const button = createYouTubeLikeIconButton();

      button.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          setEnabled(!getEnabled());
        },
        true
      );

      wrapper.appendChild(button);
    }

    const row = getPlaylistActionRow();

    if (row && wrapper.parentElement !== row) {
      row.appendChild(wrapper);
    }

    updatePanelButton();
  };

  const updatePanelButton = () => {
    const wrapper = document.getElementById(WRAPPER_ID);
    const button = wrapper?.querySelector("button");
    if (!wrapper || !button) return;

    const visible = isWatchWithPlaylist();
    const enabled = getEnabled();

    wrapper.toggleAttribute("hidden", !visible);

    button.setAttribute("aria-pressed", String(enabled));
    button.setAttribute(
      "aria-label",
      enabled ? "Reverse playlist order is on" : "Reverse playlist order is off"
    );
    button.title = enabled ? "Reverse playlist: ON" : "Reverse playlist: OFF";
  };

  const getPlaylistItems = () => {
    return Array.from(document.querySelectorAll("ytd-playlist-panel-video-renderer")).filter(
      (item) => item.querySelector("a[href*='/watch']")
    );
  };

  const getSelectedItem = () => {
    return document.querySelector("ytd-playlist-panel-video-renderer[selected]");
  };

  const getVideoIdFromItem = (item) => {
    const link = item?.querySelector("a[href*='/watch']");
    if (!link) return null;

    try {
      const url = new URL(link.href || link.getAttribute("href"), location.origin);
      return url.searchParams.get("v");
    } catch {
      return null;
    }
  };

  const getItemInfo = (item) => {
    const link = item?.querySelector("a[href*='/watch']");
    if (!link) return null;

    let href;

    try {
      href = new URL(link.href || link.getAttribute("href"), location.origin).href;
    } catch {
      return null;
    }

    const title = normalizeText(
      link.getAttribute("title") ||
        link.getAttribute("aria-label") ||
        item.querySelector("#video-title")?.textContent ||
        item.textContent
    );

    const img = item.querySelector("img");
    const preview = img?.currentSrc || img?.src || img?.getAttribute("src") || "";

    return {
      href,
      title: title || "Playlist item",
      preview,
      videoId: getVideoIdFromItem(item),
    };
  };

  const isPlayableItem = (item) => {
    if (!item) return false;

    const text = normalizeText(item.innerText).toLowerCase();

    return ![
      "private video",
      "deleted video",
      "video unavailable",
      "unavailable",
      "removed",
      "premieres",
      "upcoming",
    ].some((badText) => text.includes(badText));
  };

  const findCurrentIndex = (items) => {
    const selected = getSelectedItem();

    if (selected) {
      const selectedIndex = items.indexOf(selected);
      if (selectedIndex !== -1) return selectedIndex;
    }

    const currentVideoId = getCurrentVideoId();
    if (!currentVideoId) return -1;

    return items.findIndex((item) => getVideoIdFromItem(item) === currentVideoId);
  };

  const getRelativePlayableItem = (direction) => {
    const items = getPlaylistItems();
    if (!items.length) return null;

    const currentIndex = findCurrentIndex(items);
    if (currentIndex === -1) return null;

    for (let i = currentIndex + direction; i >= 0 && i < items.length; i += direction) {
      if (isPlayableItem(items[i])) return items[i];
    }

    return null;
  };

  /*
    Your playlist is displayed like:

      Part 16
      Part 15
      ...
      Part 1

    So:
      logical Next     = previous DOM item
      logical Previous = next DOM item
  */
  const getTargetForControl = (control) => {
    if (control === "next") return getRelativePlayableItem(-1);
    if (control === "prev") return getRelativePlayableItem(1);
    return null;
  };

  const navigateToItem = (item) => {
    const info = getItemInfo(item);
    if (!info?.href) return false;

    location.assign(info.href);
    return true;
  };

  const navigateByControl = (control) => {
    if (!getEnabled()) return false;
    if (!isWatchWithPlaylist()) return false;

    const now = Date.now();
    if (now - lastRedirectAt < REDIRECT_LOCK_MS) return true;

    const target = getTargetForControl(control);
    if (!target) return true;

    lastRedirectAt = now;
    return navigateToItem(target);
  };

  const logicalNext = () => navigateByControl("next");

  const onTimeUpdate = () => {
    if (!currentVideo) return;
    if (!getEnabled()) return;
    if (!Number.isFinite(currentVideo.duration)) return;
    if (currentVideo.duration < 5) return;

    const remaining = currentVideo.duration - currentVideo.currentTime;

    if (remaining > 0 && remaining <= NEAR_END_SECONDS) {
      logicalNext();
    }
  };

  const onEnded = () => {
    logicalNext();
  };

  const attachVideoListener = () => {
    const video = document.querySelector("video.html5-main-video, video");

    if (!video || video === currentVideo) return;

    if (currentVideo) {
      currentVideo.removeEventListener("timeupdate", onTimeUpdate);
      currentVideo.removeEventListener("ended", onEnded);
    }

    currentVideo = video;
    currentVideo.addEventListener("timeupdate", onTimeUpdate);
    currentVideo.addEventListener("ended", onEnded);
  };

  const playerButtonConfigs = [
    {
      control: "prev",
      selector: ".ytp-prev-button",
      label: "Previous in reversed playlist",
      shortcut: "SHIFT+p",
      normalName: "Previous",
    },
    {
      control: "next",
      selector: ".ytp-next-button",
      label: "Next in reversed playlist",
      shortcut: "SHIFT+n",
      normalName: "Next",
    },
  ];

  const captureOriginalButtonState = (button) => {
    const videoId = getCurrentVideoId();

    if (button.__ytReverseOriginal?.videoId === videoId) return;

    button.__ytReverseOriginal = {
      videoId,
      href: button.getAttribute("href"),
      title: button.getAttribute("title"),
      ariaLabel: button.getAttribute("aria-label"),
      ariaDisabled: button.getAttribute("aria-disabled"),
      dataPreview: button.getAttribute("data-preview"),
      dataTooltipText: button.getAttribute("data-tooltip-text"),
      dataTitleNoTooltip: button.getAttribute("data-title-no-tooltip"),
      dataTooltipTitle: button.getAttribute("data-tooltip-title"),
    };
  };

  const restoreOriginalButtonState = (button) => {
    const original = button.__ytReverseOriginal;
    if (!original) return;

    const restoreAttr = (name, value) => {
      if (value == null) button.removeAttribute(name);
      else button.setAttribute(name, value);
    };

    restoreAttr("href", original.href);
    restoreAttr("title", original.title);
    restoreAttr("aria-label", original.ariaLabel);
    restoreAttr("aria-disabled", original.ariaDisabled);
    restoreAttr("data-preview", original.dataPreview);
    restoreAttr("data-tooltip-text", original.dataTooltipText);
    restoreAttr("data-title-no-tooltip", original.dataTitleNoTooltip);
    restoreAttr("data-tooltip-title", original.dataTooltipTitle);

    delete button.__ytReverseOriginal;
  };

  const applyControlTarget = (button, config) => {
    const targetItem = getTargetForControl(config.control);
    const targetInfo = getItemInfo(targetItem);

    captureOriginalButtonState(button);

    if (!targetInfo) {
      button.removeAttribute("href");
      button.setAttribute("aria-disabled", "true");
      button.setAttribute("title", `No ${config.normalName.toLowerCase()} item in reversed playlist`);
      button.setAttribute(
        "aria-label",
        `No ${config.normalName.toLowerCase()} item in reversed playlist`
      );
      button.setAttribute("data-tooltip-text", "End of reversed playlist");
      button.setAttribute("data-tooltip-title", button.getAttribute("title"));
      return;
    }

    const title = `${config.label} (${config.shortcut})`;

    button.setAttribute("href", targetInfo.href);
    button.setAttribute("aria-disabled", "false");
    button.setAttribute("title", title);
    button.setAttribute("aria-label", `${config.label} keyboard shortcut ${config.shortcut}`);
    button.setAttribute("data-title-no-tooltip", config.normalName);
    button.setAttribute("data-tooltip-title", title);
    button.setAttribute("data-tooltip-text", targetInfo.title);

    if (targetInfo.preview) {
      button.setAttribute("data-preview", targetInfo.preview);
    }
  };

  const updatePlayerControls = () => {
    for (const config of playerButtonConfigs) {
      const button = document.querySelector(config.selector);
      if (!button) continue;

      if (getEnabled() && isWatchWithPlaylist()) {
        applyControlTarget(button, config);
      } else {
        restoreOriginalButtonState(button);
      }
    }
  };

  const findPlayerControlFromEvent = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return null;

    const button = target.closest(".ytp-next-button, .ytp-prev-button");
    if (!button) return null;

    if (button.classList.contains("ytp-next-button")) return "next";
    if (button.classList.contains("ytp-prev-button")) return "prev";

    return null;
  };

  const onGlobalClick = (event) => {
    if (!getEnabled()) return;
    if (!isWatchWithPlaylist()) return;

    const control = findPlayerControlFromEvent(event);
    if (!control) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    navigateByControl(control);
  };

  const isTypingTarget = (target) => {
    const element = target instanceof Element ? target : null;
    if (!element) return false;

    return Boolean(
      element.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']")
    );
  };

  const onKeyDown = (event) => {
    if (!getEnabled()) return;
    if (!isWatchWithPlaylist()) return;
    if (isTypingTarget(event.target)) return;
    if (!event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;

    const key = event.key.toLowerCase();

    if (key !== "n" && key !== "p") return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    navigateByControl(key === "n" ? "next" : "prev");
  };

  const updateMediaSessionHandlers = () => {
    if (!("mediaSession" in navigator)) return;

    try {
      if (getEnabled() && isWatchWithPlaylist()) {
        navigator.mediaSession.setActionHandler("nexttrack", () => navigateByControl("next"));
        navigator.mediaSession.setActionHandler("previoustrack", () => navigateByControl("prev"));
      } else {
        navigator.mediaSession.setActionHandler("nexttrack", null);
        navigator.mediaSession.setActionHandler("previoustrack", null);
      }
    } catch {
      // Some browsers reject MediaSession handlers.
    }
  };

  const boot = () => {
    try {
      attachVideoListener();
      createPanelButton();
      updatePanelButton();
      updatePlayerControls();
      updateMediaSessionHandlers();
    } catch (error) {
      console.error("[YT Reverse Playlist] boot failed:", error);
    }
  };

  const scheduleBoot = () => {
    clearTimeout(bootTimer);
    bootTimer = setTimeout(boot, 200);
  };

  const start = () => {
    document.addEventListener("click", onGlobalClick, true);
    document.addEventListener("auxclick", onGlobalClick, true);
    document.addEventListener("keydown", onKeyDown, true);

    window.addEventListener("yt-navigate-finish", scheduleBoot);
    window.addEventListener("yt-page-data-updated", scheduleBoot);
    window.addEventListener("popstate", scheduleBoot);
    document.addEventListener("visibilitychange", scheduleBoot);

    if (!document.documentElement) {
      setTimeout(start, 50);
      return;
    }

    if (!observer) {
      observer = new MutationObserver(scheduleBoot);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }

    scheduleBoot();
  };

  start();
})();
