/* =============================================================================
   THROWAWAY PROTOTYPE — Local promise look (design descent scaffold)
   Delete public/_proto-local-promise/ before shipping.
   =============================================================================

   THIS IS THE ONLY FILE A ROUND TOUCHES. The harness (index.html) — the iframe
   on the real page, the injection, and the remote control — stays as it is.

   A round replaces the five entries of window.DESIGNS below. Order here is the
   order the remote control cycles them. Each entry is:

     {
       name: "Footer line",            // shown in the remote control
       css: `...`,                      // injected as one <style> in the page's <head>
       mount(doc, ctx) { ... },         // inserts the Local promise into the page
     }

   mount(doc, ctx)
     doc  The iframe's real Document (the actual Shelf or battery page).
     ctx  { page: "shelf" | "frame",
            text: "Runs entirely in your browser. Nothing you type or open leaves your device.",
            theme: "light" | "dark",
            battery: "markdown-preview" | "text-diff" | null,
            mark(el) }  // tags el as injected; returns el

     Create nodes with doc.createElement and insert them where you like.
     EVERY node you insert must carry the attribute data-proto-lp (call
     ctx.mark(el) or set it yourself) so the harness can remove it on the next
     switch. Mark only the nodes you insert at the top level; their children go
     with them. Don't mutate existing page nodes (no restyling the settled
     headers) — add to them, using css for the look.
     mount runs again after every page load. It does not re-run on a theme
     switch: style through the page's tokens, which follow data-theme.

   DOM hooks in the real pages (same on both unless noted)
     html[data-theme="light"|"dark"]   the harness sets this
     main.column                        the page column (Shelf: 640px)
     main.column.wide                   the Frame's column (1040px)
     header.page-header                 flex row: .page-header-main + .header-end
     header.page-header.frame-header    Frame only (align-items:center)
     .page-header-main                  title block (Shelf: h1.page-title + p.page-sub;
                                        Frame: the Switcher + p.page-sub blurb)
     .page-sub                          the tagline / battery blurb (muted)
     .header-end                        the header's right slot (Theme toggle)
     ul.card.shelf                      Shelf only: the battery list card
     .card                              bordered card (Shelf list; battery panes)
     main.column > :last-child          the page's last block (append after it to sit below)

   Tokens (global.css; follow the theme): --bg --fg --muted --line --tint
   --card --shadow --font-sans --font-mono. Zinc only, no accent; 14px/1.5
   Geist base; .page-sub is 4px top margin, muted.
   ============================================================================= */

(() => {
  // Lucide icons, drawn like the site's own (16px, stroke 2, currentColor).
  const SHIELD = '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>';
  const LAPTOP = '<rect width="18" height="12" x="3" y="4" rx="2" ry="2"/><line x1="2" x2="22" y1="20" y2="20"/>';
  const icon = (doc, paths, size = 14) => {
    const s = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [k, v] of Object.entries({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) s.setAttribute(k, v);
    s.innerHTML = paths;
    return s;
  };

  // Shared pill look (round 1's Header pill), reused by the pill variants.
  const PILL = `
    display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px;
    border: 1px solid var(--line); border-radius: 999px; background: var(--card);
    box-shadow: var(--shadow); color: var(--muted); font: 500 13px/1 var(--font-sans);
    white-space: nowrap; cursor: pointer;`;
  const POP = `
    position: absolute; top: calc(100% + 6px); right: 0; z-index: 10; width: 260px;
    padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px;
    background: var(--card); box-shadow: var(--pop-shadow); color: var(--fg);
    font: 400 13px/1.5 var(--font-sans); white-space: normal; text-align: left;`;
  const footLine = (doc, ctx, cls) => {
    const p = ctx.mark(doc.createElement("p"));
    p.className = cls;
    p.textContent = ctx.text;
    return p;
  };

  window.DESIGNS = [
    // 1. Pill whose sentence appears on hover or keyboard focus; no click needed.
    {
      name: "Hover pill",
      css: `
        .lp-hp { position: relative; margin-right: 8px; }
        .lp-hp button { ${PILL} }
        .lp-hp button:hover, .lp-hp button:focus-visible { background: var(--tint); color: var(--fg); }
        .lp-hp [role="tooltip"] { ${POP} opacity: 0; visibility: hidden; transform: translateY(-2px);
          transition: opacity .12s, transform .12s, visibility 0s .12s; pointer-events: none; }
        .lp-hp:hover [role="tooltip"], .lp-hp:focus-within [role="tooltip"] {
          opacity: 1; visibility: visible; transform: none; transition: opacity .12s, transform .12s; }`,
      mount(doc, ctx) {
        const end = doc.querySelector(".header-end");
        if (!end) return;
        const w = ctx.mark(doc.createElement("span"));
        w.className = "lp-hp";
        const b = doc.createElement("button");
        b.type = "button";
        b.setAttribute("aria-describedby", "lp-hp-tip");
        b.append(icon(doc, SHIELD), doc.createTextNode("Runs locally"));
        const tip = doc.createElement("span");
        tip.id = "lp-hp-tip";
        tip.setAttribute("role", "tooltip");
        tip.textContent = ctx.text;
        w.append(b, tip);
        end.prepend(w);
      },
    },

    // 2. No label: a shield button, the Theme toggle's twin; click opens the sentence.
    {
      name: "Icon button",
      css: `
        .lp-ib { position: relative; margin-right: 8px; }
        .lp-ib summary { list-style: none; display: grid; place-items: center; width: 36px; height: 36px;
          border: 1px solid var(--line); border-radius: 8px; background: var(--card);
          box-shadow: var(--shadow); color: var(--fg); cursor: pointer; }
        .lp-ib summary::-webkit-details-marker { display: none; }
        .lp-ib summary:hover, .lp-ib[open] summary { background: var(--tint); }
        .lp-ib-panel { ${POP} display: flex; gap: 8px; }
        .lp-ib-panel svg { flex: none; margin-top: 2px; }`,
      mount(doc, ctx) {
        const end = doc.querySelector(".header-end");
        if (!end) return;
        const d = ctx.mark(doc.createElement("details"));
        d.className = "lp-ib";
        const s = doc.createElement("summary");
        s.setAttribute("aria-label", "Runs locally");
        s.append(icon(doc, SHIELD, 16));
        const panel = doc.createElement("div");
        panel.className = "lp-ib-panel";
        const t = doc.createElement("span");
        t.textContent = ctx.text;
        panel.append(icon(doc, SHIELD), t);
        d.append(s, panel);
        end.prepend(d);
        doc.addEventListener("click", e => { if (!d.contains(e.target)) d.open = false; });
      },
    },

    // 3. Both: the pill sits in the header and jumps to the Footer line, which holds the sentence.
    {
      name: "Pill to footer",
      css: `
        .lp-pf-pill { ${PILL} margin-right: 8px; }
        .lp-pf-pill:hover { background: var(--tint); color: var(--fg); }
        .lp-pf-foot { margin: 48px 0 0; padding: 16px 0 0; border-top: 1px solid var(--line);
          color: var(--muted); font-size: 13px; text-align: center; border-radius: 4px;
          transition: color .6s, background .6s; }
        .lp-pf-foot.lp-flash { color: var(--fg); background: var(--tint); transition: none; }`,
      mount(doc, ctx) {
        const end = doc.querySelector(".header-end");
        const main = doc.querySelector("main.column");
        if (!end || !main) return;
        const foot = footLine(doc, ctx, "lp-pf-foot");
        foot.id = "local-promise";
        main.appendChild(foot);
        const a = ctx.mark(doc.createElement("a"));
        a.className = "lp-pf-pill";
        a.href = "#local-promise";
        a.append(icon(doc, SHIELD), doc.createTextNode("Runs locally"));
        a.addEventListener("click", e => {
          e.preventDefault();
          foot.scrollIntoView({ behavior: "smooth", block: "center" });
          foot.classList.add("lp-flash");
          setTimeout(() => foot.classList.remove("lp-flash"), 900);
        });
        end.prepend(a);
      },
    },

    // 4. The footer's place, the pill's look: the whole sentence in a pill at the end of the page.
    {
      name: "Footer pill",
      css: `
        .lp-fp { display: flex; justify-content: center; margin: 48px 0 0; }
        .lp-fp span { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px;
          border: 1px solid var(--line); border-radius: 999px; background: var(--card);
          box-shadow: var(--shadow); color: var(--muted); font-size: 13px; text-align: center; }
        .lp-fp svg { flex: none; }`,
      mount(doc, ctx) {
        const main = doc.querySelector("main.column");
        if (!main) return;
        const wrap = ctx.mark(doc.createElement("div"));
        wrap.className = "lp-fp";
        const s = doc.createElement("span");
        s.append(icon(doc, SHIELD), doc.createTextNode(ctx.text));
        wrap.append(s);
        main.appendChild(wrap);
      },
    },

    // 5. The Footer line, pinned to the bottom of the window so the Frame can't push it out of view.
    {
      name: "Pinned footer line",
      css: `
        .lp-pin { position: fixed; left: 0; right: 0; bottom: 0; z-index: 5; margin: 0;
          padding: 8px 20px; border-top: 1px solid var(--line);
          background: color-mix(in srgb, var(--bg) 85%, transparent); backdrop-filter: blur(8px);
          color: var(--muted); font-size: 12.5px; text-align: center; }
        body:has(.lp-pin) main.column { padding-bottom: 180px; }`,
      mount(doc, ctx) {
        doc.body.appendChild(footLine(doc, ctx, "lp-pin"));
      },
    },
  ];
})();
