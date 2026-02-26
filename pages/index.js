import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Image from 'next/image';

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const ACTIEVE_WEEK = 1;
const API_URL =
  'https://script.google.com/macros/s/AKfycbzSgAuQFaAdH8LkcH8X3gofYDrrbJowX3YwcmqVflhKv9ZDXuvXn6nH-87xhuylTGFG/exec';
const REFRESH_INTERVAL = 30_000; // ms

const TEAM_CONFIG = {
  'Never Skip Jef Day': {
    color: '#EF4C37',
    logo: '/logos/team1-neverskipjefday.png',
    subtitle: null,
  },
  'The Gladiators': {
    color: '#C9A000',
    logo: '/logos/team3-thegladiators.png',
    subtitle: 'led by Gluteus Maximus',
  },
  'Poor Decisions Club': {
    color: '#0CBABA',
    logo: '/logos/team2-poordecisionsclub.png',
    subtitle: 'Winning was never the plan',
  },
};

const CATEGORIES = [
  { key: 'deelname', label: 'Deelname', emoji: '🏋️' },
  { key: 'ranking', label: 'Ranking', emoji: '📊' },
  { key: 'bestDressed', label: 'Best Dressed', emoji: '✨' },
  { key: 'teamOutfit', label: 'Team Outfit', emoji: '👕' },
  { key: 'communitySpirit', label: 'Community Spirit', emoji: '🔥' },
];

// ─── DEMO DATA ────────────────────────────────────────────────────────────────
const DEMO_DATA = {
  scores: {
    'Never Skip Jef Day': {
      deelname: 14, ranking: 87, bestDressed: 2,
      teamOutfit: 0, communitySpirit: 5, totaal: 108, aantalDeelnemers: 14,
    },
    'The Gladiators': {
      deelname: 16, ranking: 92, bestDressed: 0,
      teamOutfit: 5, communitySpirit: 5, totaal: 118, aantalDeelnemers: 16,
    },
    'Poor Decisions Club': {
      deelname: 12, ranking: 73, bestDressed: 2,
      teamOutfit: 0, communitySpirit: 0, totaal: 87, aantalDeelnemers: 12,
    },
  },
  bijgewerkt: new Date().toISOString(),
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function formatTime(iso) {
  if (!iso) return '--:--';
  const d = new Date(iso);
  return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

function rankBadge(rank) {
  if (rank === 0) return { icon: '🏆', label: 'LEIDER', cls: 'badge-gold' };
  if (rank === 1) return { icon: '🥈', label: '2E PLEK', cls: 'badge-silver' };
  return { icon: '🥉', label: '3E PLEK', cls: 'badge-bronze' };
}

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
function Header({ bijgewerkt }) {
  return (
    <header className="header">
      <div className="header-left">
        <div className="diamond" />
        <div className="header-titles">
          <span className="header-main">CrossFit Leiden Open 2026</span>
          <span className="header-sub">Team Competitie Scoreboard</span>
        </div>
      </div>
      <div className="header-right">
        <span className="update-label">
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          BIJGEWERKT: {formatTime(bijgewerkt)}
        </span>
        <span className="week-pill">WEEK {ACTIEVE_WEEK}</span>
        <div className="live-wrapper">
          <span className="live-dot" />
          <span className="live-label">LIVE</span>
        </div>
      </div>
    </header>
  );
}

function CategoryBar({ value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="bar-track">
      <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function TeamCard({ team, score, rank, maxPerCategory, isLeader }) {
  const cfg = TEAM_CONFIG[team] || { color: '#EF4C37', logo: null, subtitle: null };
  const badge = rankBadge(rank);

  return (
    <div className={`team-card ${isLeader ? 'team-card--leader' : ''}`}>
      {/* Top color bar */}
      <div className="team-top-bar" style={{ background: cfg.color }} />

      <div className="team-card-content">
        <div className="team-header-row">
          {/* Logo */}
          <div className="team-logo-wrap" style={{ borderColor: cfg.color }}>
            {cfg.logo ? (
              <img src={cfg.logo} alt={team} className="team-logo" />
            ) : (
              <div className="team-logo-placeholder">
                <span style={{ color: cfg.color, fontSize: '3rem' }}>🏋️</span>
              </div>
            )}
          </div>

          {/* Rank badge */}
          <div className={`rank-badge ${badge.cls}`}>
            <span>{badge.icon}</span> {badge.label}
          </div>
        </div>

        {/* Team name & Subtitle */}
        <h2 className="team-name" style={{ color: cfg.color }}>{team}</h2>
        <p className="team-subtitle">{cfg.subtitle || ' '}</p> {/*   is a non-breaking space to keep height */}

        {/* Total score block */}
        <div className="score-block">
          <div className="score-labels">
            <span className="score-label-top">TOTAAL</span>
            <span className="score-label-bottom">PUNTEN</span>
          </div>
          <span className="score-number" style={{ color: cfg.color }}>
            {score.totaal}
          </span>
        </div>

        {/* Category breakdown */}
        <div className="categories">
          {CATEGORIES.map(cat => (
            <div key={cat.key} className="cat-row">
              <span className="cat-emoji">{cat.emoji}</span>
              <span className="cat-label">{cat.label}</span>
              <CategoryBar
                value={score[cat.key]}
                max={maxPerCategory[cat.key]}
                color={cfg.color}
              />
              <span className="cat-value" style={{ color: cfg.color }}>
                {score[cat.key]}
              </span>
            </div>
          ))}
        </div>

        {/* Participants */}
        <div className="participants-badge">
          👥 <span>{score.aantalDeelnemers}</span> DEELNEMERS
        </div>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-bar-track">
        <div className="loading-bar-fill" />
      </div>
      <div className="loading-title">CROSSFIT LEIDEN OPEN 2026</div>
      <div className="loading-sub">Scorebord laden…</div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function Scoreboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.warn('API niet bereikbaar, gebruik demo-data:', err.message);
      if (!data) setData(DEMO_DATA);
    } finally {
      setLoading(false);
      setLastFetch(new Date());
    }
  }, [data]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // Sort teams by total score (high → low)
  const sortedTeams = data
    ? Object.entries(data.scores).sort((a, b) => b[1].totaal - a[1].totaal)
    : [];

  // Max per category for relative bars
  const maxPerCategory = {};
  if (data) {
    CATEGORIES.forEach(cat => {
      maxPerCategory[cat.key] = Math.max(
        ...Object.values(data.scores).map(s => s[cat.key])
      );
    });
  }

  if (loading) return <LoadingScreen />;

  return (
    <>
      <Head>
        <title>CrossFit Leiden Open 2026 — Scoreboard</title>
        <meta name="viewport" content="width=1920" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:ital,wght@0,300;0,400;0,600;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="page">
        <Header bijgewerkt={data?.bijgewerkt} />

        <main className="teams-grid">
          {sortedTeams.map(([team, score], idx) => (
            <TeamCard
              key={team}
              team={team}
              score={score}
              rank={idx}
              maxPerCategory={maxPerCategory}
              isLeader={idx === 0}
            />
          ))}
        </main>

        <footer className="footer">
          <span className="footer-left">CrossFit Leiden — Community over competition</span>
          <span className="footer-right">
            Laatste update: {formatTime(data?.bijgewerkt)} &nbsp;·&nbsp; Refresh: elke {REFRESH_INTERVAL / 1000}s
          </span>
        </footer>
      </div>
    </>
  );
}
