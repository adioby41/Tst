// Event scenes for the championship loops. Everything is a pure function of timeline time.
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const D2R = Math.PI / 180;
  const G = 900; // ground line
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp01 = (k) => Math.max(0, Math.min(1, k));
  const smooth = (k) => {
    k = clamp01(k);
    return k * k * (3 - 2 * k);
  };
  const bell = (d, w) => {
    const k = 1 - Math.min(1, Math.abs(d) / w);
    return smooth(k);
  };

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    (parent || document.getElementById("scene")).appendChild(e);
    return e;
  }

  // ---------- articulated stick figure ----------
  // pose: [arm1, elbow1, arm2, elbow2, thigh1, knee1, thigh2, knee2]; angles from "down along the body", positive toward the front
  function makeFigure(scale, opacity, parent) {
    const S = scale;
    const B = { torso: 34 * S, neck: 13 * S, upper: 17 * S, fore: 17 * S, thigh: 23 * S, shin: 22 * S };
    const g = el("g", { opacity: 0 }, parent);
    const path = el("path", { class: "fig", "stroke-width": (7.5 * S).toFixed(1) }, g);
    const head = el("circle", { class: "fig-head", r: (8.6 * S).toFixed(1) }, g);
    const baton = el("line", { class: "baton", opacity: 0 }, g);
    const hipH = B.thigh + B.shin - 3 * S;
    const solve = (st) => {
      const r = st.rot * D2R, c = Math.cos(r), sn = Math.sin(r), P = st.pose;
      const W = (lx, ly) => ({ x: st.x + lx * c - ly * sn, y: st.y + lx * sn + ly * c });
      const dir = (deg) => [Math.sin(deg * D2R), Math.cos(deg * D2R)];
      const limb = (ox, oy, a1, l1, a2, l2) => {
        const [x1, y1] = dir(a1), [x2, y2] = dir(a2);
        const j = [ox + x1 * l1, oy + y1 * l1];
        return [W(ox, oy), W(j[0], j[1]), W(j[0] + x2 * l2, j[1] + y2 * l2)];
      };
      const sh = -B.torso + 4 * S;
      return {
        hip: W(0, 0), neck: W(0, -B.torso), head: W(0, -B.torso - B.neck),
        arm1: limb(0, sh, P[0], B.upper, P[0] + P[1], B.fore),
        arm2: limb(0, sh, P[2], B.upper, P[2] + P[3], B.fore),
        leg1: limb(0, 0, P[4], B.thigh, P[4] - P[5], B.shin),
        leg2: limb(0, 0, P[6], B.thigh, P[6] - P[7], B.shin),
      };
    };
    const pl = (pts) => "M " + pts.map((q) => `${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(" L ");
    return {
      S, B, hipH, g,
      draw(st) {
        const k = solve(st);
        path.setAttribute("d", [pl([k.hip, k.neck]), pl(k.arm1), pl(k.arm2), pl(k.leg1), pl(k.leg2)].join(" "));
        head.setAttribute("cx", k.head.x.toFixed(1));
        head.setAttribute("cy", k.head.y.toFixed(1));
        g.setAttribute("opacity", ((st.alpha === undefined ? 1 : st.alpha) * opacity).toFixed(3));
        if (st.baton) {
          const h = st.baton === 1 ? k.arm1[2] : k.arm2[2], e = st.baton === 1 ? k.arm1[1] : k.arm2[1];
          const dx = h.x - e.x, dy = h.y - e.y, d = Math.hypot(dx, dy) || 1, L = 16 * S;
          baton.setAttribute("x1", (h.x - (dx / d) * L * 0.4).toFixed(1));
          baton.setAttribute("y1", (h.y - (dy / d) * L * 0.4).toFixed(1));
          baton.setAttribute("x2", (h.x + (dx / d) * L).toFixed(1));
          baton.setAttribute("y2", (h.y + (dy / d) * L).toFixed(1));
          baton.setAttribute("stroke-width", (6 * S).toFixed(1));
          baton.setAttribute("opacity", 1);
        } else baton.setAttribute("opacity", 0);
      },
    };
  }

  // running gait from the travelled distance, so feet never slide
  const runPose = (ph, effort) => {
    const sn = Math.sin(ph), cs = Math.cos(ph), e = effort;
    return [
      -48 * e * sn, 90, 48 * e * sn, 90,
      42 * e * sn + 10, 30 + 75 * e * Math.max(0, cs), -42 * e * sn + 10, 30 + 75 * e * Math.max(0, -cs),
    ];
  };
  const walkPose = (ph) => {
    const sn = Math.sin(ph), cs = Math.cos(ph);
    // race walking: straight support leg, knee bends only in the swing, arms at 90 degrees
    return [-38 * sn, 95, 38 * sn, 95, 26 * sn, 55 * Math.max(0, cs) * Math.max(0, sn), -26 * sn, 55 * Math.max(0, -cs) * Math.max(0, -sn)];
  };
  const blendPose = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
  // hurdle clearance: lead leg straight forward, trail leg folded, opposite arm reaching
  const HURDLE_POSE = [135, 20, -40, 80, 104, 6, 50, 115];

  // ---------- mini map of the 200 m indoor oval ----------
  function lapMap(tl, label, subText, t0, t1) {
    const cx = 1660, cy = 572, w = 360, h = 112, r = h / 2;
    const d = `M ${cx} ${cy + r} L ${cx + w / 2 - r} ${cy + r} A ${r} ${r} 0 0 0 ${cx + w / 2 - r} ${cy - r} L ${cx - w / 2 + r} ${cy - r} A ${r} ${r} 0 0 0 ${cx - w / 2 + r} ${cy + r} Z`;
    el("path", { d, class: "oval" });
    const lane = el("path", { d, class: "oval-lap" });
    el("line", { x1: cx, y1: cy + r - 10, x2: cx, y2: cy + r + 10, class: "oval-start" });
    const dot = el("circle", { r: 8, class: "oval-dot", opacity: 0 });
    const txt = el("text", { x: cx, y: cy + 10, class: "oval-label" });
    txt.textContent = label;
    const sub = el("text", { x: cx, y: cy + 36, class: "oval-sub" });
    sub.textContent = subText;
    const L = lane.getTotalLength();
    lane.setAttribute("stroke-dasharray", L.toFixed(1));
    const N = 240;
    const P = Array.from({ length: N + 1 }, (_, i) => lane.getPointAtLength((L * i) / N));
    const proxy = { k: 0 };
    const upd = () => {
      const f = proxy.k * N, i = Math.min(N - 1, Math.floor(f)), q = f - i;
      dot.setAttribute("cx", lerp(P[i].x, P[i + 1].x, q));
      dot.setAttribute("cy", lerp(P[i].y, P[i + 1].y, q));
      lane.setAttribute("stroke-dashoffset", (L * (1 - proxy.k)).toFixed(1));
    };
    upd();
    tl.to(dot, { opacity: 1, duration: 0.3 }, t0);
    tl.to(proxy, { k: 1, duration: t1 - t0, ease: "none", onUpdate: upd }, t0);
    tl.to([dot, lane], { opacity: 0, duration: 0.8 }, 6.2);
  }
  const lapsLabel = (n) => {
    const s = String(n).replace(".", ",");
    if (n === 1) return "1 КРУГ";
    if (Number.isInteger(n) && n % 10 >= 2 && n % 10 <= 4 && (n < 10 || n > 20)) return s + " КРУГА";
    if (!Number.isInteger(n)) return s + " КРУГА";
    return s + " КРУГОВ";
  };

  // a clock-driven figure track: state(t) -> figure state
  function drive(tl, fig, end, stateAt) {
    const clock = { t: 0 };
    const upd = () => fig.draw(stateAt(clock.t));
    upd();
    tl.to(clock, { t: end, duration: end, ease: "none", onUpdate: upd }, 0);
  }

  // ---------- scenes ----------
  function sprint(tl, hurdles) {
    const X0 = 300, FIN = 1720;
    el("line", { x1: 160, y1: G, x2: 1880, y2: G, class: "ground" });
    el("path", { d: `M ${X0 - 34} ${G} L ${X0 - 18} ${G - 14} L ${X0 - 12} ${G}`, class: "block" });
    el("path", { d: `M ${X0 - 4} ${G} L ${X0 + 10} ${G - 12} L ${X0 + 16} ${G}`, class: "block" });
    el("line", { x1: FIN, y1: G - 150, x2: FIN, y2: G + 6, class: "finish" });
    const flash = el("ellipse", { cx: FIN, cy: G - 70, rx: 30, ry: 90, class: "flash", opacity: 0 });
    const HX = hurdles ? [720, 950, 1180, 1410] : [];
    const HH = 50;
    HX.forEach((x) => {
      el("line", { x1: x + 14, y1: G, x2: x + 14, y2: G - HH, class: "hurdle-leg" });
      el("line", { x1: x + 4, y1: G - HH, x2: x + 24, y2: G - HH, class: "hurdle-bar" });
      el("line", { x1: x + 14, y1: G, x2: x - 6, y2: G, class: "hurdle-leg" });
    });
    const fig = makeFigure(1.3, 1);
    const GO = 1.5, A = 1250, VMAX = hurdles ? 820 : 940;
    const tAcc = VMAX / A, xAcc = 0.5 * A * tAcc * tAcc;
    const xAt = (t) => {
      const u = t - GO;
      if (u <= 0) return X0;
      if (u <= tAcc) return X0 + 0.5 * A * u * u;
      return X0 + xAcc + VMAX * (u - tAcc);
    };
    const hip0 = G - fig.hipH;
    // on your marks -> set
    const MARKS = { x: X0 + 18, y: G - 34, rot: 78, pose: [78, 0, 74, 0, 120, 150, 70, 120] };
    const SET = { x: X0 + 22, y: G - 58, rot: 62, pose: [62, 0, 58, 0, 105, 115, 50, 80] };
    drive(tl, fig, 4.6, (t) => {
      const alpha = smooth(t / 0.4);
      if (t < GO) {
        const k = smooth((t - 0.9) / 0.35);
        return { x: lerp(MARKS.x, SET.x, k), y: lerp(MARKS.y, SET.y, k), rot: lerp(MARKS.rot, SET.rot, k), pose: blendPose(MARKS.pose, SET.pose, k), alpha };
      }
      const x = xAt(t), u = t - GO;
      const ph = (x - X0) / 150 * Math.PI * 2;
      const rise = smooth(u / 0.9);
      let pose = runPose(ph, 1);
      let y = lerp(SET.y, hip0 - Math.abs(Math.sin(ph)) * 6, rise);
      let rot = lerp(SET.rot, 12, rise);
      if (u < 0.25) pose = blendPose(SET.pose, pose, smooth(u / 0.25));
      for (const hx of HX) {
        const b = bell(x - (hx + 6), 90);
        if (b > 0) {
          pose = blendPose(pose, HURDLE_POSE, b);
          y -= 36 * b;
          rot += 16 * b;
        }
      }
      return { x: lerp(SET.x, x, smooth(u / 0.15)), y, rot, pose, alpha: 1 };
    });
    const tFin = GO + tAcc + (FIN - X0 - xAcc) / VMAX;
    tl.set(flash, { opacity: 0.9, attr: { rx: 10 } }, tFin);
    tl.to(flash, { opacity: 0, attr: { rx: 70 }, duration: 0.9, ease: "power2.out" }, tFin);
  }

  function pack(tl, opts) {
    el("line", { x1: 160, y1: G, x2: 1880, y2: G, class: "ground" });
    el("line", { x1: 160, y1: G - 22, x2: 1880, y2: G - 22, class: "lane" });
    el("line", { x1: 160, y1: G - 40, x2: 1880, y2: G - 40, class: "lane" });
    (opts.barriers || []).forEach((x) => {
      el("rect", { x: x - 4, y: G - 72, width: 34, height: 9, class: "barrier" });
      el("line", { x1: x + 2, y1: G, x2: x + 2, y2: G - 63, class: "hurdle-leg" });
      el("line", { x1: x + 24, y1: G, x2: x + 24, y2: G - 63, class: "hurdle-leg" });
    });
    const T0 = 0.3, END = 7.0;
    const runners = opts.runners.map((r) => ({ ...r, fig: null }));
    // draw back to front so the leader is on top
    runners.slice().reverse().forEach((r) => (r.fig = makeFigure(r.scale, r.op)));
    runners.forEach((r) => {
      const fig = r.fig, ground = G - r.lane;
      drive(tl, fig, END, (t) => {
        const x = r.x0 + opts.v * Math.max(0, t - T0);
        let pose, y, rot;
        if (opts.walk) {
          const ph = (x - r.x0) / 170 * Math.PI * 2 + r.phase;
          pose = walkPose(ph);
          y = ground - fig.hipH + 2 * Math.abs(Math.cos(ph)) * fig.S;
          rot = 4;
        } else {
          const ph = (x - r.x0) / (140 * fig.S) * Math.PI * 2 + r.phase;
          pose = runPose(ph, opts.effort);
          y = ground - fig.hipH - Math.abs(Math.sin(ph)) * 5 * fig.S;
          rot = opts.lean;
          for (const bx of opts.barriers || []) {
            const b = bell(x - (bx + 12), 70 * fig.S);
            if (b > 0) {
              pose = blendPose(pose, HURDLE_POSE, b);
              y -= 30 * b * fig.S;
              rot += 14 * b;
            }
          }
        }
        return { x, y, rot, pose, alpha: smooth((t - T0) / 0.3) };
      });
    });
    lapMap(tl, lapsLabel(opts.laps), "ПО 200 М", T0 + 0.2, T0 + 0.2 + opts.lapTime);
  }

  function relay(tl, laps) {
    el("line", { x1: 160, y1: G, x2: 1880, y2: G, class: "ground" });
    const Z0 = 1040, Z1 = 1420;
    el("line", { x1: Z0, y1: G - 10, x2: Z0, y2: G + 10, class: "zone" });
    el("line", { x1: Z1, y1: G - 10, x2: Z1, y2: G + 10, class: "zone" });
    el("line", { x1: Z0, y1: G + 3, x2: Z1, y2: G + 3, class: "zone-band" });
    const B = makeFigure(1.25, 1), A = makeFigure(1.25, 1);
    const VA = 650, TA0 = 0.2, TP = 2.6, TB0 = 1.76, AB = 1100;
    const xA = (t) => {
      const tp = TP, xp = -120 + VA * (tp - TA0);
      if (t <= tp) return -120 + VA * Math.max(0, t - TA0);
      const u = Math.min(t - tp, 0.9);
      return xp + VA * u - 0.5 * (VA / 0.9) * u * u;
    };
    const xB = (t) => {
      if (t <= TB0) return Z0;
      const u = t - TB0, tv = 900 / AB;
      if (u <= tv) return Z0 + 0.5 * AB * u * u;
      return Z0 + 0.5 * AB * tv * tv + 900 * (u - tv);
    };
    const hipA = G - A.hipH, hipB = G - B.hipH;
    drive(tl, A, 6.0, (t) => {
      const x = xA(t), ph = (x + 120) / 180 * Math.PI * 2;
      const slow = smooth((t - TP) / 0.9);
      const pose = blendPose(runPose(ph, 1), [10, 40, -10, 40, 4, 10, -4, 10], slow);
      const alpha = Math.min(smooth((t - TA0) / 0.3), 1 - smooth((t - TP - 0.6) / 0.8));
      const reach = bell(t - (TP - 0.12), 0.3);
      if (reach > 0) pose[0] = lerp(pose[0], 80, reach);
      return { x, y: hipA - Math.abs(Math.sin(ph)) * 6 * (1 - slow), rot: lerp(10, 2, slow), pose, alpha, baton: t < TP ? 1 : 0 };
    });
    drive(tl, B, 6.0, (t) => {
      const x = xB(t);
      const alpha = smooth(t / 0.4);
      if (t <= TB0) {
        // waiting in the zone, looking back, hand ready
        return { x, y: hipB, rot: 18, pose: [-60, 20, 30, 80, 25, 30, -15, 20], alpha };
      }
      const ph = (x - Z0) / 180 * Math.PI * 2;
      let pose = runPose(ph, 1);
      const reach = bell(t - (TP - 0.12), 0.3);
      if (reach > 0) pose = blendPose(pose, [-65, 10, 40, 80, pose[4], pose[5], pose[6], pose[7]], reach);
      return { x, y: hipB - Math.abs(Math.sin(ph)) * 6, rot: 12, pose, alpha, baton: t >= TP ? 2 : 0 };
    });
    lapMap(tl, "4 ЭТАПА", "ПО 2 КРУГА", 0.5, 4.5);
  }

  function ceremony(tl) {
    el("line", { x1: 160, y1: G, x2: 1880, y2: G, class: "ground" });
    const blocks = [
      { n: "2", x: 1250, top: 770, medal: "silver", t: 0.6 },
      { n: "1", x: 1450, top: 700, medal: "gold", t: 1.15 },
      { n: "3", x: 1650, top: 810, medal: "bronze", t: 0.85 },
    ];
    const W = 200;
    blocks.forEach((b) => {
      el("rect", { x: b.x, y: b.top, width: W, height: G - b.top, class: "podium" });
      const n = el("text", { x: b.x + W / 2, y: b.top + 70, class: "podium-n" });
      n.textContent = b.n;
    });
    // medals hang still above the podium: no motion, so the screen works as a photo backdrop
    blocks.forEach((b) => {
      const g = el("g", {});
      const cx = b.x + W / 2, cy = b.top - 74;
      el("path", { d: `M ${cx - 22} ${cy - 80} L ${cx} ${cy - 26} L ${cx + 22} ${cy - 80}`, class: "ribbon" }, g);
      el("circle", { cx, cy, r: 34, class: "medal " + b.medal }, g);
      el("circle", { cx, cy, r: 24, class: "medal-in" }, g);
      const t = el("text", { x: cx, y: cy + 11, class: "medal-n" }, g);
      t.textContent = b.n;
    });
  }

  window.buildScene = function (tl, V) {
    const laps = Number(V.laps) || 0;
    switch (V.scene) {
      case "sprint": return sprint(tl, false);
      case "hurdles": return sprint(tl, true);
      case "track": {
        const v = laps <= 1 ? 760 : laps <= 2 ? 700 : laps <= 4 ? 620 : 560;
        return pack(tl, {
          v, effort: laps <= 2 ? 1 : 0.85, lean: laps <= 2 ? 11 : 8, laps, lapTime: 4.2,
          runners: [
            { x0: -90, lane: 0, scale: 1.25, op: 1, phase: 0 },
            { x0: -230, lane: 22, scale: 1.12, op: 0.6, phase: 1.7 },
            { x0: -360, lane: 40, scale: 1.0, op: 0.35, phase: 3.1 },
          ],
        });
      }
      case "walk":
        return pack(tl, {
          v: 400, walk: true, laps, lapTime: 5.2,
          runners: [
            { x0: -80, lane: 0, scale: 1.25, op: 1, phase: 0 },
            { x0: -240, lane: 22, scale: 1.12, op: 0.55, phase: 2.2 },
          ],
        });
      case "steeple":
        return pack(tl, {
          v: 560, effort: 0.85, lean: 8, laps, lapTime: 4.2, barriers: [860, 1380],
          runners: [
            { x0: -90, lane: 0, scale: 1.25, op: 1, phase: 0 },
            { x0: -240, lane: 22, scale: 1.12, op: 0.6, phase: 1.9 },
            { x0: -380, lane: 40, scale: 1.0, op: 0.35, phase: 3.4 },
          ],
        });
      case "relay": return relay(tl, laps);
      case "ceremony": return ceremony(tl);
    }
  };
})();
