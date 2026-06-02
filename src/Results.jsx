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
      .select('judge_code, notes')
      .not('submitted_at', 'is', null)
      .then(({ data, error: dbErr }) => {
        if (dbErr || !data) { setLoading(false); return; }

        setJudgeCount(data.length);

        const totals = {};
        for (const row of data) {
          for (const [entryNum, entryNotes] of Object.entries(row.notes || {})) {
            if (!totals[entryNum]) totals[entryNum] = {};
            for (const cat of CATEGORIES) {
              const score = entryNotes?.[cat.key]?.score;
              if (score !== undefined && score !== '' && score !== null) {
                if (!totals[entryNum][cat.key]) totals[entryNum][cat.key] = [];
                totals[entryNum][cat.key].push(Number(score));
              }
            }
          }
        }

        const rows = Object.entries(totals).map(([entryNum, catScores]) => {
          const catAvgs = {};
          let totalAvg = 0;
          for (const cat of CATEGORIES) {
            const scores = catScores[cat.key] || [];
            const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
            catAvgs[cat.key] = Math.round(avg * 10) / 10;
            totalAvg += avg;
          }
          const perCatAvg = Math.round((totalAvg / CATEGORIES.length) * 10) / 10;
          return { entry: Number(entryNum), catAvgs, totalAvg: Math.round(totalAvg * 10) / 10, perCatAvg };
        });

        rows.sort((a, b) => b.totalAvg - a.totalAvg);
        rows.forEach((r, i) => r.rank = i + 1);

        setResults(rows);
        setLoading(false);
      });
  }, []);

  const maxTotal = CATEGORIES.length * MAX_SCORE;
  const medal = (rank) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;

  return (
    <div className="results-page">
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
              {CATEGORIES.map(cat => <th key={cat.key}>{cat.label}</th>)}
              <th>Total</th>
              <th>Avg / Cat</th>
            </tr>
          </thead>
          <tbody>
            {results.map(row => (
              <tr key={row.entry} className={row.rank <= 3 ? `top-${row.rank}` : ''}>
                <td className="rank-cell">{medal(row.rank)}</td>
                <td className="entry-cell">Entry #{row.entry}</td>
                {CATEGORIES.map(cat => (
                  <td key={cat.key} className="score-cell">{row.catAvgs[cat.key]}</td>
                ))}
                <td className="total-cell">{row.totalAvg} <span className="out-of">/ {maxTotal}</span></td>
                <td className="avg-cell">{row.perCatAvg} <span className="out-of">/ {MAX_SCORE}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && results.length > 0 && (
        <p className="results-footer muted">
          Generated {new Date().toLocaleString()} · {EVENT_CODE}
        </p>
      )}
    </div>
  );
}
