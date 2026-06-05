import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { EVENT_CODE, EVENT_NAME, CATEGORIES } from './config';

const MAX_SCORE = 100;
const TABLE = 'melt_submissions';

export default function Results() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [judgeCount, setJudgeCount] = useState(0);

  useEffect(() => {
    supabase
      .from(TABLE)
      .select('judge_code, judge_name, notes')
      .not('submitted_at', 'is', null)
      .then(({ data, error: dbErr }) => {
        if (dbErr || !data) { setLoading(false); return; }

        setJudgeCount(data.length);

        const judgeNames = {};
        for (const row of data) {
          if (row.judge_name) judgeNames[row.judge_code] = row.judge_name;
        }

        const totals = {};
        for (const row of data) {
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
            if (judgeScored > 0) totals[entryNum].judgeTotals.push({ name: judgeNames[row.judge_code] || `Judge ${row.judge_code}`, total: judgeTotal });
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
          return { entry: Number(entryNum), catAvgs, totalAvg: Math.round(totalAvg * 10) / 10, perCatAvg, rangeMin, rangeMax, topJudges };
        });

        rows.sort((a, b) => b.totalAvg - a.totalAvg);
        rows.forEach((r, i) => r.rank = i + 1);

        for (const cat of CATEGORIES) {
          const sorted = [...rows].sort((a, b) => b.catAvgs[cat.key] - a.catAvgs[cat.key]);
          sorted.forEach((r, i) => { r[`catRank_${cat.key}`] = i + 1; });
        }

        setResults(rows);
        setLoading(false);
      });
  }, []);

  const maxTotal = CATEGORIES.length * MAX_SCORE;
  const medal = (rank) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;

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
            : <p className="muted">{results.length} entries · {judgeCount} judges · {CATEGORIES.length} categories · scored out of {MAX_SCORE} each</p>
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
                <td className="entry-cell">Entry #{row.entry}</td>
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
                <span className="breakdown-entry">Entry #{row.entry}</span>
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

      {!loading && results.length > 0 && (
        <p className="results-footer muted">
          Generated {new Date().toLocaleString()} · {EVENT_CODE}
        </p>
      )}
    </div>
  );
}
