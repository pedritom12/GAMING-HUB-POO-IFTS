'use strict';
const $ = (id) => document.getElementById(id);

let currentUser = null;
let libraries = [];
let publicGames = [];
let rankingEntries = [];
let uploadTargetPublic = false;
let activeReviewGame = null;
let activeReviews = [];

async function api(url, method = 'GET', payload, isFormData = false) {
  const options = {
    method,
    credentials: 'same-origin',
    headers: isFormData ? {} : (payload ? { 'Content-Type': 'application/json' } : {}),
    body: isFormData ? payload : (payload ? JSON.stringify(payload) : undefined)
  };
  const response = await fetch(url, options);
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error('Error de conexión con el servidor');
  }
  if (response.status === 401) {
    location.replace('/');
    throw Error('La sesión terminó');
  }
  if (!response.ok) throw Error(data.error || 'No se pudo completar la operación');
  return data;
}

function setMessage(id, message, ok = false) {
  const e = $(id);
  e.textContent = message;
  e.classList.toggle('ok', ok);
}

function view(name) {
  document.querySelectorAll('.view').forEach((e) => e.classList.toggle('hidden', e.id !== `view-${name}`));
  document.querySelectorAll('.side-link[data-view]').forEach((e) => e.classList.toggle('active', e.dataset.view === name));
  $('current-view').textContent = {
    overview: 'Resumen',
    libraries: 'Mis bibliotecas',
    ranking: 'Ranking',
    account: 'Mi cuenta'
  }[name] || 'Resumen';
  if (name === 'libraries') renderLibraries();
  if (name === 'ranking') renderRanking();
}

function modal(id, open) {
  $(id).classList.toggle('hidden', !open);
  if (open) {
    const input = $(id).querySelector('input,select,textarea');
    input?.focus();
  }
}

function create(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = String(text ?? '');
  return el;
}

function paintUser() {
  const name = currentUser.username;
  $('header-name').textContent = name;
  $('header-avatar').textContent = name[0].toUpperCase();
  $('welcome-name').textContent = name;
  $('profile-avatar').textContent = name[0].toUpperCase();
  $('profile-title').textContent = name;
  $('profile-email').textContent = currentUser.email;
  $('profile-username').value = name;
  $('profile-mail').value = currentUser.email;
}

function normalizeGame(g) {
  return {
    id: g.id,
    title: g.title || g.titulo || 'Sin título',
    genre: g.genre || g.genero || '',
    year: g.year || g.anio || '',
    cover: g.cover || g.portada || '',
    link: g.link || g.ejecutable || g.playUrl || '',
    uploadedBy: g.uploadedBy || g.author || g.username || ''
  };
}

function getReviewStorageKey(game) {
  const keyPart = game.id ? String(game.id) : game.title.toLowerCase().trim();
  return `gaminghub_reviews_${keyPart}`;
}

function readLocalReviews(game) {
  try {
    const raw = localStorage.getItem(getReviewStorageKey(game));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalReviews(game, list) {
  try {
    localStorage.setItem(getReviewStorageKey(game), JSON.stringify(list));
  } catch {}
}

function normalizeReview(r) {
  const rating = Math.max(1, Math.min(5, Number(r.rating ?? r.stars ?? 5) || 5));
  return {
    author: r.author || r.username || r.user || 'Jugador',
    rating,
    comment: r.comment || r.text || r.review || '',
    date: r.date || r.createdAt || ''
  };
}

function renderReviewsList() {
  const list = $('reviews-list');
  list.replaceChildren();
  if (!activeReviews.length) {
    list.append(create('p', 'muted library-empty', 'Todavía no hay reseñas para este juego. ¡Sé el primero en opinar!'));
    return;
  }
  for (const rev of activeReviews) {
    const item = create('article', 'review-item');
    const top = create('div', 'review-top');
    const authorSpan = create('strong', '', rev.author);
    const starsText = '★'.repeat(rev.rating) + '☆'.repeat(5 - rev.rating);
    const starsSpan = create('span', 'review-stars', `${starsText} (${rev.rating}/5)`);
    top.append(authorSpan, starsSpan);
    item.append(top, create('p', '', rev.comment));
    list.append(item);
  }
}

async function openReviewsModal(game) {
  activeReviewGame = game;
  setMessage('review-error', '');
  $('form-review').reset();
  $('reviews-modal-title').textContent = `Reseñas · ${game.title}`;
  $('reviews-game-subtitle').textContent = `${game.genre || 'Sin género'}${game.year ? ' · ' + game.year : ''}`;
  activeReviews = readLocalReviews(game).map(normalizeReview);
  renderReviewsList();
  modal('modal-reviews', true);

  if (game.id) {
    try {
      const res = await api(`/api/games/${encodeURIComponent(game.id)}/reviews`);
      const remote = Array.isArray(res) ? res : (res.reviews || []);
      if (remote.length) {
        activeReviews = remote.map(normalizeReview);
        writeLocalReviews(game, activeReviews);
        renderReviewsList();
      }
    } catch {}
  }
}

function normalizeRankingItem(item) {
  const points = Number(item.points ?? item.puntos ?? item.score ?? 0) || 0;
  const rawProgress = Number(item.progress ?? item.progreso ?? 0) || 0;
  const progress = Math.max(0, Math.min(100, Math.round(rawProgress)));
  return {
    username: item.username || item.player || item.usuario || 'Jugador',
    game: item.game || item.gameTitle || item.juego || 'Sin juego',
    points,
    progress,
    level: item.level || item.nivel || (progress ? `${progress}%` : 'En curso')
  };
}

async function loadRanking() {
  try {
    const res = await api('/api/ranking');
    const list = Array.isArray(res) ? res : (res.ranking || res.scores || []);
    rankingEntries = list.map(normalizeRankingItem);
  } catch {
    rankingEntries = [];
  }

  const neonBest = Number(localStorage.getItem('neon_dodger_best') || 0);
  if (neonBest > 0 && currentUser) {
    const exists = rankingEntries.some(
      (r) => r.username === currentUser.username && r.game.toLowerCase() === 'neon dodger'
    );
    if (!exists) {
      const level = 1 + Math.floor(neonBest / 250);
      const pct = Math.min(100, Math.round((neonBest / 2500) * 100));
      rankingEntries.push({
        username: currentUser.username,
        game: 'Neon Dodger',
        points: neonBest,
        progress: pct,
        level: `Nivel ${level} (${pct}%)`
      });
    }
  }

  rankingEntries.sort((a, b) => b.points - a.points || b.progress - a.progress);

  const filterSelect = $('ranking-game-filter');
  const prev = filterSelect.value;
  filterSelect.replaceChildren();
  const allOpt = create('option', '', 'Todos los juegos');
  allOpt.value = '';
  filterSelect.append(allOpt);

  const knownGames = new Set([
    ...rankingEntries.map((r) => r.game),
    ...publicGames.map((g) => g.title),
    ...libraries.flatMap((l) => (l.games || []).map((g) => g.title || g.titulo))
  ].filter(Boolean));

  for (const gameName of [...knownGames].sort((a, b) => a.localeCompare(b))) {
    const opt = create('option', '', gameName);
    opt.value = gameName;
    filterSelect.append(opt);
  }
  if ([...knownGames].includes(prev)) filterSelect.value = prev;
  renderRanking();
}

function renderRanking() {
  const container = $('ranking-container');
  container.replaceChildren();
  const selectedGame = $('ranking-game-filter').value;
  const q = $('ranking-search').value.trim().toLowerCase();

  const filtered = rankingEntries.filter((r) => {
    if (selectedGame && r.game !== selectedGame) return false;
    if (q && !r.username.toLowerCase().includes(q) && !r.game.toLowerCase().includes(q)) return false;
    return true;
  });

  $('ranking-count').textContent = `${filtered.length} registro${filtered.length === 1 ? '' : 's'}`;

  if (!filtered.length) {
    container.append(create('p', 'muted library-empty', 'Todavía no hay puntajes registrados para este filtro.'));
    return;
  }

  const wrap = create('div', 'ranking-table-wrap');
  const table = create('table', 'ranking-table');
  const thead = create('thead');
  const headRow = create('tr');
  for (const title of ['#', 'Jugador', 'Juego', 'Puntos', 'Progreso']) {
    headRow.append(create('th', '', title));
  }
  thead.append(headRow);
  table.append(thead);

  const tbody = create('tbody');
  filtered.forEach((row, idx) => {
    const tr = create('tr');

    const tdPos = create('td');
    const posClass = idx === 0 ? 'top-1' : idx === 1 ? 'top-2' : idx === 2 ? 'top-3' : '';
    const posText = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : String(idx + 1);
    tdPos.append(create('span', `rank-pos ${posClass}`, posText));

    const tdUser = create('td');
    const userBox = create('div', 'rank-player');
    userBox.append(
      create('span', 'rank-avatar', (row.username[0] || 'J').toUpperCase()),
      create('span', '', row.username)
    );
    tdUser.append(userBox);

    const tdGame = create('td', '', row.game);

    const tdPoints = create('td');
    tdPoints.append(create('span', 'rank-points', row.points.toLocaleString('es-AR') + ' pts'));

    const tdProg = create('td');
    const progBox = create('div', 'progress-box');
    const track = create('div', 'progress-track');
    const fill = create('div', 'progress-fill');
    fill.style.width = `${row.progress}%`;
    track.append(fill);
    progBox.append(track, create('span', 'progress-label', row.level || `${row.progress}%`));
    tdProg.append(progBox);

    tr.append(tdPos, tdUser, tdGame, tdPoints, tdProg);
    tbody.append(tr);
  });

  table.append(tbody);
  wrap.append(table);
  container.append(wrap);
}

async function refresh() {
  const result = await api('/api/libraries');
  libraries = result.libraries || [];
  publicGames = (result.publicGames || []).map(normalizeGame);

  const seenPublicIds = new Set(publicGames.map((g) => String(g.id)));
  for (const lib of libraries) {
    if (lib.isPublic) {
      for (const rawG of (lib.games || [])) {
        const g = normalizeGame({ ...rawG, uploadedBy: rawG.uploadedBy || lib.ownerName || '' });
        if (!seenPublicIds.has(String(g.id))) {
          seenPublicIds.add(String(g.id));
          publicGames.push(g);
        }
      }
    }
  }

  const allLocalGames = libraries.flatMap((l) => (l.games || []).map(normalizeGame));
  $('stat-libraries').textContent = libraries.length;
  $('stat-games').textContent = allLocalGames.length;
  $('stat-genres').textContent = new Set([...allLocalGames, ...publicGames].map((g) => g.genre).filter(Boolean)).size;
  $('library-count').textContent = `${libraries.length} biblioteca${libraries.length === 1 ? '' : 's'}`;

  const recent = $('recent-games');
  recent.replaceChildren();
  for (const game of allLocalGames.slice(-4).reverse()) {
    const row = create('div', 'recent-row');
    row.append(create('div', 'recent-symbol', '🎮'));
    const t = create('div');
    t.append(create('strong', '', game.title), create('small', '', `${game.genre || 'Sin género'} · ${game.year || 'Sin año'}`));
    row.append(t);
    recent.append(row);
  }
  if (!recent.children.length) {
    recent.append(create('p', 'muted', 'Todavía no agregaste juegos. Creá una biblioteca para empezar.'));
  }

  for (const selectId of ['import-library', 'zip-library']) {
    const select = $(selectId);
    const previous = select.value;
    select.replaceChildren();
    for (const l of libraries) {
      const o = create('option', '', l.name);
      o.value = l.id;
      select.append(o);
    }
    if (libraries.some((l) => String(l.id) === String(previous))) select.value = previous;
  }

  renderLibraries();
  await loadRanking();
}

function buildGameCard(game, canDelete) {
  const card = create('article', 'game-card');
  const art = create('div', 'game-art');
  if (game.cover) {
    const img = create('img');
    img.src = game.cover;
    img.alt = 'Portada de ' + game.title;
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.remove());
    art.append(img);
  } else {
    art.append(create('span', 'game-placeholder', '🎮'));
  }
  card.append(art);

  const info = create('div', 'game-detail');
  const metaParts = [game.genre || 'Sin género'];
  if (game.year) metaParts.push(game.year);
  if (game.uploadedBy) metaParts.push('por ' + game.uploadedBy);
  info.append(create('h3', '', game.title), create('p', '', metaParts.join(' · ')));

  const foot = create('div', 'game-buttons');
  const leftActions = create('div', 'library-actions');
  if (game.link) {
    const a = create('a', 'btn btn-primary btn-small', 'Abrir ↗');
    a.href = game.link;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    leftActions.append(a);
  }
  const revBtn = create('button', 'btn btn-outline btn-small', '💬 Reseñas');
  revBtn.addEventListener('click', () => openReviewsModal(game));
  leftActions.append(revBtn);
  foot.append(leftActions);

  if (canDelete && game.id) {
    const rm = create('button', 'btn btn-icon', '×');
    rm.setAttribute('aria-label', 'Quitar ' + game.title);
    rm.title = 'Quitar juego';
    rm.addEventListener('click', async () => {
      if (!confirm('¿Quitar este juego?')) return;
      try {
        await api('/api/games/' + encodeURIComponent(game.id), 'DELETE');
        await refresh();
      } catch (e) {
        alert(e.message);
      }
    });
    foot.append(rm);
  }
  info.append(foot);
  card.append(info);
  return card;
}

function openPublicUpload(type) {
  uploadTargetPublic = true;
  modal(type === 'json' ? 'modal-json' : 'modal-zip', true);
}

function renderPublicSection(q) {
  const matchedPublic = publicGames.filter((g) =>
    [g.title, g.genre, g.year, g.uploadedBy].some((x) => String(x || '').toLowerCase().includes(q))
  );
  if (q && !matchedPublic.length) return null;

  const section = create('section', 'library-section');
  const header = create('div', 'library-heading');
  const headerText = create('div');
  const titleRow = create('div', 'library-title', '🌐  Biblioteca Pública de la Comunidad');
  titleRow.append(create('span', 'lib-badge public', 'Todos los usuarios'));
  headerText.append(
    titleRow,
    create('small', '', `${matchedPublic.length} juego${matchedPublic.length === 1 ? '' : 's'} compartido${matchedPublic.length === 1 ? '' : 's'}`)
  );
  header.append(headerText);

  const actions = create('div', 'library-actions');
  const addJson = create('button', 'btn btn-outline btn-small', '⇧ JSON');
  addJson.addEventListener('click', () => openPublicUpload('json'));
  const addZip = create('button', 'btn btn-outline btn-small', '📦 .ZIP');
  addZip.addEventListener('click', () => openPublicUpload('zip'));
  actions.append(addJson, addZip);
  header.append(actions);

  section.append(header);

  const grid = create('div', 'game-grid');
  for (const game of matchedPublic) {
    grid.append(buildGameCard(game, false));
  }
  if (!grid.children.length) {
    section.append(create('p', 'muted library-empty', 'Todavía no hay juegos en la biblioteca pública.'));
  }
  section.append(grid);
  return section;
}

function renderLibraries() {
  const list = $('library-list');
  list.replaceChildren();
  const q = $('search-input').value.trim().toLowerCase();

  const publicSection = renderPublicSection(q);
  if (publicSection) list.append(publicSection);

  if (!libraries.length) {
    const empty = create('div', 'empty-panel');
    empty.append(
      create('div', 'empty-emoji', '🎮'),
      create('h2', '', 'Todavía no creaste bibliotecas personales'),
      create('p', '', 'Creá una biblioteca para organizar tus juegos o subir paquetes .ZIP.')
    );
    const btn = create('button', 'btn btn-primary', '＋ Crear mi primera biblioteca');
    btn.addEventListener('click', () => modal('modal-library', true));
    empty.append(btn);
    list.append(empty);
    return;
  }

  let visibleLibs = 0;
  for (const lib of libraries) {
    const games = (lib.games || []).map(normalizeGame);
    const matched = games.filter((g) => [g.title, g.genre, g.year].some((x) => String(x || '').toLowerCase().includes(q)));
    if (q && !lib.name.toLowerCase().includes(q) && !matched.length) continue;
    visibleLibs++;

    const section = create('section', 'library-section');
    const header = create('div', 'library-heading');
    const headerText = create('div');
    const titleRow = create('div', 'library-title', '▤  ' + lib.name);
    titleRow.append(create('span', `lib-badge ${lib.isPublic ? 'public' : 'private'}`, lib.isPublic ? '🌐 Pública' : '🔒 Privada'));
    headerText.append(titleRow, create('small', '', `${games.length} juego${games.length === 1 ? '' : 's'} en esta biblioteca`));
    header.append(headerText);

    const actions = create('div', 'library-actions');
    const addJson = create('button', 'btn btn-outline btn-small', '⇧ JSON');
    addJson.addEventListener('click', () => {
      uploadTargetPublic = false;
      modal('modal-json', true);
      $('import-library').value = lib.id;
    });
    const addZip = create('button', 'btn btn-outline btn-small', '📦 .ZIP');
    addZip.addEventListener('click', () => {
      uploadTargetPublic = false;
      modal('modal-zip', true);
      $('zip-library').value = lib.id;
    });
    const del = create('button', 'btn btn-danger btn-small', 'Eliminar');
    del.addEventListener('click', async () => {
      if (!confirm(`¿Eliminar «${lib.name}» y todos sus juegos? Esta acción no se puede deshacer.`)) return;
      try {
        await api('/api/libraries/' + encodeURIComponent(lib.id), 'DELETE');
        await refresh();
      } catch (e) {
        alert(e.message);
      }
    });
    actions.append(addJson, addZip, del);
    header.append(actions);
    section.append(header);

    const grid = create('div', 'game-grid');
    for (const game of (q ? matched : games)) {
      grid.append(buildGameCard(game, true));
    }
    if (!grid.children.length) {
      section.append(create('p', 'muted library-empty', q ? 'No hay juegos que coincidan con la búsqueda.' : 'Biblioteca vacía. Agregá tus primeros juegos por JSON o .ZIP.'));
    }
    section.append(grid);
    list.append(section);
  }

  if (!visibleLibs && !publicSection) {
    list.append(create('p', 'muted', 'No se encontraron bibliotecas ni juegos con ese término.'));
  }
}

async function init() {
  try {
    const response = await api('/api/me');
    currentUser = response.user;
    paintUser();
    await refresh();
  } catch {
    if (!currentUser) location.replace('/');
  }
}

document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => view(b.dataset.view)));
$('account-shortcut').addEventListener('click', () => view('account'));
$('home-link').addEventListener('click', () => location.assign('/'));
$('overview-open').addEventListener('click', () => view('libraries'));
$('quick-profile').addEventListener('click', () => view('account'));
for (const id of ['open-library', 'quick-library']) $(id).addEventListener('click', () => modal('modal-library', true));
for (const id of ['open-import', 'quick-import']) $(id).addEventListener('click', () => {
  uploadTargetPublic = false;
  if (!libraries.length) {
    view('libraries');
    modal('modal-library', true);
    return;
  }
  modal('modal-json', true);
});
$('open-zip').addEventListener('click', () => {
  uploadTargetPublic = false;
  if (!libraries.length) {
    view('libraries');
    modal('modal-library', true);
    return;
  }
  modal('modal-zip', true);
});

document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => modal(b.dataset.close, false)));
for (const id of ['modal-library', 'modal-json', 'modal-zip', 'modal-reviews']) {
  $(id).addEventListener('click', (e) => {
    if (e.target === $(id)) modal(id, false);
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    for (const id of ['modal-library', 'modal-json', 'modal-zip', 'modal-reviews']) modal(id, false);
  }
});

$('search-input').addEventListener('input', renderLibraries);
$('ranking-search').addEventListener('input', renderRanking);
$('ranking-game-filter').addEventListener('change', renderRanking);
$('logout').addEventListener('click', async () => {
  try {
    await api('/api/logout', 'POST');
  } catch {}
  location.assign('/');
});

$('form-review').addEventListener('submit', async (e) => {
  e.preventDefault();
  setMessage('review-error', '');
  if (!activeReviewGame) return;
  const comment = $('review-comment').value.trim();
  const rating = Number($('review-rating').value) || 5;
  if (!comment) return setMessage('review-error', 'Escribí un comentario antes de publicar.');

  const newReview = {
    author: currentUser?.username || 'Jugador',
    rating,
    comment,
    date: new Date().toISOString()
  };

  if (activeReviewGame.id) {
    try {
      await api(`/api/games/${encodeURIComponent(activeReviewGame.id)}/reviews`, 'POST', { rating, comment });
    } catch {}
  }

  activeReviews = [newReview, ...activeReviews];
  writeLocalReviews(activeReviewGame, activeReviews);
  renderReviewsList();
  $('review-comment').value = '';
  setMessage('review-error', 'Reseña publicada.', true);
});

$('form-library').addEventListener('submit', async (e) => {
  e.preventDefault();
  setMessage('library-error', '');
  try {
    await api('/api/libraries', 'POST', { name: $('library-name').value });
    e.target.reset();
    modal('modal-library', false);
    await refresh();
    view('libraries');
  } catch (err) {
    setMessage('library-error', err.message);
  }
});

$('form-json').addEventListener('submit', async (e) => {
  e.preventDefault();
  setMessage('json-error', '');
  try {
    const parsed = JSON.parse($('json-input').value);
    const games = (Array.isArray(parsed) ? parsed : [parsed]).map((g) => ({
      ...g,
      public: uploadTargetPublic || Boolean(g.public)
    }));
    await api('/api/games', 'POST', {
      libraryId: $('import-library').value,
      public: uploadTargetPublic,
      games
    });
    uploadTargetPublic = false;
    e.target.reset();
    modal('modal-json', false);
    await refresh();
    view('libraries');
  } catch (err) {
    setMessage('json-error', err instanceof SyntaxError ? 'Revisá la sintaxis del JSON.' : err.message);
  }
});

$('form-zip').addEventListener('submit', async (e) => {
  e.preventDefault();
  setMessage('zip-error', '');
  const file = $('zip-file').files?.[0];
  if (!file) return setMessage('zip-error', 'Seleccioná un archivo .zip.');
  if (!file.name.toLowerCase().endsWith('.zip')) return setMessage('zip-error', 'El archivo debe tener extensión .zip.');

  const fd = new FormData();
  fd.append('libraryId', $('zip-library').value);
  fd.append('title', $('zip-title').value.trim());
  fd.append('genre', $('zip-genre').value.trim());
  fd.append('year', $('zip-year').value.trim());
  fd.append('public', String(uploadTargetPublic));
  fd.append('zipFile', file);

  try {
    await api('/api/games/zip', 'POST', fd, true);
    uploadTargetPublic = false;
    e.target.reset();
    modal('modal-zip', false);
    await refresh();
    view('libraries');
  } catch (err) {
    setMessage('zip-error', err.message);
  }
});

$('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setMessage('profile-message', '');
  try {
    const r = await api('/api/me', 'PATCH', {
      username: $('profile-username').value,
      email: $('profile-mail').value
    });
    currentUser = r.user;
    paintUser();
    setMessage('profile-message', 'Cambios guardados correctamente.', true);
  } catch (err) {
    setMessage('profile-message', err.message);
  }
});

$('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setMessage('password-message', '');
  try {
    await api('/api/me/password', 'POST', {
      currentPassword: $('old-password').value,
      newPassword: $('new-password').value
    });
    e.target.reset();
    alert('Contraseña actualizada. Iniciá sesión nuevamente.');
    location.assign('/');
  } catch (err) {
    setMessage('password-message', err.message);
  }
});

init();