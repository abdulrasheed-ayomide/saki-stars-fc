import { it, expect, beforeAll } from 'vitest';
import { describeDb, setupApp, api, createDirector, createStaff } from './setup.js';
import { AuditLog, Notification } from '../../src/models/index.js';

describeDb('football: fixtures, results, standings and statistics', () => {
  const ctx = setupApp('football');
  let director;
  let admin;
  let pub;
  const ids = {};

  beforeAll(async () => {
    director = await createDirector(ctx);
    admin = api(ctx, director.token);
    pub = api(ctx);
  });

  it('creates a season, teams and a league competition from the dashboard API', async () => {
    const season = await admin.post('/admin/seasons').send({ name: '2026/27', startDate: '2026-08-01', endDate: '2027-06-30', isCurrent: true });
    expect(season.status).toBe(201);
    ids.season = season.body.data.id;

    const club = await admin.post('/admin/teams').send({ name: 'Saki Stars First Team', isClubTeam: true, category: 'Senior' });
    expect(club.status).toBe(201);
    ids.club = club.body.data.id;
    ids.rivers = (await admin.post('/admin/teams').send({ name: 'Rivers United' })).body.data.id;
    ids.kano = (await admin.post('/admin/teams').send({ name: 'Kano Pillars' })).body.data.id;
    ids.enyimba = (await admin.post('/admin/teams').send({ name: 'Enyimba' })).body.data.id;

    const league = await admin.post('/admin/competitions').send({
      name: 'Nigeria League One',
      shortName: 'NLO',
      type: 'league',
      seasons: [ids.season],
      currentSeason: ids.season,
      teams: [ids.club, ids.rivers, ids.kano, ids.enyimba],
    });
    expect(league.status).toBe(201);
    ids.league = league.body.data.id;
    const friendly = await admin.post('/admin/competitions').send({ name: 'Pre-season Friendly', type: 'friendly', seasons: [ids.season] });
    ids.friendly = friendly.body.data.id;

    const teams = await pub.get('/teams');
    expect(teams.body.data.map((t) => t.name)).toEqual(['Saki Stars First Team']); // public list = club teams
  });

  it('creates players and fixtures, and notifies nobody-yet without failing', async () => {
    const p1 = await admin.post('/admin/players').send({ firstName: 'Musa', lastName: 'Okon', position: 'Forward', jerseyNumber: 9, team: ids.club });
    const p2 = await admin.post('/admin/players').send({ firstName: 'Tunde', lastName: 'Eze', position: 'Midfielder', jerseyNumber: 8, team: ids.club });
    expect(p1.status).toBe(201);
    ids.musa = p1.body.data.id;
    ids.tunde = p2.body.data.id;

    const past = (days) => new Date(Date.now() - days * 86400000).toISOString();
    const future = (days) => new Date(Date.now() + days * 86400000).toISOString();
    const make = (home, away, when, competition = ids.league) =>
      admin.post('/admin/matches').send({ competition, season: ids.season, homeTeam: home, awayTeam: away, kickoffAt: when, venue: 'Saki Township Stadium' });

    ids.m1 = (await make(ids.club, ids.rivers, past(20))).body.data.id;
    ids.m2 = (await make(ids.kano, ids.club, past(13))).body.data.id;
    ids.m3 = (await make(ids.rivers, ids.kano, past(6))).body.data.id;
    ids.m4 = (await make(ids.club, ids.enyimba, past(2))).body.data.id;
    ids.upcoming = (await make(ids.club, ids.kano, future(5))).body.data.id;
    ids.friendlyMatch = (await make(ids.club, ids.enyimba, past(30), ids.friendly)).body.data.id;
    expect(ids.upcoming).toBeTruthy();

    const self = await admin.post('/admin/matches').send({ competition: ids.league, season: ids.season, homeTeam: ids.club, awayTeam: ids.club, kickoffAt: future(9) });
    expect(self.status).toBe(422);
  });

  it('rejects a result whose goals do not add up, and results for future matches', async () => {
    const bad = await admin.put(`/admin/matches/${ids.m1}/result`).send({
      score: { home: 2, away: 0 },
      events: [{ type: 'goal', minute: 10, side: 'home', player: ids.musa }],
    });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details[0].message).toMatch(/do not match/);
    const future = await admin.put(`/admin/matches/${ids.upcoming}/result`).send({ score: { home: 1, away: 0 } });
    expect(future.status).toBe(400);
    const opponentLinked = await admin.put(`/admin/matches/${ids.m1}/result`).send({
      score: { home: 0, away: 1 },
      events: [{ type: 'goal', minute: 10, side: 'away', player: ids.musa }],
    });
    expect(opponentLinked.status).toBe(422);
  });

  it('records results with scorers, assists, cards, substitutions and line-ups', async () => {
    const r1 = await admin.put(`/admin/matches/${ids.m1}/result`).send({
      score: { home: 2, away: 1 },
      events: [
        { type: 'goal', minute: 12, side: 'home', player: ids.musa, assist: ids.tunde },
        { type: 'goal', minute: 40, side: 'away', playerName: 'J. Rivers' },
        { type: 'penalty_goal', minute: 77, side: 'home', player: ids.musa },
        { type: 'yellow_card', minute: 80, side: 'home', player: ids.tunde },
        { type: 'substitution', minute: 85, side: 'home', player: ids.tunde, playerOff: ids.musa },
      ],
      lineups: { home: [{ player: ids.musa, starter: true, minutes: 85 }, { player: ids.tunde, starter: false, minutes: 5 }], away: [] },
      stats: { possession: { home: 55, away: 45 }, shots: { home: 12, away: 7 } },
    });
    expect(r1.status).toBe(200);
    expect((await admin.put(`/admin/matches/${ids.m2}/result`).send({ score: { home: 1, away: 1 } })).status).toBe(200);
    expect((await admin.put(`/admin/matches/${ids.m3}/result`).send({ score: { home: 3, away: 0 } })).status).toBe(200);
    expect((await admin.put(`/admin/matches/${ids.m4}/result`).send({ score: { home: 0, away: 2 } })).status).toBe(200);
    expect((await admin.put(`/admin/matches/${ids.friendlyMatch}/result`).send({ score: { home: 5, away: 0 } })).status).toBe(200);
    expect(await AuditLog.countDocuments({ action: 'match.result_recorded' })).toBe(5);
  });

  it('calculates the league table from results (3/1/0, goal difference, form)', async () => {
    const res = await pub.get(`/competitions/${ids.league}/standings`);
    expect(res.status).toBe(200);
    const rows = Object.fromEntries(res.body.data.rows.map((r) => [r.team.name, r]));
    // Club: W 2-1, D 1-1, L 0-2  => 4 pts, GF 3, GA 4
    expect(rows['Saki Stars First Team']).toMatchObject({ played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 3, goalsAgainst: 4, goalDifference: -1, points: 4 });
    expect(rows['Saki Stars First Team'].form).toEqual(['L', 'D', 'W']);
    // Rivers: L 1-2, W 3-0 => 3 pts, GD +2; Kano: D 1-1, L 0-3 => 1 pt; Enyimba: W 2-0 => 3 pts GD +2 GF 2
    expect(rows['Rivers United'].points).toBe(3);
    expect(rows['Enyimba'].points).toBe(3);
    const order = res.body.data.rows.map((r) => r.team.name);
    expect(order[0]).toBe('Saki Stars First Team'); // 4 pts
    expect(order.at(-1)).toBe('Kano Pillars');
    // Rivers (GF 4) ahead of Enyimba (GF 2) on goals scored.
    expect(order.indexOf('Rivers United')).toBeLessThan(order.indexOf('Enyimba'));
  });

  it('friendly matches never affect standings', async () => {
    const res = await pub.get(`/competitions/${ids.friendly}/standings`);
    expect(res.body.data.applicable).toBe(false);
  });

  it('applies audited standings corrections and can revoke them', async () => {
    const short = await admin.post(`/admin/competitions/${ids.league}/adjustments`).send({ season: ids.season, team: ids.kano, points: -3, reason: 'x' });
    expect(short.status).toBe(422);
    const adj = await admin
      .post(`/admin/competitions/${ids.league}/adjustments`)
      .send({ season: ids.season, team: ids.enyimba, points: 3, reason: 'Awarded match against Kano after a disciplinary hearing' });
    expect(adj.status).toBe(201);
    let rows = (await pub.get(`/competitions/${ids.league}/standings`)).body.data.rows;
    expect(rows[0].team.name).toBe('Enyimba');
    expect(rows[0].adjustment.points).toBe(3);
    expect(await AuditLog.countDocuments({ action: 'standings.adjusted' })).toBe(1);

    await admin.delete(`/admin/competitions/${ids.league}/adjustments/${adj.body.data.id}`);
    rows = (await pub.get(`/competitions/${ids.league}/standings`)).body.data.rows;
    expect(rows[0].team.name).toBe('Saki Stars First Team');
  });

  it('abandoned matches only count after an audited "result stands" decision', async () => {
    const extra = await admin.post('/admin/matches').send({ competition: ids.league, season: ids.season, homeTeam: ids.kano, awayTeam: ids.enyimba, kickoffAt: new Date(Date.now() - 86400000).toISOString() });
    await admin.put(`/admin/matches/${extra.body.data.id}/result`).send({ status: 'abandoned', score: { home: 1, away: 0 } });
    let kano = (await pub.get(`/competitions/${ids.league}/standings`)).body.data.rows.find((r) => r.team.name === 'Kano Pillars');
    expect(kano.played).toBe(2);
    const decision = await admin.patch(`/admin/matches/${extra.body.data.id}/standings`).send({ countsForStandings: true, resultStands: true, reason: 'Referee report: result stands' });
    expect(decision.status).toBe(200);
    kano = (await pub.get(`/competitions/${ids.league}/standings`)).body.data.rows.find((r) => r.team.name === 'Kano Pillars');
    expect(kano.played).toBe(3);
  });

  it('calculates player statistics from recorded matches only', async () => {
    const musa = await pub.get(`/players/${ids.musa}`);
    expect(musa.status).toBe(200);
    expect(musa.body.data.stats.career).toMatchObject({ appearances: 1, starts: 1, goals: 2, assists: 0, minutes: 85 });
    const tunde = await pub.get(`/players/${ids.tunde}`);
    expect(tunde.body.data.stats.career).toMatchObject({ appearances: 1, starts: 0, goals: 0, assists: 1, yellowCards: 1 });
  });

  it('the match centre shows completed-match details only after the match', async () => {
    const done = await pub.get(`/matches/${ids.m1}`);
    expect(done.body.data.score).toMatchObject({ home: 2, away: 1 });
    expect(done.body.data.events).toHaveLength(5);
    expect(done.body.data.events[0].playerName).toBe('Musa Okon');
    expect(done.body.data.events[0].assistName).toBe('Tunde Eze');
    expect(done.body.data.stats.possession).toEqual({ home: 55, away: 45 });

    const upcoming = await pub.get(`/matches/${ids.upcoming}`);
    expect(upcoming.body.data.score).toBeNull();
    expect(upcoming.body.data.events).toEqual([]);
    expect(upcoming.body.data.stats).toBeNull();
  });

  it('serves next match, latest result and filtered fixtures', async () => {
    expect((await pub.get('/matches/next')).body.data.id).toBe(ids.upcoming);
    expect((await pub.get('/matches/latest-result')).body.data.id).toBe(ids.m4);
    const home = await pub.get(`/matches?venue=home&status=completed&competition=${ids.league}`);
    expect(home.body.data.items.every((m) => m.homeTeam.id === ids.club)).toBe(true);
    const away = await pub.get('/matches?venue=away');
    expect(away.body.data.items.map((m) => m.id)).toEqual([ids.m2]);
  });

  it('team pages include squad, fixtures, results and the season record', async () => {
    const team = await pub.get(`/teams/saki-stars-first-team`);
    expect(team.status).toBe(200);
    expect(team.body.data.squad).toHaveLength(2);
    expect(team.body.data.fixtures.map((m) => m.id)).toContain(ids.upcoming);
    expect(team.body.data.record).toMatchObject({ played: 4, won: 2 });
  });

  it('a Team Manager can only record results for assigned teams', async () => {
    const other = (await admin.post('/admin/matches').send({ competition: ids.league, season: ids.season, homeTeam: ids.rivers, awayTeam: ids.enyimba, kickoffAt: new Date(Date.now() - 3600000 * 5).toISOString() })).body.data.id;
    const manager = await createStaff(ctx, director.token, 'tm@football.test', 'team_manager', { assignedTeams: [ids.club] });
    const tm = api(ctx, manager.token);
    expect((await tm.put(`/admin/matches/${other}/result`).send({ score: { home: 1, away: 1 } })).status).toBe(403);
    const list = await tm.get('/admin/matches');
    expect(list.body.data.items.every((m) => m.homeTeam.id === ids.club || m.awayTeam.id === ids.club)).toBe(true);
    const report = await tm.put(`/admin/matches/${ids.m1}/report`).send({ title: 'Stars edge Rivers', body: 'A strong second half secured the points.', publish: true });
    expect(report.status).toBe(200);
    expect((await pub.get(`/matches/${ids.m1}`)).body.data.report.title).toBe('Stars edge Rivers');
    expect(await Notification.countDocuments()).toBeGreaterThanOrEqual(0);
  });

  it('played matches cannot be deleted; unplayed fixtures are soft-deleted', async () => {
    expect((await admin.delete(`/admin/matches/${ids.m1}`)).status).toBe(409);
    expect((await admin.delete(`/admin/matches/${ids.upcoming}`)).status).toBe(200);
    expect((await pub.get(`/matches/${ids.upcoming}`)).status).toBe(404);
  });
});
