// Wykrywanie znalezionych skarbów na podstawie śladów spacerów.
import { dist, toXY, type LonLat } from './geo.ts';
import { FIND_RADIUS_M, type Treasure } from '../data/treasures.ts';

/** Zwraca id skarbów, które leżą w promieniu FIND_RADIUS_M od któregoś punktu śladu. */
export function findTreasures(trails: LonLat[][], treasures: Treasure[], already: Set<string> = new Set()): string[] {
  const todo = treasures.filter((t) => !already.has(t.id)).map((t) => ({ t, xy: toXY(t.ll[0], t.ll[1]) }));
  const found: string[] = [];
  for (const piece of trails) {
    for (let i = 0; i < piece.length && todo.length; i++) {
      const p = toXY(piece[i][0], piece[i][1]);
      // sprawdzamy też środek odcinka, bo uproszczony ślad ma punkty co kilkadziesiąt metrów
      const q = i + 1 < piece.length ? toXY(piece[i + 1][0], piece[i + 1][1]) : p;
      const mid: [number, number] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      for (let k = todo.length - 1; k >= 0; k--) {
        if (dist(p, todo[k].xy) <= FIND_RADIUS_M || dist(mid, todo[k].xy) <= FIND_RADIUS_M) {
          found.push(todo[k].t.id);
          todo.splice(k, 1);
        }
      }
    }
  }
  return found;
}
