// Icones da interface (tracos de 24x24, desenhados para este projeto).

const P = {
  tree: 'M5 4v16M5 8h6M5 16h6M14 5.5h6v5h-6zM14 13.5h6v5h-6z',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  layers: 'M12 4l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4',
  section: 'M7 4h10v16H7zM2 12h20',
  ruler: 'M4 16L16 4l4 4L8 20l-4-4zM8 12l2 2M11 9l2 2M14 6l2 2',
  fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0',
  open: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  eyeOff: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0M4 4l16 16',
  isolate: 'M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  pad: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  full: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  search: 'M5 11a6 6 0 1 0 12 0a6 6 0 1 0-12 0M20 20l-4.6-4.6',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  rotate: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5',
  move: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
  clip: 'M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 17.5a2 2 0 0 1-3-3L14.5 7',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  clock: 'M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0M12 8v4.5l3 2',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  file: 'M6 3h8l4 4v14H6V3zM14 3v4h4',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M7.5 9a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  more: 'M4 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0M11 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0M18 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
};

export function icon(name) {
  return '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + (P[name] || '') + '"/></svg>';
}

// Preenche os marcadores <i data-icon="nome"></i> do HTML.
export function hydrateIcons(root) {
  root.querySelectorAll('i[data-icon]').forEach(function (el) { el.innerHTML = icon(el.dataset.icon); });
}
