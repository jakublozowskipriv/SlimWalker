export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
export const h = (html: string) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};

// --- Drobne narzędzia UI ---
export function openSheet(html: string) {
  const sheet = $('.sheet'),
    bd = $('.sheet-backdrop');
  $('.sheet-body', sheet).innerHTML = html;
  sheet.classList.add('open');
  bd.classList.add('open');
  const close = () => (sheet.classList.remove('open'), bd.classList.remove('open'));
  bd.onclick = close;
  sheet.querySelectorAll<HTMLElement>('[data-close]').forEach((b) => (b.onclick = close));
  return close;
}

let toastTimer = 0;
export function toast(msg: string, ms = 2600) {
  const t = $('.toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), ms);
}
export const hideToast = () => $('.toast').classList.remove('show');

export function plural(n: number, one: string, few: string, many: string) {
  if (n === 1) return one;
  const d = n % 10,
    dd = n % 100;
  return d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14) ? few : many;
}
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

