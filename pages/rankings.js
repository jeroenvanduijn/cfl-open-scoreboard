import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const API_URL =
    'https://script.google.com/macros/s/AKfycbzSgAuQFaAdH8LkcH8X3gofYDrrbJowX3YwcmqVflhKv9ZDXuvXn6nH-87xhuylTGFG/exec';
const REFRESH_INTERVAL = 30_000;

const TEAM_COLORS = {
    'Never Skip Jeff Day': '#EF4C37',
    'Never Skip Jef Day': '#EF4C37',
    'The Gladiators': '#C9A000',
    'Poor Decisions Club': '#0CBABA',
};

const GROUPS = [
    { key: 'Foundations_Vrouw', label: 'Foundations', gender: 'Women', icon: '♀' },
    { key: 'Foundations_Man', label: 'Foundations', gender: 'Men', icon: '♂' },
    { key: 'Scaled_Vrouw', label: 'Scaled', gender: 'Women', icon: '♀' },
    { key: 'Scaled_Man', label: 'Scaled', gender: 'Men', icon: '♂' },
    { key: 'Rx_Vrouw', label: 'Rx', gender: 'Women', icon: '♀' },
    { key: 'Rx_Man', label: 'Rx', gender: 'Men', icon: '♂' },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function formatTime(iso) {
    if (!iso) return '--:--';
    const d = new Date(iso);
    return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

function getTeamColor(teamName) {
    return TEAM_COLORS[teamName] || '#888';
}

function rankIcon(rank) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '';
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function Rankings() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeGroup, setActiveGroup] = useState('Foundations_Vrouw');

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch(API_URL);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const json = await res.json();
            setData(json);
        } catch (err) {
            console.warn('API niet bereikbaar:', err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, REFRESH_INTERVAL);
        return () => clearInterval(interval);
    }, []);

    // Derive week key and rankings
    const actieveWeek = data?.actieveWeek || null;
    const weekRankings = data?.rankings?.[actieveWeek] || {};
    const athletes = weekRankings[activeGroup] || [];
    const currentGroupInfo = GROUPS.find(g => g.key === activeGroup);

    // Separate finishers from non-finishers
    const finishers = athletes.filter(a => a.scoreType === 'tijd');
    const nonFinishers = athletes.filter(a => a.scoreType !== 'tijd');

    return (
        <>
            <Head>
                <title>Rankings — CrossFit Leiden Open 2026</title>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:ital,wght@0,300;0,400;0,600;0,700;1,400&display=swap"
                    rel="stylesheet"
                />
            </Head>

            <div className="r-page">
                {/* ── HEADER ── */}
                <header className="r-header">
                    <div className="r-header-left">
                        <Link href="/" className="r-back-btn">
                            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"></path></svg>
                            SCOREBOARD
                        </Link>
                        <div className="r-header-titles">
                            <span className="r-header-main">
                                {currentGroupInfo?.label} — {currentGroupInfo?.gender}
                            </span>
                            <span className="r-header-sub">
                                {actieveWeek || '—'} · Individual Rankings
                            </span>
                        </div>
                    </div>
                    <div className="r-header-right">
                        <span className="r-update-label">
                            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            {formatTime(data?.bijgewerkt)}
                        </span>
                        <div className="r-live-wrapper">
                            <span className="r-live-dot" />
                            <span className="r-live-label">LIVE</span>
                        </div>
                    </div>
                </header>

                {/* ── TAB NAVIGATION ── */}
                <nav className="r-tabs">
                    {GROUPS.map(g => (
                        <button
                            key={g.key}
                            className={`r-tab ${activeGroup === g.key ? 'r-tab--active' : ''}`}
                            onClick={() => setActiveGroup(g.key)}
                        >
                            <span className="r-tab-division">{g.label}</span>
                            <span className="r-tab-gender">{g.icon} {g.gender}</span>
                        </button>
                    ))}
                </nav>

                {/* ── CONTENT ── */}
                <main className="r-content">
                    {loading ? (
                        <div className="r-loading">
                            <div className="r-loading-bar-track"><div className="r-loading-bar-fill" /></div>
                            <p>Rankings laden…</p>
                        </div>
                    ) : athletes.length === 0 ? (
                        <div className="r-empty">
                            <span className="r-empty-icon">📋</span>
                            <p className="r-empty-title">Nog geen scores ingevoerd</p>
                            <p className="r-empty-sub">{currentGroupInfo?.label} — {currentGroupInfo?.gender}</p>
                        </div>
                    ) : (
                        <>
                            <div className="r-table-meta">
                                <span className="r-athlete-count">👥 {athletes.length} atleten</span>
                            </div>

                            <div className="r-table-wrap">
                                <table className="r-table">
                                    <thead>
                                        <tr>
                                            <th className="r-th r-th-rank">#</th>
                                            <th className="r-th r-th-name">Atleet</th>
                                            <th className="r-th r-th-team">Team</th>
                                            <th className="r-th r-th-score">Score</th>
                                            <th className="r-th r-th-points">Punten</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* Finishers */}
                                        {finishers.map((a, i) => (
                                            <RankingRow key={`f-${i}`} athlete={a} />
                                        ))}

                                        {/* Divider */}
                                        {finishers.length > 0 && nonFinishers.length > 0 && (
                                            <tr className="r-divider-row">
                                                <td colSpan="5">
                                                    <div className="r-divider">
                                                        <span className="r-divider-line" />
                                                        <span className="r-divider-label">TIME CAP</span>
                                                        <span className="r-divider-line" />
                                                    </div>
                                                </td>
                                            </tr>
                                        )}

                                        {/* Non-finishers */}
                                        {nonFinishers.map((a, i) => (
                                            <RankingRow key={`nf-${i}`} athlete={a} />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </main>

                {/* ── FOOTER ── */}
                <footer className="r-footer">
                    <span>CrossFit Leiden — Community over competition</span>
                    <span>Auto-refresh: elke {REFRESH_INTERVAL / 1000}s</span>
                </footer>
            </div>
        </>
    );
}

function RankingRow({ athlete }) {
    const teamColor = getTeamColor(athlete.team);
    const isTop3 = athlete.rang <= 3;
    const icon = rankIcon(athlete.rang);
    const isTijd = athlete.scoreType === 'tijd';

    return (
        <tr
            className={`r-row ${isTop3 ? 'r-row--top3' : ''}`}
            style={{ '--team-color': teamColor }}
        >
            <td className="r-td r-td-rank">
                <span className={`r-rank ${isTop3 ? 'r-rank--medal' : ''}`}>
                    {icon ? <span className="r-rank-icon">{icon}</span> : null}
                    <span className="r-rank-num">{athlete.rang}</span>
                </span>
            </td>
            <td className="r-td r-td-name">
                <span className="r-athlete-name">{athlete.naam}</span>
            </td>
            <td className="r-td r-td-team">
                <span className="r-team-pill" style={{ background: teamColor, color: '#fff' }}>
                    {athlete.team}
                </span>
            </td>
            <td className="r-td r-td-score">
                <span className="r-score-badge" data-type={athlete.scoreType}>
                    {isTijd ? '⏱' : '💪'}{' '}
                    {isTijd ? athlete.score : `${athlete.score} reps`}
                </span>
            </td>
            <td className="r-td r-td-points">
                <span className="r-points">+{athlete.punten}</span>
                <span className="r-points-label">pts</span>
            </td>
        </tr>
    );
}
