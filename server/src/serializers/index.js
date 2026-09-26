/**
 * Explicit response shapes (DTOs). Every public endpoint builds its response with one
 * of these functions, so a new private field added to a model can never leak by accident.
 */
import { STAFF_ROLES } from '../auth/permissions.js';
import { idString } from '../utils/ids.js';
import { normalizeVideoCategory } from '../models/Content.js';

export function publicMedia(m) {
  if (!m || !m.url || m.deliveryType === 'private' || m.deliveryType === 'authenticated') return null;
  return {
    // The public ID is part of the delivery URL anyway; it is not a secret.
    publicId: m.publicId,
    url: m.url,
    width: m.width ?? null,
    height: m.height ?? null,
    alt: m.alt || '',
    resourceType: m.resourceType || 'image',
    format: m.format || null,
    duration: m.duration ?? null,
  };
}

/** For private files: describe the file but never include its URL. */
export function privateFileInfo(m) {
  if (!m) return null;
  return { format: m.format || null, bytes: m.bytes ?? null, resourceType: m.resourceType || 'raw' };
}

// ---------------------------------------------------------------------------- Football
export function teamSummary(t) {
  if (!t || typeof t !== 'object' || !t._id) return t ? { id: idString(t) } : null;
  return {
    id: idString(t._id),
    name: t.name,
    shortName: t.shortName || '',
    slug: t.slug,
    logo: publicMedia(t.logo),
    isClubTeam: Boolean(t.isClubTeam),
  };
}

export function publicTeam(t) {
  return {
    ...teamSummary(t),
    description: t.description || '',
    category: t.category || '',
    ageGroup: t.ageGroup || '',
    homeVenue: t.homeVenue || '',
    status: t.status,
    competitions: (t.competitions || []).map((c) => (c && c._id ? competitionSummary(c) : { id: idString(c) })),
    season: t.season && t.season._id ? seasonSummary(t.season) : t.season ? { id: idString(t.season) } : null,
    displayOrder: t.displayOrder ?? 100,
  };
}

export function seasonSummary(s) {
  if (!s || !s._id) return s ? { id: idString(s) } : null;
  return { id: idString(s._id), name: s.name, startDate: s.startDate, endDate: s.endDate, isCurrent: Boolean(s.isCurrent), status: s.status };
}

export function competitionSummary(c) {
  if (!c || !c._id) return c ? { id: idString(c) } : null;
  return { id: idString(c._id), name: c.name, shortName: c.shortName || '', slug: c.slug, logo: publicMedia(c.logo), type: c.type };
}

export function publicCompetition(c) {
  return {
    ...competitionSummary(c),
    description: c.description || '',
    organizer: c.organizer || '',
    rules: {
      pointsWin: c.rules?.pointsWin ?? 3,
      pointsDraw: c.rules?.pointsDraw ?? 1,
      pointsLoss: c.rules?.pointsLoss ?? 0,
      tieBreakers: c.rules?.tieBreakers ?? [],
      countsForStandings: c.rules?.countsForStandings ?? true,
    },
    seasons: (c.seasons || []).map(seasonSummary),
    currentSeason: seasonSummary(c.currentSeason),
    teams: (c.teams || []).map(teamSummary),
    status: c.status,
    displayOrder: c.displayOrder ?? 100,
  };
}

function eventPlayerName(ref, name) {
  if (ref && ref._id) return publicPlayerName(ref);
  return name || '';
}

export function publicEvent(e) {
  return {
    id: idString(e._id),
    type: e.type,
    minute: e.minute,
    addedTime: e.addedTime || 0,
    side: e.side,
    player: e.player && e.player._id ? playerLink(e.player) : null,
    playerName: eventPlayerName(e.player, e.playerName),
    assist: e.assist && e.assist._id ? playerLink(e.assist) : null,
    assistName: eventPlayerName(e.assist, e.assistName),
    playerOff: e.playerOff && e.playerOff._id ? playerLink(e.playerOff) : null,
    playerOffName: eventPlayerName(e.playerOff, e.playerOffName),
    note: e.note || '',
  };
}

export function matchSummary(m) {
  if (!m || !m._id) return m ? { id: idString(m) } : null;
  const completed = m.status === 'completed' || (m.status === 'abandoned' && m.score?.home != null);
  return {
    id: idString(m._id),
    competition: competitionSummary(m.competition),
    season: seasonSummary(m.season),
    homeTeam: teamSummary(m.homeTeam),
    awayTeam: teamSummary(m.awayTeam),
    kickoffAt: m.kickoffAt,
    venue: m.venue || '',
    round: m.round || '',
    status: m.status,
    statusNote: m.statusNote || '',
    score: completed || m.status === 'live'
      ? {
          home: m.score?.home ?? null,
          away: m.score?.away ?? null,
          homePenalties: m.score?.homePenalties ?? null,
          awayPenalties: m.score?.awayPenalties ?? null,
        }
      : null,
  };
}

export function publicMatch(m) {
  const base = matchSummary(m);
  const completed = m.status === 'completed' || m.status === 'abandoned';
  const lineup = (list) =>
    (list || [])
      .filter((l) => l.player && l.player._id)
      .map((l) => ({ player: playerLink(l.player), starter: l.starter, shirtNumber: l.shirtNumber ?? l.player.jerseyNumber ?? null }));
  return {
    ...base,
    referee: m.referee || '',
    // Completed-match details are only included once the match has been played.
    events: completed ? (m.events || []).map(publicEvent).sort((a, b) => a.minute - b.minute || a.addedTime - b.addedTime) : [],
    lineups: completed ? { home: lineup(m.lineups?.home), away: lineup(m.lineups?.away) } : { home: [], away: [] },
    stats: completed ? cleanStats(m.stats) : null,
    report:
      completed && m.report?.publishedAt
        ? { title: m.report.title || '', body: m.report.body || '', publishedAt: m.report.publishedAt }
        : null,
    highlightsVideo: m.highlightsVideo && m.highlightsVideo._id && m.highlightsVideo.status === 'published' ? publicVideo(m.highlightsVideo) : null,
  };
}

function cleanStats(stats) {
  if (!stats) return null;
  const out = {};
  for (const [k, v] of Object.entries(stats)) {
    if (v && (v.home != null || v.away != null)) out[k] = { home: v.home ?? null, away: v.away ?? null };
  }
  return Object.keys(out).length ? out : null;
}

// ---------------------------------------------------------------------------- Players
export function publicPlayerName(p) {
  if (!p) return '';
  if (p.hideFullNamePublicly) return `${p.knownAs || p.firstName} ${p.lastName ? `${p.lastName[0]}.` : ''}`.trim();
  return p.knownAs || [p.firstName, p.lastName].filter(Boolean).join(' ');
}

export function playerLink(p) {
  return { id: idString(p._id), slug: p.slug, name: publicPlayerName(p), jerseyNumber: p.jerseyNumber ?? null };
}

/** PUBLIC classification only. */
export function publicPlayer(p, { stats } = {}) {
  return {
    id: idString(p._id),
    slug: p.slug,
    name: publicPlayerName(p),
    firstName: p.hideFullNamePublicly ? p.knownAs || p.firstName : p.firstName,
    lastName: p.hideFullNamePublicly ? '' : p.lastName,
    photo: p.hidePhotoPublicly ? null : publicMedia(p.photo),
    position: p.position,
    detailedPosition: p.detailedPosition || '',
    jerseyNumber: p.jerseyNumber ?? null,
    team: teamSummary(p.team),
    nationality: p.nationality || '',
    bio: p.bio || '',
    preferredFoot: p.preferredFoot || '',
    featured: Boolean(p.featured),
    ...(stats ? { stats } : {}),
  };
}

/**
 * Staff view of a player. Restricted and highly sensitive sections are only included
 * when the caller's permission and scope allow them.
 */
export function staffPlayer(p, { includeRestricted = false, includeSensitive = false, stats } = {}) {
  const base = {
    ...publicPlayer(p, { stats }),
    firstName: p.firstName,
    lastName: p.lastName,
    knownAs: p.knownAs || '',
    fullName: [p.firstName, p.lastName].filter(Boolean).join(' '),
    photo: publicMedia(p.photo),
    status: p.status,
    showOnWebsite: p.showOnWebsite !== false,
    isMinor: Boolean(p.isMinor),
    hidePhotoPublicly: Boolean(p.hidePhotoPublicly),
    hideFullNamePublicly: Boolean(p.hideFullNamePublicly),
    joinedAt: p.joinedAt || null,
    hasAccount: Boolean(p.user),
    statAdjustments: p.statAdjustments || { appearances: 0, goals: 0, assists: 0 },
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
  if (includeRestricted) {
    const r = p.restricted || {};
    base.restricted = {
      dateOfBirth: r.dateOfBirth || null,
      phone: r.phone || '',
      email: r.email || '',
      address: r.address || '',
      emergencyContact: r.emergencyContact || {},
      guardian: r.guardian || {},
      internalNotes: r.internalNotes || '',
      documents: (r.documents || []).map((d) => ({
        id: idString(d._id),
        name: d.name,
        kind: d.kind,
        uploadedAt: d.uploadedAt,
        file: privateFileInfo(d.file),
      })),
    };
  }
  if (includeSensitive) {
    base.sensitive = { nationalId: p.sensitive?.nationalId || '', medicalNotes: p.sensitive?.medicalNotes || '' };
  }
  return base;
}

/** What a player sees about themselves in the Player Portal (no internal notes). */
export function ownPlayer(p, { stats } = {}) {
  const r = p.restricted || {};
  return {
    ...staffPlayer(p, { stats }),
    personal: {
      dateOfBirth: r.dateOfBirth || null,
      phone: r.phone || '',
      email: r.email || '',
      address: r.address || '',
      emergencyContact: r.emergencyContact || {},
      guardian: r.guardian || {},
      nationalIdOnFile: Boolean(p.sensitive?.nationalId),
      documents: (r.documents || []).map((d) => ({ id: idString(d._id), name: d.name, kind: d.kind, uploadedAt: d.uploadedAt })),
    },
  };
}

// ---------------------------------------------------------------------------- Staff
export function publicStaff(s) {
  return {
    id: idString(s._id),
    fullName: s.fullName,
    title: s.title || STAFF_ROLES[s.staffRole]?.label || '',
    role: s.staffRole,
    roleLabel: STAFF_ROLES[s.staffRole]?.label || 'Staff',
    department: s.department || '',
    category: s.category,
    team: teamSummary(s.team),
    bio: s.bio || '',
    background: s.background || '',
    photo: publicMedia(s.photo),
    dateJoined: s.showDateJoined ? s.dateJoined : null,
  };
}

export function adminStaff(s, user) {
  return {
    ...publicStaff(s),
    dateJoined: s.dateJoined || null,
    showDateJoined: Boolean(s.showDateJoined),
    showOnWebsite: Boolean(s.showOnWebsite),
    displayOrder: s.displayOrder ?? 100,
    status: s.status,
    grants: (s.grants || []).map((g) => ({ permission: g.permission, scope: g.scope })),
    assignedTeams: (s.assignedTeams || []).map((t) => (t && t._id ? teamSummary(t) : { id: idString(t) })),
    assignedPlayers: (s.assignedPlayers || []).map((p) => (p && p._id ? playerLink(p) : { id: idString(p) })),
    privatePhone: s.privatePhone || '',
    internalNotes: s.internalNotes || '',
    user: user ? { id: idString(user._id), email: user.email, status: user.status, name: user.name } : s.user ? { id: idString(s.user) } : null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

// ---------------------------------------------------------------------------- Users
export function selfUser(user, { staff, grants, player } = {}) {
  return {
    id: idString(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    emailVerified: Boolean(user.emailVerifiedAt),
    createdAt: user.createdAt,
    consents: user.consents || {},
    deletionRequestedAt: user.deletionRequestedAt || null,
    player: player ? { id: idString(player._id), slug: player.slug, name: publicPlayerName(player) } : user.player ? { id: idString(user.player) } : null,
    staff: staff
      ? {
          id: idString(staff._id),
          role: staff.staffRole,
          roleLabel: STAFF_ROLES[staff.staffRole]?.label || 'Staff',
          title: staff.title || '',
          status: staff.status,
          assignedTeams: (staff.assignedTeams || []).map(idString),
          assignedPlayers: (staff.assignedPlayers || []).map(idString),
        }
      : null,
    permissions: grants || [],
  };
}

export function adminUser(u) {
  return {
    id: idString(u._id),
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    emailVerified: Boolean(u.emailVerifiedAt),
    lastLoginAt: u.lastLoginAt || null,
    createdAt: u.createdAt,
    statusReason: u.statusReason || '',
    statusChangedAt: u.statusChangedAt || null,
    deletionRequestedAt: u.deletionRequestedAt || null,
    player: u.player ? idString(u.player) : null,
    staff: u.staff ? idString(u.staff) : null,
  };
}

// ---------------------------------------------------------------------------- Content
export function authorSummary(u, fallbackName) {
  return { name: (u && u.name) || fallbackName || 'Club staff' };
}

export function newsSummary(n) {
  return {
    id: idString(n._id),
    title: n.title,
    slug: n.slug,
    excerpt: n.excerpt || String(n.content || '').replace(/[#*_>`-]/g, '').slice(0, 220),
    featuredImage: publicMedia(n.featuredImage),
    category: n.category,
    competition: competitionSummary(n.competition),
    team: teamSummary(n.team),
    author: authorSummary(n.author, n.authorName),
    publishedAt: n.publishedAt,
  };
}

export function publicNews(n) {
  return {
    ...newsSummary(n),
    content: n.content,
    relatedMatches: (n.relatedMatches || []).filter((m) => m && m._id && !m.deletedAt).map(matchSummary),
    relatedPlayers: (n.relatedPlayers || []).filter((p) => p && p._id && p.showOnWebsite !== false && !p.deletedAt).map(playerLink),
    allowComments: n.allowComments !== false,
    updatedAt: n.updatedAt,
  };
}

export function adminNews(n) {
  return {
    ...publicNews(n),
    status: n.status,
    submittedAt: n.submittedAt || null,
    archivedAt: n.archivedAt || null,
    authorId: idString(n.author?._id ?? n.author),
    relatedMatches: (n.relatedMatches || []).map((m) => (m && m._id ? matchSummary(m) : { id: idString(m) })),
    relatedPlayers: (n.relatedPlayers || []).map((p) => (p && p._id ? playerLink(p) : { id: idString(p) })),
    createdAt: n.createdAt,
  };
}

export function publicVideo(v) {
  return {
    id: idString(v._id),
    title: v.title,
    description: v.description || '',
    category: normalizeVideoCategory(v.category),
    source: v.source,
    youtubeId: v.source === 'youtube' ? v.youtubeId : null,
    media: v.source === 'cloudinary' ? publicMedia(v.media) : null,
    thumbnailUrl: v.thumbnailUrl || (v.source === 'youtube' && v.youtubeId ? `https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg` : ''),
    team: teamSummary(v.team),
    match: v.match && v.match._id ? matchSummary(v.match) : null,
    featured: Boolean(v.featured),
    publishedAt: v.publishedAt,
  };
}

export function adminVideo(v) {
  return { ...publicVideo(v), status: v.status, createdAt: v.createdAt, matchId: idString(v.match?._id ?? v.match), teamId: idString(v.team?._id ?? v.team) };
}

export function publicGalleryItem(g) {
  return {
    id: idString(g._id),
    title: g.title || '',
    caption: g.caption || '',
    category: g.category,
    image: publicMedia(g.image),
    team: teamSummary(g.team),
    match: g.match && g.match._id ? matchSummary(g.match) : null,
    takenAt: g.takenAt || null,
    photographer: g.photographer || '',
    createdAt: g.createdAt,
  };
}

export function adminGalleryItem(g) {
  return { ...publicGalleryItem(g), status: g.status, teamId: idString(g.team?._id ?? g.team), matchId: idString(g.match?._id ?? g.match) };
}

export function publicComment(c, viewerId) {
  return {
    id: idString(c._id),
    parent: c.parent ? idString(c.parent) : null,
    authorName: c.authorName,
    body: c.deletedAt ? '' : c.body,
    deleted: Boolean(c.deletedAt),
    createdAt: c.createdAt,
    editedAt: c.editedAt || null,
    isOwn: viewerId ? idString(c.user) === idString(viewerId) : false,
    status: viewerId && idString(c.user) === idString(viewerId) ? c.status : undefined,
  };
}
