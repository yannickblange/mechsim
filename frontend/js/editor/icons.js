// icons.js - 24 x 24 line icons for the toolbox (stroke = currentColor).
const wrap = (body) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  move: wrap('<path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>'),
  rope: wrap('<path d="M4 8c3 5 5 5 8 5s5 0 8-5" /><circle cx="4" cy="8" r="1.6" fill="currentColor"/><circle cx="20" cy="8" r="1.6" fill="currentColor"/>'),
  rod: wrap('<path d="M5 18L19 6" stroke-width="3.2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/>'),
  joint: wrap('<rect x="3" y="14" width="10" height="5" rx="1"/><rect x="11" y="5" width="10" height="5" rx="1"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/>'),
  weld: wrap('<rect x="3" y="14" width="10" height="5" rx="1"/><rect x="11" y="5" width="10" height="5" rx="1"/><rect x="9.4" y="9.4" width="5.2" height="5.2" fill="currentColor"/>'),
  select: wrap('<path d="M6 3l12 8-5.5 1.3L9.5 18z"/>'),
  rect: wrap('<rect x="3.5" y="7" width="17" height="10" rx="1"/><circle cx="12" cy="12" r="1.8"/>'),
  circle: wrap('<circle cx="12" cy="12" r="8.5"/><path d="M12 12h8.5"/><circle cx="12" cy="12" r="1.2"/>'),
  surface: wrap('<path d="M3 11h18"/><path d="M5 14l-2 2M9 14l-2 2M13 14l-2 2M17 14l-2 2M21 14l-2 2"/>'),
  spring: wrap('<path d="M2 12h3.5l1.5-5 3 10 3-10 3 10 1.5-5H22"/>'),
  load: wrap('<path d="M4 20L15 9"/><path d="M9.5 9H15v5.5"/><path d="M17.5 21a4.5 4.5 0 1 0-3.2-7.7"/>'),
  pin: wrap('<path d="M12 6l-6 10.5h12z"/><circle cx="12" cy="6" r="1.6"/><path d="M4 19.5h16"/><path d="M7 22l-1.5-2.5M11 22l-1.5-2.5M15 22l-1.5-2.5M19 22l-1.5-2.5"/>'),
  fixed: wrap('<path d="M3 13h18" stroke-width="3"/><rect x="9" y="8" width="6" height="5" fill="currentColor"/><path d="M5 17l-2 2.5M9 17l-2 2.5M13 17l-2 2.5M17 17l-2 2.5M21 17l-2 2.5"/>'),
  roller: wrap('<path d="M12 5l-5.5 9h11z"/><circle cx="9" cy="16.5" r="1.6"/><circle cx="15" cy="16.5" r="1.6"/><path d="M4 19.5h16"/>'),
};
