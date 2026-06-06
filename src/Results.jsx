import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { EVENT_CODE, EVENT_NAME, CATEGORIES } from './config';

const MAX_SCORE = 100;
const TABLE = 'melt_submissions';

export default function Results() {
  const [results, setResults] = useState([]);
  const [judgeStats, setJudgeStats] = useState([]);
  const [outliers, setOutliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [judgeCount, setJudgeCount] = useState(0);
  const [pointsResults, setPointsResults] = useState([]);
  const [entryNames, setEntryNames] = useState({});

  const entryLabel = (num) => {
    const e = entryNames[num];
    if (!e) return `Entry #${num}`;
    return e.strain ? `${e.maker} — ${e.strain}` : e.maker;
  };

  useEffect(() => {
    supabase.from('melt_entries').select('entry_number, maker, strain').then(({ data }) => {
      if (data) {
        const map = {};
        data.forEach(e => { map[e.entry_number] = { maker: e.maker, strain: e.strain }; });
        setEntryNames(map);
      }
    });
  }, []);

  useEffect(() => {
    supabase
      .from(TABLE)
      .select('judge_code, judge_name, notes, ranking')
      .not('submitted_at', 'is', null)
      .then(({ data, error: dbErr }) => {
        if (dbErr || !data) { setLoading(false); return; }

        setJudgeCount(data.length);

        const judgeNames = {};
        for (const row of data) {
          if (row.judge_name) judgeNames[row.judge_code] = row.judge_name;
        }

        const totals = {};
        const judgeMap = {};

        for (const row of data) {
          const jName = judgeNames[row.judge_code] || `Judge ${row.judge_code}`;
          if (!judgeMap[row.judge_code]) judgeMap[row.judge_code] = { name: jName, entryTotals: [] };

          for (const [entryNum, entryNotes] of Object.entries(row.notes || {})) {
            if (!totals[entryNum]) totals[entryNum] = { catScores: {}, judgeTotals: [] };
            let judgeTotal = 0;
            let judgeScored = 0;
            for (const cat of CATEGORIES) {
              const score = entryNotes?.[cat.key]?.score;
              if (score !== undefined && score !== '' && score !== null) {
                if (!totals[entryNum].catScores[cat.key]) totals[entryNum].catScores[cat.key] = [];
                totals[entryNum].catScores[cat.key].push(Number(score));
                judgeTotal += Number(score);
                judgeScored++;
              }
            }
            if (judgeScored > 0) {
              totals[entryNum].judgeTotals.push({ name: jName, total: judgeTotal });
              judgeMap[row.judge_code].entryTotals.push({ entry: Number(entryNum), total: judgeTotal });
            }
          }
        }

        const rows = Object.entries(totals).map(([entryNum, { catScores, judgeTotals }]) => {
          const catAvgs = {};
          let totalAvg = 0;
          for (const cat of CATEGORIES) {
            const scores = catScores[cat.key] || [];
            const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
            catAvgs[cat.key] = Math.round(avg * 10) / 10;
            totalAvg += avg;
          }
          const perCatAvg = Math.round((totalAvg / CATEGORIES.length) * 10) / 10;
          const sorted = [...judgeTotals].sort((a, b) => b.total - a.total);
          const rangeMin = sorted.length ? sorted[sorted.length - 1].total : 0;
          const rangeMax = sorted.length ? sorted[0].total : 0;
          const topJudges = sorted.slice(0, 2);
          const highJudge = sorted[0] || null;
          const lowJudge = sorted.length > 1 ? sorted[sorted.length - 1] : null;
          return { entry: Number(entryNum), catAvgs, totalAvg: Math.round(totalAvg * 10) / 10, perCatAvg, rangeMin, rangeMax, topJudges, highJudge, lowJudge };
        });

        rows.sort((a, b) => b.totalAvg - a.totalAvg);
        rows.forEach((r, i) => r.rank = i + 1);

        for (const cat of CATEGORIES) {
          const sorted = [...rows].sort((a, b) => b.catAvgs[cat.key] - a.catAvgs[cat.key]);
          sorted.forEach((r, i) => { r[`catRank_${cat.key}`] = i + 1; });
        }

        const fieldAvg = rows.length ? rows.reduce((s, r) => s + r.totalAvg, 0) / rows.length : 0;

        const stats = Object.values(judgeMap).map(({ name, entryTotals }) => {
          const avg = entryTotals.length ? entryTotals.reduce((s, e) => s + e.total, 0) / entryTotals.length : 0;
          const sorted = [...entryTotals].sort((a, b) => b.total - a.total);
          return {
            name,
            entryCount: entryTotals.length,
            avgTotal: Math.round(avg * 10) / 10,
            delta: Math.round((avg - fieldAvg) * 10) / 10,
            highEntry: sorted[0] || null,
            lowEntry: sorted[sorted.length - 1] || null,
          };
        });
        stats.sort((a, b) => b.avgTotal - a.avgTotal);

        const outliersRows = [...rows]
          .filter(r => r.rangeMax - r.rangeMin > 0)
          .sort((a, b) => (b.rangeMax - b.rangeMin) - (a.rangeMax - a.rangeMin))
          .slice(0, 10);

        // Ranking-points model: 1st = 1 pt, 2nd = 2 pts … lowest wins
        const pointsMap = {};
        for (const row of data) {
          const ranking = row.ranking || [];
          ranking.forEach((entryNum, idx) => {
            const key = String(entryNum);
            if (!pointsMap[key]) pointsMap[key] = { entry: Number(entryNum), totalPoints: 0, judgeCount: 0 };
            pointsMap[key].totalPoints += idx + 1;
            pointsMap[key].judgeCount += 1;
          });
        }
        const pointsRows = Object.values(pointsMap)
          .sort((a, b) => a.totalPoints - b.totalPoints);
        pointsRows.forEach((r, i) => r.pointsRank = i + 1);

        setResults(rows);
        setJudgeStats(stats);
        setOutliers(outliersRows);
        setPointsResults(pointsRows);
        setLoading(false);
      });
  }, []);

  const maxTotal = CATEGORIES.length * MAX_SCORE;
  const ordinal = (n) => { const s = ['th','st','nd','rd']; const v = n % 100; return n + (s[(v-20)%10] || s[v] || s[0]); };
  const medal = (rank) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : ordinal(rank);

  return (
    <div className="results-page">
      <div className="top-header">
        <img src="/mothership.jpeg" alt="Mothership Meltdown" className="top-header-image" />
      </div>
      <div className="results-header">
        <h1>{EVENT_NAME}</h1>
        <h2>Final Results</h2>
        {loading
          ? <p className="muted">Loading…</p>
          : results.length === 0
            ? <p className="muted">No submitted scores yet.</p>
            : <p className="muted">{results.length} entries · {CATEGORIES.length} categories · scored out of {MAX_SCORE} each</p>
        }
        {!loading && results.length > 0 && (
          <button className="btn-print" onClick={() => window.print()}>🖨 Print / Save as PDF</button>
        )}
      </div>

      {!loading && results.length > 0 && (
        <table className="results-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Entry</th>
              <th>Avg Score</th>
              <th>Score Range</th>
            </tr>
          </thead>
          <tbody>
            {results.map(row => (
              <tr key={row.entry} className={row.rank <= 3 ? `top-${row.rank}` : ''}>
                <td className="rank-cell">{medal(row.rank)}</td>
                <td className="entry-cell">{entryLabel(row.entry)}</td>
                <td className="avg-cell">{row.perCatAvg} <span className="out-of">/ {MAX_SCORE}</span></td>
                <td className="range-cell">{row.rangeMin}–{row.rangeMax}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && results.length > 0 && (
        <div className="entry-breakdown">
          <h2 className="breakdown-title">Entry Breakdowns</h2>
          {results.map(row => (
            <div key={row.entry} className={`breakdown-card ${row.rank <= 3 ? `top-${row.rank}` : ''}`}>
              <div className="breakdown-header">
                <span className="breakdown-rank">{medal(row.rank)}</span>
                <span className="breakdown-entry">{entryLabel(row.entry)}</span>
                <span className="breakdown-overall">Overall avg: <strong>{row.perCatAvg}</strong> / {MAX_SCORE}</span>
                <span className="breakdown-range">Range: <strong>{row.rangeMin}–{row.rangeMax}</strong></span>
                {row.topJudges[0] && (
                  <span className="breakdown-top-judges">
                    🥇 {row.topJudges[0].name} <span className="out-of">({row.topJudges[0].total})</span>
                    {row.topJudges[1] && <> · 🥈 {row.topJudges[1].name} <span className="out-of">({row.topJudges[1].total})</span></>}
                  </span>
                )}
              </div>
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Cat. Rank</th>
                    <th className="score-cell">Avg Score</th>
                  </tr>
                </thead>
                <tbody>
                  {CATEGORIES.map(cat => (
                    <tr key={cat.key}>
                      <td>{cat.label}</td>
                      <td className="rank-cell">{medal(row[`catRank_${cat.key}`])}</td>
                      <td className="score-cell">{row.catAvgs[cat.key]} <span className="out-of">/ {MAX_SCORE}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {!loading && judgeStats.length > 0 && (
        <div className="analysis-section">
          <h2 className="breakdown-title">Judge Analysis</h2>
          <p className="muted analysis-subtitle">Average total score per entry · delta vs. field average ({Math.round(judgeStats.reduce((s,j)=>s+j.avgTotal,0)/judgeStats.length*10)/10})</p>
          <table className="results-table judge-analysis-table">
            <thead>
              <tr>
                <th>Judge</th>
                <th>Entries</th>
                <th>Avg Total</th>
                <th>vs. Field</th>
                <th>Highest Entry</th>
                <th>Lowest Entry</th>
              </tr>
            </thead>
            <tbody>
              {judgeStats.map(j => (
                <tr key={j.name}>
                  <td className="entry-cell">{j.name}</td>
                  <td className="rank-cell">{j.entryCount}</td>
                  <td className="avg-cell">{j.avgTotal}</td>
                  <td className={`delta-cell ${j.delta > 0 ? 'delta-high' : j.delta < 0 ? 'delta-low' : ''}`}>
                    {j.delta > 0 ? `+${j.delta}` : j.delta}
                  </td>
                  <td className="range-cell">{j.highEntry ? `${entryLabel(j.highEntry.entry)} (${j.highEntry.total})` : '—'}</td>
                  <td className="range-cell">{j.lowEntry ? `${entryLabel(j.lowEntry.entry)} (${j.lowEntry.total})` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && outliers.length > 0 && (
        <div className="analysis-section">
          <h2 className="breakdown-title">Most Contested Entries</h2>
          <p className="muted analysis-subtitle">Entries where judges disagreed most · ranked by score spread</p>
          <table className="results-table outlier-table">
            <thead>
              <tr>
                <th>Entry</th>
                <th>Overall Rank</th>
                <th>Spread</th>
                <th>High Judge</th>
                <th>Low Judge</th>
              </tr>
            </thead>
            <tbody>
              {outliers.map(row => (
                <tr key={row.entry}>
                  <td className="entry-cell">{entryLabel(row.entry)}</td>
                  <td className="rank-cell">{medal(row.rank)}</td>
                  <td className="avg-cell">{row.rangeMax - row.rangeMin} pts</td>
                  <td className="delta-cell delta-high">{row.highJudge ? `${row.highJudge.name} (${row.highJudge.total})` : '—'}</td>
                  <td className="delta-cell delta-low">{row.lowJudge ? `${row.lowJudge.name} (${row.lowJudge.total})` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && pointsResults.length > 0 && (
        <div className="analysis-section">
          <h2 className="breakdown-title">Ranking Points Model</h2>
          <p className="muted analysis-subtitle">1st place = 1 pt · 21st place = 21 pts · lowest score wins</p>
          <table className="results-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Entry</th>
                <th>Total Points</th>
              </tr>
            </thead>
            <tbody>
              {pointsResults.map(row => (
                <tr key={row.entry} className={row.pointsRank <= 3 ? `top-${row.pointsRank}` : ''}>
                  <td className="rank-cell">{medal(row.pointsRank)}</td>
                  <td className="entry-cell">{entryLabel(row.entry)}</td>
                  <td className="avg-cell">{row.totalPoints} <span className="out-of">pts</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && results.length > 0 && (
        <p className="results-footer muted">
          Generated {new Date().toLocaleString()} · {EVENT_CODE}
        </p>
      )}
    </div>
  );
}
