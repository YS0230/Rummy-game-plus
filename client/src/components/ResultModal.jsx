import React from 'react';
import { useStore } from '../store.js';

export default function ResultModal() {
  const { results } = useStore();
  if (!results) return null;

  const close = () =>
    useStore.setState({ results: null, game: null, hand: [] });

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>🏆 遊戲結束</h2>
        <table className="result-table">
          <thead>
            <tr>
              <th>玩家</th>
              <th>剩餘磚</th>
              <th>罰分</th>
              <th>得分</th>
            </tr>
          </thead>
          <tbody>
            {[...results]
              .sort((a, b) => b.score - a.score)
              .map((r) => (
                <React.Fragment key={r.playerId}>
                  <tr className={r.isWinner ? 'winner' : ''}>
                    <td>
                      {r.isWinner && '👑 '}
                      {r.name}
                    </td>
                    <td>{r.remaining}</td>
                    <td>{r.penalty}</td>
                    <td>{r.score > 0 ? `+${r.score}` : r.score}</td>
                  </tr>
                  {r.tiles?.length > 0 && (
                    <tr className={r.isWinner ? 'winner' : ''}>
                      <td colSpan={4} className="result-tiles-cell">
                        <div className="result-tiles">
                          {r.tiles.map((t) => (
                            <div
                              key={t.id}
                              className={`tile result-tile tile-${t.isJoker ? 'joker' : t.color}`}
                            >
                              <span className="tile-num">
                                {t.isJoker ? '☺' : t.num}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
          </tbody>
        </table>
        <button className="primary" onClick={close}>
          回到房間(可再來一局)
        </button>
      </div>
    </div>
  );
}
