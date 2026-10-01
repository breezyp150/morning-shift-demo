/* Morning Shift — one coordinated motion and interaction system.
 * No dependencies. Everything here is progressive enhancement: the HTML is
 * complete and usable before this file runs.
 *
 * Sections: env, ticker, nav, order chooser, hero video + parallax, reveals,
 * menu tabs, spiral gallery, our-space scrub, sticky CTA, lightbox.
 */
(function () {
  "use strict";
  const doc = document;
  const html = doc.documentElement;
  html.classList.add("js");

  /* ---------- Environment ---------- */
  const params = new URLSearchParams(location.search);
  if (params.get("motion") === "reduced") html.classList.add("reduced-motion"); // test override
  const mqReduced = matchMedia("(prefers-reduced-motion: reduce)");
  const mqFine = matchMedia("(pointer: fine)");
  const mqDesktop = matchMedia("(min-width: 768px)");
  const mqCover = matchMedia("(min-width: 1024px), (min-width: 768px) and (orientation: landscape)");
  const conn = navigator.connection || {};
  const env = {
    get reduced() { return mqReduced.matches || html.classList.contains("reduced-motion"); },
    get saveData() { return !!conn.saveData; },
    get slowNet() { return /(^|-)2g$/.test(conn.effectiveType || ""); },
    get lowPower() {
      return (navigator.hardwareConcurrency || 4) <= 2 || (navigator.deviceMemory && navigator.deviceMemory < 2);
    },
    get fine() { return mqFine.matches; },
    get desktop() { return mqDesktop.matches; },
    get coverHero() { return mqCover.matches; },
    get hidden() { return doc.visibilityState === "hidden"; },
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- Ticker: one rAF loop shared by every animated system ---------- */
  const ticker = (() => {
    const subs = new Set();
    let raf = 0, last = 0;
    function frame(t) {
      raf = 0;
      const dt = last ? Math.min(64, t - last) : 16;
      last = t;
      for (const s of subs) s(dt, t);
      if (subs.size) raf = requestAnimationFrame(frame);
      else last = 0;
    }
    return {
      add(fn) { subs.add(fn); if (!raf) raf = requestAnimationFrame(frame); },
      remove(fn) { subs.delete(fn); },
    };
  })();

  /* Scroll-linked work runs once per frame after a scroll/resize event. */
  const scrollFx = [];
  let scrollDirty = true;
  function onScrollFrame() {
    if (!scrollDirty) return;
    scrollDirty = false;
    const vh = innerHeight;
    for (const fx of scrollFx) fx(vh);
  }
  addEventListener("scroll", () => { scrollDirty = true; }, { passive: true });
  addEventListener("resize", () => { scrollDirty = true; }, { passive: true });
  ticker.add(onScrollFrame);

  /* ---------- Navigation ---------- */
  const nav = doc.getElementById("site-nav");
  function updateNav() {
    nav.classList.toggle("is-solid", scrollY > 24);
    nav.classList.toggle("is-mobile", !env.desktop);
  }
  scrollFx.push(updateNav);
  mqDesktop.addEventListener("change", () => { scrollDirty = true; });

  /* ---------- Order chooser ---------- */
  const orderDialog = doc.getElementById("order-dialog");
  let lastTrigger = null;
  if (orderDialog && typeof orderDialog.showModal === "function") {
    doc.querySelectorAll("[data-chooser]").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        lastTrigger = a;
        orderDialog.showModal();
        const first = orderDialog.querySelector("a");
        if (first) first.focus();
      });
    });
    orderDialog.addEventListener("close", () => { if (lastTrigger) lastTrigger.focus(); });
    orderDialog.addEventListener("click", (e) => { if (e.target === orderDialog) orderDialog.close(); });
  }

  /* ---------- Hero video: continuous loop with a poster crossfade ----------
   * The video starts outside and ends inside, so a hard loop would jump. The poster is
   * the video's own first frame: at the end we hold the logo frame briefly, fade the
   * video out over the poster, seek to 0 and fade back in. Frame 0 == poster, so the
   * restart is invisible. The title reveals when ~2 s remain and fades out with the loop.
   */
  const hero = doc.querySelector(".hero");
  const heroMedia = doc.getElementById("hero-media");
  const video = doc.getElementById("hero-video");
  const heroControls = doc.getElementById("hero-controls");
  const heroToggle = doc.getElementById("hero-toggle");
  const titleBlock = doc.getElementById("hero-title-block");
  const HERO = { revealBefore: 2.0, holdMs: 2400, fadeMs: 800 };
  const heroState = { enabled: false, userPaused: false, inView: true, loaded: false, phase: "idle", holdTimer: 0, fadeTimer: 0, titleShown: false };

  function showTitle(on) {
    if (heroState.titleShown === on) return;
    heroState.titleShown = on;
    titleBlock.classList.toggle("is-shown", on);
  }
  function videoAllowed() {
    return !env.reduced && !env.saveData && !env.slowNet && !!video && typeof video.play === "function";
  }
  function loadVideo() {
    if (heroState.loaded) return;
    heroState.loaded = true;
    video.src = innerWidth >= 1024 ? "assets/video/hero-1080.mp4" : "assets/video/hero-720.mp4";
    video.load();
  }
  function canRun() {
    return heroState.enabled && !heroState.userPaused && heroState.inView && !env.hidden && !(spiral && spiral.running);
  }
  function clearTimers() { clearTimeout(heroState.holdTimer); clearTimeout(heroState.fadeTimer); }
  function restartCycle() {
    if (!canRun()) { heroState.phase = "paused-hold"; return; }
    heroState.phase = "fade";
    hero.classList.add("is-fading");
    showTitle(false);
    heroState.fadeTimer = setTimeout(() => {
      if (!canRun()) { heroState.phase = "paused-hold"; return; }
      video.currentTime = 0;
      const p = video.play();
      if (p && p.catch) p.catch(() => { heroState.phase = "paused-hold"; });
    }, HERO.fadeMs);
  }
  function tryPlay() {
    if (!canRun()) return;
    loadVideo();
    if (heroState.phase === "paused-hold") { heroState.phase = "hold"; heroState.holdTimer = setTimeout(restartCycle, 700); return; }
    if (heroState.phase === "hold" || heroState.phase === "fade") return;
    const p = video.play();
    if (p && p.catch) p.catch(() => { /* autoplay blocked: poster remains, title shows */ showTitle(true); });
  }
  function pauseVideo() {
    clearTimers();
    if (heroState.phase === "hold" || heroState.phase === "fade") heroState.phase = "paused-hold";
    if (!video.paused) video.pause();
  }
  function heroTick() {
    if (video.paused || !video.duration) return;
    if (video.duration - video.currentTime <= HERO.revealBefore) showTitle(true);
  }
  function setToggle(playing) {
    heroToggle.textContent = playing ? "Pause video" : "Play video";
    heroToggle.setAttribute("aria-pressed", playing ? "false" : "true");
  }
  if (videoAllowed()) {
    heroState.enabled = true;
    heroControls.hidden = false;
    video.addEventListener("playing", () => {
      hero.classList.add("is-playing");
      hero.classList.remove("is-fading");
      heroState.phase = "play";
      setToggle(true);
      ticker.add(heroTick);
    });
    video.addEventListener("pause", () => { ticker.remove(heroTick); if (video.ended) return; setToggle(!heroState.userPaused && (heroState.phase === "hold" || heroState.phase === "fade")); });
    video.addEventListener("ended", () => {
      ticker.remove(heroTick);
      showTitle(true);
      heroState.phase = "hold";
      clearTimers();
      if (canRun()) heroState.holdTimer = setTimeout(restartCycle, HERO.holdMs); else heroState.phase = "paused-hold";
    });
    heroToggle.addEventListener("click", () => {
      if (heroState.userPaused) { heroState.userPaused = false; setToggle(true); tryPlay(); }
      else { heroState.userPaused = true; pauseVideo(); setToggle(false); }
    });
    const heroIO = new IntersectionObserver((entries) => {
      heroState.inView = entries[0].isIntersecting;
      if (heroState.inView) tryPlay(); else pauseVideo();
    }, { threshold: 0.25 });
    heroIO.observe(hero);
    doc.addEventListener("visibilitychange", () => { if (env.hidden) pauseVideo(); else tryPlay(); });
    // Start after first paint so the poster and CTAs land first; the title waits for the cycle.
    requestAnimationFrame(() => setTimeout(tryPlay, 250));
  } else {
    showTitle(true); // static poster with the title visible
  }

  /* Hero parallax: up to 6% rise and 1 -> 1.04 scale across the 70vh overlap. */
  scrollFx.push((vh) => {
    if (env.reduced || !env.coverHero) { heroMedia.style.transform = ""; return; }
    const p = clamp(scrollY / (vh * 0.7), 0, 1);
    heroMedia.style.transform = `translate3d(0, ${(-6 * p).toFixed(3)}%, 0) scale(${(1 + 0.04 * p).toFixed(4)})`;
  });

  /* ---------- Entrance reveals ---------- */
  const revealIO = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add("in"); revealIO.unobserve(en.target); }
  }, { threshold: 0.2, rootMargin: "0px 0px -8% 0px" });
  doc.querySelectorAll(".reveal-mask, .reveal-rise").forEach((el) => revealIO.observe(el));

  /* ---------- Menu tabs ---------- */
  (function menuTabs() {
    const tablist = doc.getElementById("menu-tabs");
    const panels = Array.from(doc.querySelectorAll(".menu-panel"));
    if (!tablist || !panels.length) return;
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
    const indicator = doc.createElement("span");
    indicator.className = "tab-indicator";
    tablist.appendChild(indicator);
    let current = 0;

    function moveIndicator(tab) {
      indicator.style.left = tab.offsetLeft + "px";
      indicator.style.width = tab.offsetWidth + "px";
    }
    function activate(i, { focus = false, replaceHash = true } = {}) {
      i = clamp(i, 0, tabs.length - 1);
      tabs.forEach((t, k) => {
        const on = k === i;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        panels[k].hidden = !on;
        panels[k].classList.toggle("is-entering", on);
      });
      current = i;
      moveIndicator(tabs[i]);
      // Keep the active tab visible inside the strip without moving the page.
      const tl = tabs[i].offsetLeft, tr = tl + tabs[i].offsetWidth;
      if (tl < tablist.scrollLeft) tablist.scrollTo({ left: tl - 16, behavior: env.reduced ? "auto" : "smooth" });
      else if (tr > tablist.scrollLeft + tablist.clientWidth) tablist.scrollTo({ left: tr - tablist.clientWidth + 16, behavior: env.reduced ? "auto" : "smooth" });
      if (focus) tabs[i].focus();
      if (replaceHash && history.replaceState) history.replaceState(null, "", "#" + panels[i].id);
    }
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => activate(i));
      t.addEventListener("keydown", (e) => {
        const map = { ArrowRight: 1, ArrowLeft: -1 };
        if (e.key in map) { e.preventDefault(); activate((current + map[e.key] + tabs.length) % tabs.length, { focus: true }); }
        else if (e.key === "Home") { e.preventDefault(); activate(0, { focus: true }); }
        else if (e.key === "End") { e.preventDefault(); activate(tabs.length - 1, { focus: true }); }
      });
    });
    function fromHash(scroll) {
      const h = decodeURIComponent(location.hash.slice(1));
      if (!h) return false;
      let idx = panels.findIndex((p) => p.id === h);
      let target = null;
      if (idx < 0) {
        const item = doc.getElementById(h);
        if (item && item.classList.contains("menu-item")) {
          idx = panels.findIndex((p) => p.contains(item));
          target = item;
        }
      }
      if (idx < 0) return false;
      activate(idx, { replaceHash: false });
      if (scroll) (target || doc.getElementById("menu")).scrollIntoView({ behavior: env.reduced ? "auto" : "smooth", block: target ? "center" : "start" });
      return true;
    }
    addEventListener("hashchange", () => fromHash(true));
    addEventListener("resize", () => moveIndicator(tabs[current]), { passive: true });
    if (!fromHash(false)) activate(0, { replaceHash: false });
  })();

  /* ---------- Spiral gallery ---------- */
  const spiral = (function spiralGallery() {
    const stage = doc.getElementById("spiral-stage");
    const track = doc.getElementById("spiral-track");
    const controls = doc.getElementById("spiral-controls");
    if (!stage || !track) return null;
    const cards = Array.from(track.querySelectorAll(".card"));
    const N = cards.length;
    const btnPrev = doc.getElementById("spiral-prev");
    const btnNext = doc.getElementById("spiral-next");
    const btnToggle = doc.getElementById("spiral-toggle");
    const S = {
      live: false, running: false, userPaused: false, hoverPaused: false, inView: false,
      phase: 0, target: null, animFrom: 0, animStart: 0, animDur: 0,
      tiltX: 0, tiltY: 0, period: 9000, W: 0, H: 0, a: 0, yAmp: 0, depth: 350, mobile: false,
    };
    const capable = () => !env.reduced && !env.lowPower && !env.saveData && innerWidth >= 360;

    function measure() {
      const r = stage.getBoundingClientRect();
      S.W = r.width; S.H = r.height;
      S.mobile = innerWidth < 768;
      S.period = S.mobile ? 11000 : 9000;
      const base = S.mobile ? clamp(innerWidth * 0.42, 130, 200) : clamp(innerWidth * 0.2, 200, 300);
      const landscapeF = S.mobile ? 1.15 : 1.25;
      stage.style.setProperty("--card-w", base + "px");
      cards.forEach((c) => {
        const ar = c.style.getPropertyValue("--ar");
        const [w, h] = ar.split("/").map(Number);
        const landscape = w / h > 1.05;
        c.style.width = Math.round(base * (landscape ? landscapeF : 1)) + "px";
      });
      // Side cards sit at depth 0 (scale 1): keep them inside the stage.
      const maxHalf = base * landscapeF / 2;
      S.a = Math.min(S.W * (S.mobile ? 0.3 : 0.34), S.W / 2 - maxHalf - 14);
      S.yAmp = S.H * (S.mobile ? 0.05 : 0.06);
      S.depth = S.mobile ? 220 : 350; // px of translateZ; perspective is 1400px
    }
    function render() {
      const tilt = env.fine && !S.mobile ? `rotateX(${S.tiltX.toFixed(2)}deg) rotateY(${S.tiltY.toFixed(2)}deg)` : "";
      track.style.transform = tilt;
      const counter = tilt ? ` rotateY(${(-S.tiltY).toFixed(2)}deg) rotateX(${(-S.tiltX).toFixed(2)}deg)` : "";
      for (let i = 0; i < N; i++) {
        const th = ((i / N) + S.phase) * Math.PI * 2;
        const z = Math.cos(th);                 // 1 = front, -1 = back
        const d = (z + 1) / 2;                  // 0..1
        const x = S.a * Math.sin(th);
        const y = S.yAmp * z;
        const zpx = S.depth * z;                // perspective does the scaling: ~1.33 front, ~0.8 back
        let op = 0.5 + 0.5 * d;
        if (S.mobile && z < -0.35) op = 0;      // keep 4-5 cards visible on phones
        const c = cards[i];
        c.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${zpx.toFixed(1)}px)${counter}`;
        c.style.opacity = op.toFixed(3);
        c.style.zIndex = String(Math.round(d * 100));
        c.style.visibility = op === 0 ? "hidden" : "visible";
      }
    }
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    function tick(dt, now) {
      if (!S.live) return;
      if (S.target !== null) {
        const t = clamp((now - S.animStart) / S.animDur, 0, 1);
        S.phase = S.animFrom + (S.target - S.animFrom) * easeOut(t);
        if (t >= 1) { S.phase = ((S.target % 1) + 1) % 1; S.target = null; }
      } else if (S.running) {
        S.phase = (S.phase + dt / S.period) % 1;
      }
      render();
    }
    function setRunning(on) {
      S.running = on && S.live && S.inView && !S.userPaused && !S.hoverPaused && !env.hidden;
      if (S.running) {
        if (video && !video.paused) pauseVideo();
        ticker.add(tick);
      } else if (S.target === null) {
        ticker.remove(tick);
      }
      if (btnToggle) {
        btnToggle.textContent = S.userPaused ? "Resume" : "Pause";
        btnToggle.setAttribute("aria-pressed", S.userPaused ? "true" : "false");
      }
    }
    function animateTo(targetPhase, dur = 500) {
      // shortest path around the loop
      let from = S.phase;
      let to = targetPhase;
      let diff = to - from;
      diff = diff - Math.round(diff);
      S.animFrom = from; S.target = from + diff; S.animStart = performance.now(); S.animDur = env.reduced ? 1 : dur;
      ticker.add(tick);
    }
    function bringForward(i) { animateTo(((-i / N) % 1 + 1) % 1); }
    function step(dir) { animateTo(S.phase - dir / N); }

    function enable() {
      if (S.live) return;
      S.live = true;
      stage.classList.remove("is-static");
      stage.classList.add("is-live", "pre");
      controls.hidden = false;
      measure(); render();
      const unpre = () => stage.classList.remove("pre");
      requestAnimationFrame(() => requestAnimationFrame(unpre));
      setTimeout(unpre, 120); // fallback if rAF is throttled (hidden or background tab)
      setRunning(true);
    }
    function disable() {
      if (!S.live) return;
      S.live = false; S.running = false;
      ticker.remove(tick);
      stage.classList.add("is-static");
      stage.classList.remove("is-live", "pre");
      controls.hidden = true;
      track.style.transform = "";
      cards.forEach((c) => { c.style.transform = ""; c.style.opacity = ""; c.style.zIndex = ""; c.style.visibility = ""; c.style.width = ""; });
    }

    // Controls
    if (btnToggle) btnToggle.addEventListener("click", () => { S.userPaused = !S.userPaused; setRunning(!S.userPaused); });
    if (btnPrev) btnPrev.addEventListener("click", () => step(-1));
    if (btnNext) btnNext.addEventListener("click", () => step(1));

    // Hover / focus / touch pause and bring forward
    cards.forEach((c, i) => {
      const btn = c.querySelector(".card-btn");
      c.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { S.hoverPaused = true; setRunning(false); bringForward(i); } });
      btn.addEventListener("focus", () => { S.hoverPaused = true; setRunning(false); bringForward(i); });
      btn.addEventListener("blur", () => { S.hoverPaused = false; setRunning(true); });
      c.addEventListener("touchstart", () => { S.hoverPaused = true; setRunning(false); bringForward(i); }, { passive: true });
      c.addEventListener("touchend", () => { setTimeout(() => { S.hoverPaused = false; setRunning(true); }, 1500); }, { passive: true });
    });
    stage.addEventListener("pointerleave", () => { S.hoverPaused = false; S.tiltX = 0; S.tiltY = 0; setRunning(true); if (S.live) render(); });
    stage.addEventListener("pointermove", (e) => {
      if (!S.live || !env.fine || S.mobile) return;
      const r = stage.getBoundingClientRect();
      S.tiltY = ((e.clientX - r.left) / r.width - 0.5) * 8;   // +-4deg
      S.tiltX = -((e.clientY - r.top) / r.height - 0.5) * 8;
      if (!S.running && S.target === null) render();
    });

    // Visibility
    const io = new IntersectionObserver((entries) => {
      S.inView = entries[0].isIntersecting;
      if (S.inView && capable()) enable();
      setRunning(S.inView);
    }, { threshold: 0.15, rootMargin: "200px 0px" });
    io.observe(stage);
    doc.addEventListener("visibilitychange", () => setRunning(!env.hidden));
    let rt;
    addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (!capable()) { disable(); return; }
        if (S.inView) enable();
        if (S.live) { measure(); render(); }
      }, 120);
    }, { passive: true });
    mqReduced.addEventListener("change", () => { if (env.reduced) disable(); });

    return S;
  })();

  /* ---------- Lightbox ---------- */
  (function lightbox() {
    const dlg = doc.getElementById("lightbox");
    const img = doc.getElementById("lightbox-img");
    const cap = doc.getElementById("lightbox-cap");
    if (!dlg || typeof dlg.showModal !== "function") return;
    let trigger = null;
    doc.querySelectorAll(".card-btn, .mi-photo-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        trigger = btn;
        const src = btn.dataset.full;
        const alt = btn.querySelector("img")?.alt || "";
        img.src = src; img.alt = alt;
        img.width = +btn.dataset.fullW || 1200; img.height = +btn.dataset.fullH || 900;
        cap.textContent = alt;
        history.pushState({ lightbox: true }, "");
        dlg.showModal();
        dlg.querySelector(".dialog-close").focus();
      });
    });
    dlg.addEventListener("close", () => {
      if (history.state && history.state.lightbox) history.back();
      img.removeAttribute("src");
      // Restore focus after the browser's own dialog focus handling and any popstate.
      const t = trigger;
      if (t) { t.focus(); setTimeout(() => { if (document.activeElement !== t) t.focus({ preventScroll: true }); }, 30); }
    });
    addEventListener("popstate", () => { if (dlg.open) dlg.close(); });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  })();

  /* ---------- Our space: overlay sweep and layered drift ---------- */
  (function ourSpace() {
    const reveal = doc.getElementById("space-reveal");
    const overlay = doc.getElementById("space-overlay");
    const caption = doc.getElementById("space-caption");
    const layers = doc.getElementById("space-layers");
    if (!reveal) return;
    const layerEls = layers ? Array.from(layers.querySelectorAll(".space-layer")) : [];
    scrollFx.push((vh) => {
      if (env.reduced) { caption.classList.add("is-visible"); return; }
      const r = reveal.getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 2) return; // offscreen: skip work
      const p = clamp((vh - r.top) / (vh * 0.8), 0, 1);
      overlay.style.transform = `translate3d(0, ${(-100 * p).toFixed(2)}%, 0)`;
      caption.classList.toggle("is-visible", p > 0.7);
      if (layers) {
        const lr = layers.getBoundingClientRect();
        if (lr.bottom > 0 && lr.top < vh) {
          const q = (lr.top + lr.height / 2 - vh / 2) / vh; // -1..1 through the viewport
          for (const el of layerEls) {
            const rate = parseFloat(el.dataset.rate || "0.05");
            el.style.transform = `translate3d(0, ${(q * rate * lr.height).toFixed(1)}px, 0)`;
          }
        }
      }
    });
  })();

  /* ---------- Sticky mobile CTA ---------- */
  (function stickyCta() {
    const bar = doc.getElementById("sticky-cta");
    const heroCta = doc.querySelector(".hero .cta-row");
    const order = doc.getElementById("order");
    const footer = doc.querySelector(".footer-bottom");
    if (!bar || !heroCta) return;
    const vis = { hero: true, order: false, footer: false };
    function update() {
      const show = !env.desktop && !vis.hero && !vis.order && !vis.footer;
      bar.hidden = !show;
    }
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.target === heroCta) vis.hero = en.isIntersecting;
        else if (en.target === order) vis.order = en.isIntersecting;
        else if (en.target === footer) vis.footer = en.isIntersecting;
      }
      update();
    }, { threshold: 0.1 });
    io.observe(heroCta); if (order) io.observe(order); if (footer) io.observe(footer);
    mqDesktop.addEventListener("change", update);
  })();

  /* Kick the first scroll frame. */
  scrollDirty = true;
})();
