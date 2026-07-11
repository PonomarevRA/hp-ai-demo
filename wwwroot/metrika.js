(function (window) {
  const COUNTER_ID = 110578140;

  const SCREEN_TITLES = {
    home: "Главная · анализ портфеля",
    v1: "V1 · банковская аналитика",
    v2: "V2 · investor cockpit",
    v3: "V3 · metric lab",
    v4: "V4 · full investor report",
    scale: "Масштабирование",
    history: "История данных",
    agents: "ИИ-агенты",
    ops: "Операции и расчеты",
    architecture: "Архитектура и MCP",
  };

  const VERSION_SCREENS = new Set(["v1", "v2", "v3", "v4"]);

  function ymSafe() {
    if (typeof window.ym !== "function") return;
    try {
      window.ym.apply(window, arguments);
    } catch (_) {}
  }

  function virtualPath(screen) {
    return screen === "home" ? "/" : `/${screen}`;
  }

  function getScrollDepth() {
    const doc = document.documentElement;
    const scrollTop = window.scrollY || doc.scrollTop || 0;
    const viewport = window.innerHeight || doc.clientHeight || 0;
    const fullHeight = Math.max(doc.scrollHeight, 1);
    return Math.min(100, Math.round((scrollTop + viewport) / fullHeight * 100));
  }

  function trackScreenView(screen, params) {
    const payload = params || {};
    ymSafe(COUNTER_ID, "hit", virtualPath(screen), {
      title: SCREEN_TITLES[screen] || screen,
      referer: window.location.href,
      params: {
        spa: 1,
        screen,
        ...payload,
      },
    });
  }

  function trackGoal(goal, params) {
    ymSafe(COUNTER_ID, "reachGoal", goal, params || {});
  }

  function trackVersionOpen(screen, fromScreen, params) {
    if (!VERSION_SCREENS.has(screen)) return;
    trackGoal("spa_version_open", {
      version: screen,
      from: fromScreen || "direct",
      ...(params || {}),
    });
  }

  function startScrollTracking(screen, options) {
    const config = options || {};
    const seen = new Set();
    let maxDepth = getScrollDepth();
    let order = 0;
    let stopped = false;

    function onScroll() {
      maxDepth = Math.max(maxDepth, getScrollDepth());
    }

    window.addEventListener("scroll", onScroll, { passive: true });

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.35) return;
        const block = entry.target.getAttribute("data-metrika-block");
        if (!block) return;

        const key = `${screen}:${block}`;
        if (seen.has(key)) return;
        seen.add(key);
        order += 1;

        trackGoal("spa_block_view", {
          screen,
          block,
          order,
          scroll_depth: getScrollDepth(),
          has_data: config.hasData ? 1 : 0,
          reports: config.reportsCount || 0,
        });
      });
    }, { threshold: [0.35, 0.55, 0.75] });

    function observeBlocks() {
      if (stopped) return;
      document.querySelectorAll("[data-metrika-block]").forEach((element) => observer.observe(element));
    }

    const observeTimer = window.setTimeout(observeBlocks, 120);
    const mutationObserver = new MutationObserver(() => observeBlocks());
    const root = document.querySelector(".shell") || document.body;
    mutationObserver.observe(root, { childList: true, subtree: true });

    return function stopScrollTracking() {
      if (stopped) return;
      stopped = true;
      window.clearTimeout(observeTimer);
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
      mutationObserver.disconnect();

      trackGoal("spa_scroll_depth", {
        screen,
        depth: maxDepth,
        blocks_seen: seen.size,
        has_data: config.hasData ? 1 : 0,
        reports: config.reportsCount || 0,
      });
    };
  }

  function trackReportChat(action, params) {
    trackGoal("spa_report_chat", {
      action,
      ...(params || {}),
    });
  }

  window.MetrikaSPA = {
    COUNTER_ID,
    SCREEN_TITLES,
    trackScreenView,
    trackGoal,
    trackVersionOpen,
    trackReportChat,
    startScrollTracking,
    getScrollDepth,
  };
})(window);
