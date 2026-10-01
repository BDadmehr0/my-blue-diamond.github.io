/* =========================================================
   tools/gen-assets.mjs
   ---------------------------------------------------------
   generates the static assets that github pages / pwa need:

     assets/icons/icon-192.png
     assets/icons/icon-512.png
     assets/icons/icon-maskable-512.png
     assets/icons/apple-touch-icon.png
     assets/icons/favicon-32.png
     assets/og.png                     (social preview)

   the gem is drawn from the *same* geometry the webgl gem uses,
   so the icon really is the diamond from the site.

   usage (needs node + sharp; the site itself needs neither):

     npm i --no-save sharp
     node tools/gen-assets.mjs

   the persian text is rendered with the sites own fonts, which
   have to be installed for the renderer to find them:

     ls ~/.fonts
     #  Vazirmatn-Med.ttf  Estedad-Bd.ttf
     #  VazirmatnAr.ttf    VazirmatnAr-Bd.ttf  EstedadAr.ttf
========================================================= */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let sharp;

try {
    sharp = (await import("sharp")).default;
} catch {
    console.error("sharp is missing — run:  npm i --no-save sharp");
    process.exit(1);
}


/* =========================================================
   1 · GEM GEOMETRY (mirrors script.js)
========================================================= */

const SEG = 8;
const TAB_R = 0.53;
const TAB_Y = 0.37;
const CULET_Y = -0.64;

function buildFaces() {

    const G = [];
    const T = [];

    for (let i = 0; i < SEG; i++) {

        const a = (i / SEG) * Math.PI * 2;

        G.push([Math.cos(a), 0, Math.sin(a)]);

        const b = a + Math.PI / SEG;

        T.push([Math.cos(b) * TAB_R, TAB_Y, Math.sin(b) * TAB_R]);
    }

    const faces = [];
    const culet = [0, CULET_Y, 0];
    const table = [0, TAB_Y, 0];

    const push = (p0, p1, p2, tint) => faces.push({ p: [p0, p1, p2], tint });

    for (let i = 0; i < SEG; i++) {

        const g0 = G[i];
        const g1 = G[(i + 1) % SEG];
        const t0 = T[i];
        const t1 = T[(i + 1) % SEG];

        push(T[i], T[(i + 1) % SEG], table, 0.62);
        push(g0, g1, t0, 0.86 + (i % 2) * 0.08);
        push(g1, t1, t0, 1.0 - (i % 3) * 0.06);
        push(g1, g0, culet, 0.3 + (i % 2) * 0.16);
    }

    return faces;
}

function normal(p0, p1, p2) {

    const u = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const v = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];

    let n = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0]
    ];

    const len = Math.hypot(...n) || 1;

    return n.map(c => c / len);
}

/* rotate + orthographic project, painter sorted */

function project(faces, yaw, pitch, scale, cx, cy) {

    const cy1 = Math.cos(yaw), sy1 = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);

    const rot = p => {

        const x = p[0] * cy1 + p[2] * sy1;
        const z = -p[0] * sy1 + p[2] * cy1;

        return [x, p[1] * cp - z * sp, p[1] * sp + z * cp];
    };

    return faces.map(f => {

        const r = f.p.map(rot);
        const n = normal(r[0], r[1], r[2]);

        return {
            z: (r[0][2] + r[1][2] + r[2][2]) / 3,
            n,
            tint: f.tint,
            pts: r.map(p => [cx + p[0] * scale, cy - p[1] * scale])
        };
    }).sort((a, b) => a.z - b.z);
}


/* =========================================================
   2 · COLOUR
========================================================= */

const LIGHT = (() => {
    const l = [0.42, 0.78, 0.46];
    const len = Math.hypot(...l);
    return l.map(c => c / len);
})();

const RAMP = [
    [0.02, 0.16, 0.42],   /* deep */
    [0.04, 0.44, 0.92],   /* blue */
    [0.31, 0.76, 1.0],    /* cyan */
    [0.72, 0.94, 1.0],    /* ice  */
    [0.96, 0.995, 1.0]    /* white*/
];

function ramp(t) {

    t = Math.max(0, Math.min(1, t));

    const x = t * (RAMP.length - 1);
    const i = Math.min(RAMP.length - 2, Math.floor(x));
    const f = x - i;

    const c = RAMP[i].map((v, k) => v + (RAMP[i + 1][k] - v) * f);

    return "rgb(" + c.map(v => Math.round(v * 255)).join(",") + ")";
}

function faceColor(f) {

    const lam = Math.max(0, f.n[0] * LIGHT[0] + f.n[1] * LIGHT[1] + f.n[2] * LIGHT[2]);
    const spec = Math.pow(lam, 32) * 0.62;

    const shade = Math.pow(lam, 1.5);

    const t = 0.1 + f.tint * 0.44 + shade * 0.5 + spec;

    const alpha = 0.66 + f.tint * 0.26 + shade * 0.12;

    return {
        fill: ramp(t),
        alpha: Math.min(1, alpha)
    };
}

function gemSvg(yaw, pitch, scale, cx, cy) {

    const faces = project(buildFaces(), yaw, pitch, scale, cx, cy);

    return faces.map(f => {

        const c = faceColor(f);

        const pts = f.pts
            .map(p => p[0].toFixed(2) + "," + p[1].toFixed(2))
            .join(" ");

        return `<polygon points="${pts}" fill="${c.fill}" fill-opacity="${c.alpha.toFixed(3)}"/>`;
    }).join("");
}


/* =========================================================
   3 · ICONS
========================================================= */

function defs(size, safe) {

    return `
    <defs>
        <radialGradient id="bg" cx="50%" cy="22%" r="88%">
            <stop offset="0" stop-color="#0b3a63"/>
            <stop offset=".45" stop-color="#04142a"/>
            <stop offset="1" stop-color="#01050a"/>
        </radialGradient>

        <radialGradient id="halo">
            <stop offset="0" stop-color="#2aa8ff" stop-opacity=".62"/>
            <stop offset=".55" stop-color="#0b6cff" stop-opacity=".22"/>
            <stop offset="1" stop-color="#0b6cff" stop-opacity="0"/>
        </radialGradient>

        <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#b7f1ff" stop-opacity=".9"/>
            <stop offset="1" stop-color="#0b6cff" stop-opacity=".35"/>
        </linearGradient>

        <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="${(size * 0.045).toFixed(1)}"/>
        </filter>
    </defs>`;
}

/* the model spans x ∈ [-1, 1] and y ∈ [-0.64, 0.37],
   so the scale factor is half the wanted width and the
   vertical centre sits at MODE_Y * scale above the middle */

const MODE_Y = (TAB_Y + CULET_Y) / 2;

function iconSvg(size, safe) {

    const s = size * (safe ? 0.3 : 0.38);

    const cx = size / 2;
    const cy = size / 2 - MODE_Y * s;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${defs(size)}

    <rect width="${size}" height="${size}" fill="url(#bg)"/>

    <circle cx="${cx}" cy="${cy}" r="${s * 0.92}" fill="url(#halo)"/>

    <g filter="url(#soft)" opacity=".85">
        <ellipse cx="${cx}" cy="${cy + s * 0.86}" rx="${s * 0.52}" ry="${s * 0.1}" fill="#1fa9ff" fill-opacity=".5"/>
    </g>

    ${gemSvg(0.62, -0.34, s, cx, cy)}

    <polygon points="${cx},${cy - s * 0.68} ${cx + s},${cy - s * 0.1} ${cx},${cy + s * 0.74} ${cx - s},${cy - s * 0.1}"
        fill="none" stroke="url(#edge)" stroke-width="${Math.max(1.2, size * 0.006).toFixed(2)}"
        stroke-linejoin="round" opacity=".55"/>

    <circle cx="${cx}" cy="${cy}" r="${size * 0.5 - size * 0.012}"
        fill="none" stroke="#7fe4ff" stroke-opacity=".12"
        stroke-width="${Math.max(1, size * 0.004).toFixed(2)}"/>
</svg>`;
}


/* =========================================================
   4 · SOCIAL PREVIEW (1200 x 630)
========================================================= */

function ogSvg() {

    const W = 1200;
    const H = 630;

    const gs = 118;

    const gems = gemSvg(0.62, -0.32, gs, 268, 318 - MODE_Y * gs);

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
        <linearGradient id="bg" x1="0" y1="0" x2=".4" y2="1">
            <stop offset="0" stop-color="#04182e"/>
            <stop offset=".55" stop-color="#020c18"/>
            <stop offset="1" stop-color="#01050a"/>
        </linearGradient>

        <radialGradient id="glow" cx="22%" cy="46%" r="46%">
            <stop offset="0" stop-color="#1fa9ff" stop-opacity=".45"/>
            <stop offset="1" stop-color="#0b6cff" stop-opacity="0"/>
        </radialGradient>

        <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#4fdcff" stop-opacity="0"/>
            <stop offset=".5" stop-color="#4fdcff" stop-opacity=".85"/>
            <stop offset="1" stop-color="#4fdcff" stop-opacity="0"/>
        </linearGradient>

        <linearGradient id="title" x1="0" y1="0" x2="1" y2=".4">
            <stop offset="0" stop-color="#ffffff"/>
            <stop offset=".62" stop-color="#d6f6ff"/>
            <stop offset="1" stop-color="#7fe4ff"/>
        </linearGradient>

        <pattern id="grid" width="72" height="72" patternUnits="userSpaceOnUse">
            <path d="M72 0 H0 V72" fill="none" stroke="#4fdcff" stroke-opacity=".06" stroke-width="1"/>
        </pattern>

        <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="9"/>
        </filter>
    </defs>

    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#grid)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>

    <g filter="url(#soft)" opacity=".8">
        <ellipse cx="268" cy="452" rx="132" ry="16" fill="#1fa9ff" fill-opacity=".55"/>
    </g>

    ${gems}

    <!-- RTL text block, right aligned -->
    <text x="1146" y="168" text-anchor="end" font-family="Vazirmatn"
        font-size="27" fill="#4fdcff" letter-spacing="9">SKY · BLUE DIAMOND</text>

    <text x="1146" y="290" text-anchor="end" font-family="Estedad"
        font-size="70" fill="url(#title)">بعضی چیزا</text>

    <text x="1146" y="378" text-anchor="end" font-family="Estedad"
        font-size="70" fill="url(#title)">ساخته میشن</text>

    <rect x="646" y="424" width="500" height="1.4" fill="url(#rule)"/>

    <text x="1146" y="492" text-anchor="end" font-family="Vazirmatn"
        font-size="34" fill="#9db4c6">بعضی چیزا هم فقط اتفاق میفتن</text>

    <text x="1146" y="566" text-anchor="end" font-family="Vazirmatn"
        font-size="22" fill="#64798c" letter-spacing="3">BDADMEHR0.GITHUB.IO</text>
</svg>`;
}


/* =========================================================
   5 · WRITE
========================================================= */

async function png(svg, file, size, opaque) {

    let img = sharp(Buffer.from(svg));

    /* social platforms do not like transparency */
    if (opaque) img = img.flatten({ background: "#01050a" });

    if (size) img = img.resize(size);

    await img.png({ compressionLevel: 9, palette: false }).toFile(join(ROOT, file));

    console.log("  ✓", file);
}

console.log("generating pages / pwa assets…");

await mkdir(join(ROOT, "assets/icons"), { recursive: true });

await png(iconSvg(512, false), "assets/icons/icon-512.png", 512);
await png(iconSvg(512, false), "assets/icons/icon-192.png", 192);
await png(iconSvg(512, true), "assets/icons/icon-maskable-512.png", 512);
await png(iconSvg(512, false), "assets/icons/apple-touch-icon.png", 180);
await png(iconSvg(512, false), "assets/icons/favicon-32.png", 32);

await png(ogSvg(), "assets/og.png", null, true);

/* the svg favicon lives inline in index.html, but ship a file too */

await writeFile(
    join(ROOT, "assets/icons/favicon.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8beeff"/><stop offset=".5" stop-color="#31c5ff"/><stop offset="1" stop-color="#0063ff"/></linearGradient></defs><path d="M16 2 L27 12 L16 30 L5 12 Z" fill="url(#g)"/></svg>\n`
);

console.log("  ✓ assets/icons/favicon.svg");
console.log("done.");
