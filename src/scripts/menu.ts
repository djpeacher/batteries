/**
 * Popover menus (the Switcher and the Theme toggle).
 * Markup contract:
 *   <div data-menu>
 *     <button data-menu-button aria-expanded="false" aria-controls="ID">…</button>
 *     <div id="ID" class="menu" data-menu-panel hidden>…</div>
 *   </div>
 * The button toggles the panel; Esc closes it (focus returns to the button);
 * a click outside closes it. Opening one menu closes any other.
 */
type Menu = { root: HTMLElement; button: HTMLButtonElement; panel: HTMLElement };

const menus: Menu[] = [];

function setOpen(menu: Menu, open: boolean) {
  menu.panel.hidden = !open;
  menu.button.setAttribute("aria-expanded", String(open));
  menu.root.toggleAttribute("data-open", open);
}

export function closeMenu(root: Element) {
  const menu = menus.find((m) => m.root === root);
  if (menu) setOpen(menu, false);
}

function wire(root: HTMLElement) {
  const button = root.querySelector<HTMLButtonElement>("[data-menu-button]");
  const panel = root.querySelector<HTMLElement>("[data-menu-panel]");
  if (!button || !panel || menus.some((m) => m.root === root)) return;
  const menu = { root, button, panel };
  menus.push(menu);
  button.addEventListener("click", () => {
    const open = Boolean(panel.hidden);
    for (const m of menus) setOpen(m, false);
    setOpen(menu, open);
  });
}

document.querySelectorAll<HTMLElement>("[data-menu]").forEach(wire);

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  for (const m of menus) {
    if (m.panel.hidden) continue;
    setOpen(m, false);
    if (m.root.contains(document.activeElement)) m.button.focus();
  }
});

document.addEventListener("click", (e) => {
  for (const m of menus) {
    if (!m.panel.hidden && !m.root.contains(e.target as Node)) setOpen(m, false);
  }
});
