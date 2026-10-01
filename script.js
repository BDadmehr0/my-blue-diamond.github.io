/* =========================================================
   SKY · BLUE DIAMOND  ·  UI 2.0
   ---------------------------------------------------------
   one rAF loop drives everything.
   only transform / opacity / custom-props are written,
   so nothing ever touches layout while scrolling.
========================================================= */

(function () {

    "use strict";

    var doc = document.documentElement;

    var $ = function (s, r) { return (r || document).querySelector(s); };
    var $$ = function (s, r) {
        return Array.prototype.slice.call((r || document).querySelectorAll(s));
    };

    var c01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
    var lerp = function (a, b, t) { return a + (b - a) * t; };
    var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };
    var smooth = function (t) { return t * t * (3 - 2 * t); };

    var FA = "۰۱۲۳۴۵۶۷۸۹";
    var fa = function (v) {
        return String(v).replace(/\d/g, function (d) { return FA[+d]; });
    };

    var REDUCED =
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var COARSE =
        window.matchMedia("(pointer: coarse)").matches;

    var FINE =
        window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var scrollY = 0;
    var maxScroll = 1;


    /* =====================================================
       TEXT SPLITTING
    ===================================================== */

    function splitWords(el) {

        if (el.dataset.splitDone) return;
        el.dataset.splitDone = "1";

        var i = 0;

        function walk(parent) {

            var nodes = Array.prototype.slice.call(parent.childNodes);

            nodes.forEach(function (node) {

                if (node.nodeType === 3) {

                    var parts = node.textContent.split(/(\s+)/);
                    var frag = document.createDocumentFragment();

                    parts.forEach(function (part) {

                        if (!part) return;

                        if (/^\s+$/.test(part)) {
                            frag.appendChild(document.createTextNode(" "));
                            return;
                        }

                        var span = document.createElement("span");
                        span.className = "w";
                        span.style.setProperty("--i", i++);
                        span.textContent = part;

                        frag.appendChild(span);
                    });

                    parent.replaceChild(frag, node);

                } else if (node.nodeType === 1 &&
                    node.tagName !== "BR" &&
                    !node.classList.contains("w")) {

                    walk(node);
                }
            });
        }

        walk(el);
    }

    $$("[data-split], [data-lit]").forEach(splitWords);


    /* =====================================================
       MEASUREMENTS
    ===================================================== */

    var sections = $$(".sec");
    var secs = [];
    var anchors = [];
    var lits = [];
    var parals = [];

    var deck = null;
    var deckPin = null;
    var deckNotes = [];
    var deckNow = null;

    var gem = null;

    function measure() {

        vw = window.innerWidth;
        vh = window.innerHeight;

        var y = window.pageYOffset || 0;

        maxScroll = Math.max(1, doc.scrollHeight - vh);

        secs = sections.map(function (el, i) {

            var r = el.getBoundingClientRect();

            return {
                el: el,
                i: i,
                top: r.top + y,
                h: r.height,
                tag: el.dataset.tag || ""
            };
        });

        anchors = $$("[data-gem]").map(function (el) {

            var r = el.getBoundingClientRect();

            var cy = r.top + r.height / 2 + y;

            return {
                y: cy,
                x: r.left + r.width / 2,
                /* scroll position at which the gem sits exactly on
                   this anchor (never outside the page) */
                k: c01((cy - vh / 2) / Math.max(1, doc.scrollHeight - vh)) *
                    Math.max(1, doc.scrollHeight - vh),
                scale: parseFloat(el.dataset.scale || "1"),
                op: el.dataset.op === undefined ?
                    1 : parseFloat(el.dataset.op),
                glow: el.dataset.glow === undefined ?
                    1 : parseFloat(el.dataset.glow),
                spin: el.dataset.spin === undefined ?
                    1 : parseFloat(el.dataset.spin)
            };
        });

        lits = $$("[data-lit]").map(function (el) {

            var r = el.getBoundingClientRect();

            return { el: el, top: r.top + y, h: r.height, lit: -1 };
        });

        parals = $$("[data-parallax]").map(function (el) {

            var r = el.getBoundingClientRect();

            return {
                el: el,
                speed: parseFloat(el.dataset.parallax || "0"),
                center: r.top + y + r.height / 2
            };
        });

        deck = $("#deck");
        deckPin = $(".deck-pin");
        deckNotes = $$(".deck-pin .note");

        deckNow = $("#deckNow");

        if (deck && deckPin) {

            var dr = deck.getBoundingClientRect();
            var pinTop = parseFloat(getComputedStyle(deckPin).top) || 0;

            deck.h = dr.height;
            deck.pinH = deckPin.offsetHeight;
            deck.start = dr.top + y - pinTop;
            deck.range = Math.max(1, dr.height - deckPin.offsetHeight);
        }

        if (gem) gem.resize();
    }


    /* =====================================================
       REVEAL OBSERVERS
    ===================================================== */

    if ("IntersectionObserver" in window) {

        var secObs = new IntersectionObserver(function (entries) {

            entries.forEach(function (e) {

                if (e.isIntersecting) {

                    e.target.classList.add("is-in");

                    if (e.target.id === "debug") runTerminal();
                }
            });

        }, {
            threshold: 0.04,
            rootMargin: "-6% 0px -10% 0px"
        });

        sections.forEach(function (s) { secObs.observe(s); });


        var riseObs = new IntersectionObserver(function (entries) {

            entries.forEach(function (e) {

                if (e.isIntersecting) {

                    e.target.classList.add("is-in");
                    riseObs.unobserve(e.target);
                }
            });

        }, {
            threshold: 0.2,
            rootMargin: "0px 0px -8% 0px"
        });

        /* the hero is revealed by the boot sequence, not by scroll */
        $$("[data-rise]").forEach(function (el) {

            if (!el.closest("#hero")) riseObs.observe(el);
        });

    } else {

        sections.forEach(function (s) { s.classList.add("is-in"); });
    }


    /* =====================================================
       3D GEM  ·  raw webgl, no library
    ===================================================== */

    function createGem() {

        var canvas = $("#gem");
        if (!canvas) return null;

        var opts = {
            alpha: true,
            antialias: true,
            depth: false,
            stencil: false,
            premultipliedAlpha: true,
            powerPreference: "default",
            preserveDrawingBuffer: false
        };

        var gl = canvas.getContext("webgl2", opts) ||
            canvas.getContext("webgl", opts) ||
            canvas.getContext("experimental-webgl", opts);

        if (!gl) return null;


        /* ---------- geometry ---------- */

        var SEG = 8;
        var TAB_R = 0.53, TAB_Y = 0.37, CULET_Y = -0.64;

        var G = [], T = [], i, a, b;

        for (i = 0; i < SEG; i++) {

            a = i / SEG * Math.PI * 2;

            G.push([Math.cos(a), 0, Math.sin(a)]);

            b = a + Math.PI / SEG;

            T.push([Math.cos(b) * TAB_R, TAB_Y, Math.sin(b) * TAB_R]);
        }

        var pos = [], nrm = [], tnt = [];

        function tri(p0, p1, p2, tint) {

            var ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
            var vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];

            var nx = uy * vz - uz * vy;
            var ny = uz * vx - ux * vz;
            var nz = ux * vy - uy * vx;

            var len = Math.hypot(nx, ny, nz) || 1;

            nx /= len; ny /= len; nz /= len;

            var cx = (p0[0] + p1[0] + p2[0]) / 3;
            var cy = (p0[1] + p1[1] + p2[1]) / 3;
            var cz = (p0[2] + p1[2] + p2[2]) / 3;

            var out = nx * cx + ny * cy + nz * cz;

            if (out < 0) {
                nx = -nx; ny = -ny; nz = -nz;
                var s = p1; p1 = p2; p2 = s;
            }

            [p0, p1, p2].forEach(function (p) {
                pos.push(p[0], p[1], p[2]);
                nrm.push(nx, ny, nz);
                tnt.push(tint);
            });
        }

        /* table — one big flat facet */

        var tabCenter = [0, TAB_Y, 0];

        for (i = 0; i < SEG; i++) {
            tri(T[i], T[(i + 1) % SEG], tabCenter, 0.5);
        }

        /* crown — 8 girdle kites + 8 bezel triangles */

        for (i = 0; i < SEG; i++) {

            var g0 = G[i], g1 = G[(i + 1) % SEG];
            var t0 = T[i], t1 = T[(i + 1) % SEG];

            tri(g0, g1, t0, 0.78 + (i % 2) * 0.1);
            tri(g1, t1, t0, 0.95 + (i % 3) * 0.05);
        }

        /* pavilion — 8 mains down to the culet */

        var culet = [0, CULET_Y, 0];

        for (i = 0; i < SEG; i++) {
            tri(G[(i + 1) % SEG], G[i], culet, 0.22 + (i % 2) * 0.12);
        }


        var verts = new Float32Array(pos);
        var norms = new Float32Array(nrm);
        var tints = new Float32Array(tnt);


        /* ---------- shaders ---------- */

        var VS = [
            "attribute vec3 aPos;",
            "attribute vec3 aNrm;",
            "attribute float aTint;",
            "uniform mat4 uMVP;",
            "varying vec3 vN;",
            "varying vec3 vP;",
            "varying float vTint;",
            "void main(){",
            "  vN = aNrm;",
            "  vP = aPos;",
            "  vTint = aTint;",
            "  gl_Position = uMVP * vec4(aPos, 1.0);",
            "}"
        ].join("\n");

        var FS = [
            "#ifdef GL_FRAGMENT_PRECISION_HIGH",
            "precision highp float;",
            "#else",
            "precision mediump float;",
            "#endif",
            "varying vec3 vN;",
            "varying vec3 vP;",
            "varying float vTint;",
            "uniform float uTime;",
            "uniform float uBack;",
            "uniform float uGlow;",

            "vec3 env(vec3 d){",
            "  float h = clamp(d.y * .5 + .5, 0.0, 1.0);",
            "  vec3 c = mix(vec3(.015,.05,.11), vec3(.22,.55,.92), pow(h, 1.7));",
            "  c += vec3(1.0) * pow(max(0.0, dot(d, normalize(vec3(.55,.8,.25)))), 46.0) * .95;",
            "  c += vec3(.45,.88,1.0) * pow(max(0.0, dot(d, normalize(vec3(-.75,.25,.5)))), 16.0) * .55;",
            "  c += vec3(.25,.7,1.0) * pow(max(0.0, dot(d, normalize(vec3(.15,-.85,-.4)))), 8.0) * .3;",
            "  return c;",
            "}",

            "vec3 refractOrReflect(vec3 I, vec3 N, float ior){",
            "  vec3 r = refract(I, N, 1.0 / ior);",
            "  if (dot(r, r) < 0.0001) r = reflect(I, N);",
            "  return r;",
            "}",

            "void main(){",
            "  vec3 N = normalize(vN);",
            "  vec3 V = normalize(-vP);",
            "  float ndv = clamp(dot(N, V), 0.0, 1.0);",
            "  float fres = pow(1.0 - ndv, 3.0);",

            "  vec3 R = reflect(-V, N);",
            "  float disp = 0.02 + 0.03 * fres;",

            "  vec3 cr = env(refractOrReflect(-V, N, 2.46 + disp));",
            "  vec3 cg = env(refractOrReflect(-V, N, 2.46));",
            "  vec3 cb = env(refractOrReflect(-V, N, 2.46 - disp));",
            "  vec3 tint = vec3(cr.r, cg.g, cb.b);",

            "  vec3 body = mix(vec3(.02,.13,.34), vec3(.30,.82,1.0), vTint);",
            "  body *= .45 + .55 * (0.5 + 0.5 * N.y);",

            "  vec3 refl = env(R) * (.5 + .5 * vTint);",
            "  vec3 key = normalize(vec3(.5,.85,.3));",
            "  refl += vec3(1.0) * pow(max(dot(R, key), 0.0), 220.0) * 2.0;",
            "  refl += vec3(.7,.95,1.0) * pow(max(dot(R, normalize(vec3(-.8,.1,.35))), 0.0), 90.0) * .7;",

            "  vec3 col = mix(body, tint * 1.25, .5);",
            "  col += refl * (.3 + .7 * fres);",
            "  col += vec3(.35,.85,1.0) * fres * 1.15;",

            "  float edge = smoothstep(.82, 1.0, 1.0 - ndv);",
            "  col += vec3(.6,.95,1.0) * edge * .5;",

            "  col *= 1.0 + .1 * sin(uTime * 1.4 + vTint * 9.0);",
            "  col *= uGlow;",

            "  float alpha = mix(.9 + .1 * fres, .34 + .3 * fres, uBack);",
            "  col = mix(col, col * .45 + vec3(.02,.1,.2), uBack);",

            "  gl_FragColor = vec4(col, alpha);",
            "}"
        ].join("\n");

        function sh(type, src) {

            var s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);

            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                if (window.console) console.warn(gl.getShaderInfoLog(s));
                return null;
            }

            return s;
        }

        var vs = sh(gl.VERTEX_SHADER, VS);
        var fs = sh(gl.FRAGMENT_SHADER, FS);

        if (!vs || !fs) return null;

        var prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);

        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;

        gl.useProgram(prog);

        function buf(data, name, size) {

            var b = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, b);
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

            var loc = gl.getAttribLocation(prog, name);
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
        }

        buf(verts, "aPos", 3);
        buf(norms, "aNrm", 3);
        buf(tints, "aTint", 1);

        var uMVP = gl.getUniformLocation(prog, "uMVP");
        var uTime = gl.getUniformLocation(prog, "uTime");
        var uBack = gl.getUniformLocation(prog, "uBack");
        var uGlow = gl.getUniformLocation(prog, "uGlow");

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        var count = pos.length / 3;


        /* ---------- math ---------- */

        function mul(a, b) {

            var o = new Float32Array(16), c, r, k, s;

            for (c = 0; c < 4; c++) {
                for (r = 0; r < 4; r++) {
                    s = 0;
                    for (k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
                    o[c * 4 + r] = s;
                }
            }

            return o;
        }

        function persp(fovy, near, far) {

            var f = 1 / Math.tan(fovy / 2);
            var nf = 1 / (near - far);

            return new Float32Array([
                f, 0, 0, 0,
                0, f, 0, 0,
                0, 0, (far + near) * nf, -1,
                0, 0, 2 * far * near * nf, 0
            ]);
        }

        function rotY(a) {

            var c = Math.cos(a), s = Math.sin(a);

            return new Float32Array([
                c, 0, -s, 0,
                0, 1, 0, 0,
                s, 0, c, 0,
                0, 0, 0, 1
            ]);
        }

        function rotX(a) {

            var c = Math.cos(a), s = Math.sin(a);

            return new Float32Array([
                1, 0, 0, 0,
                0, c, s, 0,
                0, -s, c, 0,
                0, 0, 0, 1
            ]);
        }

        var proj = persp(34 * Math.PI / 180, 0.1, 40);


        /* ---------- state ---------- */

        var dprCap = COARSE ? 1.6 : 2;
        var dpr = Math.min(window.devicePixelRatio || 1, dprCap);

        var yaw = 0.6, pitch = -0.22;
        var t = 0;
        var lastDraw = 0;

        function resize() {

            var w = canvas.clientWidth || 1;
            var h = canvas.clientHeight || 1;

            var bw = Math.round(w * dpr);
            var bh = Math.round(h * dpr);

            if (canvas.width !== bw || canvas.height !== bh) {

                canvas.width = bw;
                canvas.height = bh;

                gl.viewport(0, 0, bw, bh);
            }

        }

        function draw(opts) {

            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            var dist = 5.4 / opts.scale;

            var mvp = mul(mul(proj, new Float32Array([
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                0, 0, -dist, 1
            ])), mul(rotY(yaw), rotX(pitch)));

            gl.uniformMatrix4fv(uMVP, false, mvp);
            gl.uniform1f(uTime, t);
            gl.uniform1f(uGlow, 1);

            /* back faces first, then the front — cheap transparency */

            gl.enable(gl.CULL_FACE);

            gl.cullFace(gl.FRONT);
            gl.uniform1f(uBack, 1);
            gl.drawArrays(gl.TRIANGLES, 0, count);

            gl.cullFace(gl.BACK);
            gl.uniform1f(uBack, 0);
            gl.drawArrays(gl.TRIANGLES, 0, count);

            gl.disable(gl.CULL_FACE);
        }

        return {
            resize: resize,
            draw: draw,
            setQuality: function () {

                dpr = 1;

                resize();
            },
            add: function (dy, dp) { yaw += dy; pitch += dp; },
            tick: function (dt) { t += dt; }
        };
    }


    /* =====================================================
       TERMINAL
    ===================================================== */

    var termTimers = [];
    var termRan = false;

    function runTerminal() {

        var body = $("#termBody");
        if (!body) return;

        var lines = $$(".tl", body);
        var typed = $(".typed", body);
        var txt = typed ? (typed.dataset.type || "") : "";

        termTimers.forEach(clearTimeout);
        termTimers = [];

        lines.forEach(function (l) {

            l.classList.remove("is-on");
            l.style.textShadow = "";
        });

        var tCaret = $(".t-caret", body);

        if (tCaret) tCaret.style.display = "";

        if (txt) typed.textContent = "";

        var at = 0;

        function at_(ms, fn) {
            termTimers.push(setTimeout(fn, ms));
        }

        lines[0] && at_(60, function () {
            lines[0].classList.add("is-on");
        });

        if (typed) {

            var chars = txt.split("");

            chars.forEach(function (ch, i) {

                at_(200 + i * 62, function () {
                    typed.textContent += ch;
                });
            });

            at = 200 + chars.length * 62;
        }

        var tail = at + 260;

        for (var i = 1; i < lines.length; i++) {

            (function (line, delay) {

                at_(delay, function () {

                    line.classList.add("is-on");

                    if (line.classList.contains("tl-err")) {
                        line.style.textShadow =
                            "0 0 26px rgba(120,220,255,.9)";
                    }
                });

            })(lines[i], tail);

            tail += lines[i].classList.contains("tl-err") ? 330 : 210;

            if (i === 3) tail += 180;
        }

        at_(tail + 40, function () {

            if (tCaret) tCaret.style.display = "none";
        });
    }

    var replay = $("#termReplay");

    if (replay) {
        replay.addEventListener("click", function () {
            runTerminal();
        });
    }


    /* =====================================================
       DECK (sticky cards)
    ===================================================== */

    var DECK_N = 3;

    function updateDeck(y) {

        if (REDUCED || !deck || !deckNotes.length) return;
        if (deck.start === undefined) return;

        var p = c01((y - deck.start) / deck.range);

        var f = p * DECK_N;

        if (Math.abs(f - (updateDeck.last || -9)) < 0.002) return;

        updateDeck.last = f;

        deckNotes.forEach(function (note, i) {

            var enter = c01((f - i) / 0.3);
            var pass = c01(f - (i + 1));

            var e = easeOut(enter);

            var ny = lerp(76, 0, e) + pass * -14;
            var ns = lerp(0.92, 1, e) + pass * -0.07;
            var nr = lerp(-3.4, 0, e) + pass * 2.4;
            var no = i === 0 ? 1 : c01(enter * 1.4);

            note.style.setProperty("--ny", ny.toFixed(2) + "px");
            note.style.setProperty("--ns", ns.toFixed(4));
            note.style.setProperty("--nr", nr.toFixed(2) + "deg");
            note.style.setProperty("--no", no.toFixed(3));
            note.style.setProperty("--nveil", (c01(pass) * 0.55).toFixed(3));
        });

        if (deckNow) {

            var idx = Math.min(DECK_N, Math.max(1, Math.floor(f) + 1));
            var label = fa("0" + idx);

            if (deckNow.textContent !== label) deckNow.textContent = label;
        }
    }


    /* =====================================================
       DOCK / TOPBAR
    ===================================================== */

    var ringFg = $("#ringFg");
    var ringNum = $("#ringNum");
    var topLine = $("#topLine");
    var dockTitle = $("#dockTitle");
    var topTag = $("#topTag");
    var topbar = $("#topbar");
    var dots = $$(".dock-dot");

    var activeSec = -1;
    var stuck = false;
    var lastP = -1;
    var cue = $("#hero .scroll-cue");

    function setActive(i) {

        if (i === activeSec) return;

        activeSec = i;

        var s = secs[i];
        if (!s) return;

        if (ringNum) ringNum.textContent = fa("0" + (i + 1));

        [dockTitle, topTag].forEach(function (el) {

            if (!el) return;

            el.classList.add("is-swap");

            setTimeout(function () {
                el.textContent = s.tag;
                el.classList.remove("is-swap");
            }, 260);
        });

        dots.forEach(function (d, k) {

            d.classList.toggle("is-on", k === i);

            if (k === i) d.setAttribute("aria-current", "true");
            else d.removeAttribute("aria-current");
        });
    }

    function updateChrome(y, p) {

        if (Math.abs(p - lastP) > 0.0008) {

            lastP = p;

            if (ringFg) ringFg.style.setProperty("--sp", p.toFixed(4));
            if (topLine) topLine.style.setProperty("--sp", p.toFixed(4));
        }

        if (cue) {

            var off = y > 80;

            if (off !== cue.classList.contains("is-off")) {
                cue.classList.toggle("is-off", off);
            }
        }

        var isStuck = y > 40;

        if (isStuck !== stuck) {
            stuck = isStuck;
            if (topbar) topbar.classList.toggle("is-stuck", stuck);
        }

        var mid = y + vh * 0.42;

        var i = 0;

        for (var k = 0; k < secs.length; k++) {
            if (secs[k].top <= mid) i = k;
        }

        setActive(i);
    }


    /* =====================================================
       LENIS
    ===================================================== */

    var lenis = null;
    var smoothTouch = false;

    function fpsProbe() {

        return new Promise(function (resolve) {

            var frames = 0;
            var t0 = performance.now();
            var worst = 0;
            var prev = t0;

            function step(now) {

                var dt = now - prev;
                prev = now;

                if (frames > 1) worst = Math.max(worst, dt);

                frames++;

                if (frames < 26) requestAnimationFrame(step);
                else resolve({
                    avg: (now - t0) / frames,
                    worst: worst
                });
            }

            requestAnimationFrame(step);
        });
    }

    function startLenis(useTouch) {

        if (!window.Lenis || REDUCED) return;

        if (lenis) lenis.destroy();

        lenis = new window.Lenis({
            lerp: COARSE ? 0.11 : 0.085,
            wheelMultiplier: 1,
            touchMultiplier: 1.5,
            syncTouch: useTouch,
            syncTouchLerp: 0.11,
            smoothWheel: true,
            autoRaf: false,
            anchors: false
        });

        lenis.on("scroll", function (e) {
            scrollY = e.scroll !== undefined ? e.scroll : window.pageYOffset;
        });

        doc.classList.add("lenis-ready");

        smoothTouch = useTouch;
    }

    function scrollToTarget(target) {

        var node = typeof target === "string" ? $(target) : target;

        if (node === null || node === undefined) return;

        if (lenis) {
            lenis.scrollTo(node, { duration: 1.5 });
            return;
        }

        if (typeof node === "number") {
            window.scrollTo({ top: node, behavior: "smooth" });
            return;
        }

        if (node.scrollIntoView) {
            node.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    $$('a[href^="#"]').forEach(function (a) {

        a.addEventListener("click", function (e) {

            var href = a.getAttribute("href");

            if (!href || href === "#") return;

            var node = $(href);

            if (!node) return;

            e.preventDefault();

            scrollToTarget(href === "#hero" ? 0 : node);
        });
    });


    /* =====================================================
       MUSIC
    ===================================================== */

    var music = $("#music");
    var musicToggle = $("#musicToggle");
    var musicHint = $("#musicHint");
    var musicTitle = $("#musicTitle");
    var musicStatus = $("#musicStatus");

    var playing = false;

    function musicUI(on) {

        playing = on;

        if (musicToggle) {

            musicToggle.classList.toggle("is-on", on);
            musicToggle.setAttribute("aria-pressed", on ? "true" : "false");
        }

        if (musicHint) musicHint.classList.toggle("is-playing", on);

        if (musicTitle) musicTitle.textContent = on ?
            "Music on" : "یه آهنگ اینجاست";

        if (musicStatus) musicStatus.textContent = on ?
            "در حال پخش" : "برای شنیدن روشنش کن";
    }

    function enableMusic() {

        if (!music || playing) return;

        music.muted = false;

        var p = music.play();

        if (p && p.catch) p.catch(function () {});

        musicUI(true);

        if (musicHint) {

            musicHint.classList.add("is-gone");

            setTimeout(function () {
                if (musicHint.parentNode) musicHint.remove();
            }, 700);
        }

        if (navigator.mediaSession && window.MediaMetadata) {

            try {

                navigator.mediaSession.metadata = new window.MediaMetadata({
                    title: "یه آهنگ اینجاست",
                    artist: "SKY",
                    album: "BLUE DIAMOND"
                });

                navigator.mediaSession.setActionHandler(
                    "pause", function () { toggleMusic(); }
                );

                navigator.mediaSession.setActionHandler(
                    "play", function () { enableMusic(); }
                );

            } catch (e) { /* ignore */ }
        }
    }

    function toggleMusic() {

        if (!music) return;

        if (playing) {

            music.muted = true;
            musicUI(false);

        } else {

            enableMusic();
        }
    }

    if (musicToggle) {
        musicToggle.addEventListener("click", function () {

            if (!playing && music && music.paused) enableMusic();
            else toggleMusic();
        });
    }

    if (musicHint) {
        musicHint.addEventListener("click", enableMusic);
    }


    /* =====================================================
       SPARKS
    ===================================================== */

    var burst = $("#burst");
    var lastSpark = 0;

    function spark(x, y, n) {

        if (!burst || REDUCED) return;

        var now = performance.now();
        if (now - lastSpark < 180) return;
        lastSpark = now;

        for (var i = 0; i < n; i++) {

            var s = document.createElement("i");

            s.className = "spark";
            s.textContent = Math.random() > 0.45 ? "💎" : "✦";

            var a = Math.random() * Math.PI * 2;
            var d = 22 + Math.random() * 62;

            s.style.left = x + "px";
            s.style.top = y + "px";
            s.style.fontSize = (7 + Math.random() * 9).toFixed(1) + "px";
            s.style.setProperty("--dx", (Math.cos(a) * d).toFixed(1) + "px");
            s.style.setProperty("--dy", (Math.sin(a) * d).toFixed(1) + "px");
            s.style.setProperty("--sc", (0.4 + Math.random() * 1.1).toFixed(2));
            s.style.setProperty("--rot",
                (Math.random() * 320 - 160).toFixed(0) + "deg");

            burst.appendChild(s);

            (function (node) {
                setTimeout(function () {
                    if (node.parentNode) node.parentNode.removeChild(node);
                }, 1000);
            })(s);
        }
    }

    window.addEventListener("pointerdown", function (e) {

        if (!doc.classList.contains("ready")) return;

        if (e.pointerType === "mouse" && e.button !== 0) return;

        spark(e.clientX, e.clientY, COARSE ? 6 : 4);

    }, { passive: true });

    var gemTap = $("#gemTap");

    if (gemTap) {
        gemTap.addEventListener("click", function () {
            var r = gemTap.getBoundingClientRect();
            spark(r.left + r.width / 2, r.top + r.height / 2, 9);
        });
    }


    /* =====================================================
       CURSOR
    ===================================================== */

    var cursor = $("#cursor");
    var cursorDot = cursor ? $(".cursor-dot", cursor) : null;
    var cursorRing = cursor ? $(".cursor-ring", cursor) : null;
    var cx = 0, cy = 0, rx = 0, ry = 0;
    var cursorOn = false;
    var cursorPos = function (el, x, y) {

        if (el) {
            el.style.transform =
                "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0)" +
                " translate(-50%,-50%)";
        }
    };

    if (FINE && cursor) {

        window.addEventListener("pointermove", function (e) {

            if (!cursorOn) {

                cursorOn = true;

                rx = e.clientX;
                ry = e.clientY;

                document.body.classList.add("custom-cursor");
            }

            cx = e.clientX;
            cy = e.clientY;

            var hot = e.target && e.target.closest &&
                e.target.closest("a, button, .note, .term");

            cursor.classList.toggle("is-hot", !!hot);

        }, { passive: true });

        document.addEventListener("pointerleave", function () {
            cursorOn = false;
            document.body.classList.remove("custom-cursor");
        });
    }


    /* =====================================================
       SCROLL LOOP
    ===================================================== */

    var last = 0;
    var gemScale = 1, gemOp = 1, gemGlow = 1, gemSpin = 1;
    var gemX = 0, gemY = 0;
    var gemStage = $("#gemStage");
    var aurora = $(".bd-aurora");
    var grid = $(".bd-grid");

    var frameTimes = [];
    var slowCount = 0;
    var lowQuality = false;
    var gemFrames = 0;
    var gemThrottle = 1;

    function frame(now) {

        requestAnimationFrame(frame);

        if (last === 0) last = now;
        var dt = Math.min(64, now - last);
        last = now;

        if (lenis) {
            lenis.raf(now);
            scrollY = lenis.animatedScroll !== undefined ?
                lenis.animatedScroll : scrollY;
        } else {
            scrollY = window.pageYOffset || 0;
        }

        var p = c01(scrollY / maxScroll);

        updateChrome(scrollY, p);

        /* ---------- gem travel ---------- */

        if (anchors.length) {

            var last = anchors.length - 1;
            var a0 = anchors[0], a1 = anchors[0], t = 0;

            if (scrollY <= anchors[0].k) {
                a0 = a1 = anchors[0];
            } else if (scrollY >= anchors[last].k) {
                a0 = a1 = anchors[last];
            } else {

                for (var i = 0; i < last; i++) {

                    if (scrollY >= anchors[i].k && scrollY <= anchors[i + 1].k) {

                        a0 = anchors[i];
                        a1 = anchors[i + 1];

                        t = smooth(c01(
                            (scrollY - a0.k) / ((a1.k - a0.k) || 1)
                        ));

                        break;
                    }
                }
            }

            var sc = lerp(a0.scale, a1.scale, t);
            var op = lerp(a0.op, a1.op, t);
            var gl = lerp(a0.glow, a1.glow, t);
            var sp = lerp(a0.spin, a1.spin, t);

            var ax = lerp(a0.x, a1.x, t) - vw / 2;
            var ay = lerp(a0.y, a1.y, t) - scrollY - vh / 2;

            if (gemStage) {

                gemStage.style.setProperty("--gx", ax.toFixed(1) + "px");
                gemStage.style.setProperty("--gy", ay.toFixed(1) + "px");
                gemStage.style.setProperty("--gem-op", op.toFixed(3));
                gemStage.style.setProperty("--gem-glow", gl.toFixed(3));
            }

            gemScale = sc;
            gemOp = op;
            gemSpin = sp;
        }

        /* ---------- gem render ---------- */

        if (gem && gemOp > 0.02 && !document.hidden) {

            if (!REDUCED) {
                gem.add(dt * 0.00016 * gemSpin,
                    Math.sin(now * 0.00012) * dt * 0.00002);
            }

            gem.tick(dt * 0.001);

            gemFrames++;

            var every = REDUCED ? 30 : gemThrottle;

            if (gemFrames % every === 0) {

                gem.draw({ scale: gemScale });
            }
        }

        /* ---------- parallax ---------- */

        for (var q = 0; q < parals.length; q++) {

            var pa = parals[q];
            var d = (scrollY + vh / 2 - pa.center) * pa.speed;

            if (Math.abs(d - (pa.v || 0)) < 0.15) continue;

            pa.v = d;

            pa.el.style.transform =
                "translate3d(0," + d.toFixed(1) + "px,0)";
        }

        /* ---------- word lighting ---------- */

        var focusY = scrollY + vh * 0.82;

        for (var w = 0; w < lits.length; w++) {

            var L = lits[w];

            var lp = c01((focusY - L.top) / (vh * 0.5 + L.h * 0.35));

            if (Math.abs(lp - L.lit) > 0.004) {
                L.lit = lp;
                L.el.style.setProperty("--lit", lp.toFixed(3));
            }
        }

        updateDeck(scrollY);

        /* ---------- backdrop mood ---------- */

        if (aurora) {
            aurora.style.opacity = (0.72 + 0.28 * p).toFixed(3);
        }

        if (grid) {
            grid.style.opacity = (0.1 + 0.42 * (1 - p)).toFixed(3);
        }

        /* ---------- cursor ---------- */

        if (cursorOn && cursor) {

            rx = lerp(rx, cx, 0.16);
            ry = lerp(ry, cy, 0.16);

            cursorPos(cursorDot, cx, cy);
            cursorPos(cursorRing, rx, ry);
        }

        /* ---------- adaptive quality ---------- */

        if (!lowQuality && !REDUCED && gem) {

            frameTimes.push(dt);

            if (frameTimes.length >= 90) {

                var sum = 0;

                for (var f = 0; f < frameTimes.length; f++) {
                    sum += frameTimes[f];
                }

                var avg = sum / frameTimes.length;

                frameTimes.length = 0;

                if (avg > 26 && ++slowCount >= 2) {

                    lowQuality = true;
                    gemThrottle = 2;
                    doc.classList.add("low-fx");

                    if (gem) gem.setQuality();

                    /* native touch scrolling is cheaper than syncing it */
                    if (smoothTouch) startLenis(false);
                }
            }
        }
    }


    /* =====================================================
       BOOT
    ===================================================== */

    var bootEl = $("#boot");
    var bootBar = $("#bootBar");
    var bootPct = $("#bootPct");

    var ready = false;
    var raf0 = false;

    function bootDone() {

        doc.classList.add("ready");

        document.body.classList.remove("is-locked");

        if (bootEl) {

            bootEl.classList.add("is-done");

            setTimeout(function () {
                if (bootEl.parentNode) bootEl.parentNode.removeChild(bootEl);
            }, 900);
        }

        var hero = $("#hero");

        if (hero) {

            hero.classList.add("is-in");

            $$("[data-rise], [data-split]", hero).forEach(function (el, i) {

                setTimeout(function () {
                    el.classList.add("is-in");
                }, 120 + i * 110);
            });
        }

        measure();

        /* the music is already there, just silent */
        if (music) {

            music.preload = "auto";

            try {
                music.load();
                music.muted = true;
                var pr = music.play();
                if (pr && pr.catch) pr.catch(function () {});
            } catch (e) { /* ignore */ }
        }

        if (gemTap) {
            setTimeout(function () {
                spark(
                    Math.min(vw - 40, vw / 2),
                    vh * 0.62, 7);
            }, 1200);
        }
    }

    function bootLoop() {

        var t = performance.now() - bootStart;
        var want = (ready && t > 780) ? 1 : Math.min(1, t / 1100) * 0.9;

        bootP += (want - bootP) * (ready ? 0.14 : 0.06);

        if (ready && bootP > 0.996) bootP = 1;

        if (bootBar) bootBar.style.transform = "scaleX(" + bootP.toFixed(4) + ")";

        if (bootPct) bootPct.textContent = Math.round(bootP * 100);

        if (bootP >= 1) {

            if (!raf0) {
                raf0 = true;
                bootDone();
            }

            return;
        }

        requestAnimationFrame(bootLoop);
    }

    var bootP = 0;
    var bootStart = performance.now();


    /* =====================================================
       INIT
    ===================================================== */

    function init() {

        document.body.classList.add("is-locked");

        measure();

        gem = createGem();

        if (!gem) {

            var stage = $("#gemStage");

            if (stage) {

                var fb = document.createElement("span");
                fb.className = "gem-fallback";
                fb.textContent = "💎";
                stage.appendChild(fb);
            }
        } else {
            gem.resize();
        }

        /* fonts change every measurement */
        if (document.fonts && document.fonts.ready) {

            document.fonts.ready.then(function () {

                fontsIn = true;

                measure();
                setTimeout(measure, 300);

                maybeReady();
            });
        } else {
            fontsIn = true;
        }

        /* the page is only ready when the fonts are in */

        var loaded = document.readyState === "complete";
        var fontsIn = false;

        function maybeReady() {

            if (loaded && fontsIn && !ready) {
                ready = true;
                measure();
            }
        }

        window.addEventListener("load", function () {
            loaded = true;
            maybeReady();
        });

        setTimeout(function () {
            loaded = true;
            fontsIn = true;
            maybeReady();
        }, 2600);

        requestAnimationFrame(frame);
        requestAnimationFrame(bootLoop);

        /* lenis after a quick probe (the boot screen hides it) */
        fpsProbe().then(function (r) {

            var good = r.avg < 20 && r.worst < 48;

            startLenis(COARSE && good);
        });
    }

    /* resize */

    var rt = null;

    function onResize() {

        if (rt) clearTimeout(rt);

        rt = setTimeout(function () {
            measure();
        }, 180);
    }

    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onResize, { passive: true });

    if (window.ResizeObserver) {

        var ro = new ResizeObserver(function () {
            onResize();
        });

        ro.observe(document.body);
    }


    /* tiny debug surface — handy for tuning anchors in devtools */

    window.SKY = {

        get anchors() { return anchors; },
        get sections() { return secs; },
        get vh() { return vh; },
        get scroll() { return scrollY; },

        get deck() { return deck; },

        measure: measure,

        lenis: function () { return lenis; },

        to: scrollToTarget
    };


    /* go */

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();
