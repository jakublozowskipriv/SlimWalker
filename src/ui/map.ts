// Mapa „jak stara rycina”: własny styl MapLibre zbudowany wyłącznie z naszych danych OSM
// (bez kafelków z zewnątrz → działa offline, zero kluczy API, pełna kontrola nad wyglądem).
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MlMap, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 ładuje worker jako moduł ES; podajemy Vite'owi jawny adres, żeby działało i w dev, i w buildzie
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
maplibregl.setWorkerUrl(workerUrl);
import type { CityData } from '../core/data.ts';
import type { LonLat } from '../core/geo.ts';
import { Fog } from './fog.ts';

type FC = GeoJSON.FeatureCollection;
const fc = (features: GeoJSON.Feature[]): FC => ({ type: 'FeatureCollection', features });

const C = {
  paper: '#2B2117',
  paperEdge: '#17120D',
  water: '#16110C',
  waterLine: '#8A6C46',
  street0: '#A07B50',
  street1: '#8A6A45',
  street2: '#76593A',
  path: '#5E4A32',
  district: '#4A3A28',
  amber: '#E3A440',
  copper: '#C9A06A',
};

function hatchImage(): ImageData {
  const s = 12;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d')!;
  x.strokeStyle = 'rgba(150,118,78,0.55)';
  x.lineWidth = 1;
  x.beginPath();
  for (let i = -s; i <= s; i += 6) {
    x.moveTo(i, s);
    x.lineTo(i + s, 0);
  }
  x.stroke();
  return x.getImageData(0, 0, s, s);
}

export function streetsGeoJSON(city: CityData, ids?: Iterable<number>): FC {
  const list = ids ? [...ids].map((i) => city.segs[i]) : city.segs;
  return fc(
    list.map((s) => ({
      type: 'Feature',
      id: s.id,
      properties: { c: s.cls, k: s.counted ? 1 : 0 },
      geometry: { type: 'LineString', coordinates: s.ll },
    })),
  );
}

function polygons(rings: LonLat[][], props: Record<string, unknown> = {}): GeoJSON.Feature {
  return { type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: rings } };
}

export function buildStyle(city: CityData): StyleSpecification {
  const districts = fc(
    city.districts.map((d, i) => ({
      type: 'Feature',
      properties: { i },
      geometry: { type: 'MultiLineString', coordinates: d.ll },
    })),
  );
  return {
    version: 8,
    sources: {
      city: { type: 'geojson', data: fc([polygons(city.city.ll)]) },
      water: { type: 'geojson', data: fc(city.water.map((r) => polygons([r]))) },
      river: { type: 'geojson', data: fc(city.river.map((r) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: r } }))) },
      parks: { type: 'geojson', data: fc(city.parks.map((p) => polygons(p.ll, { name: p.name }))) },
      districts: { type: 'geojson', data: districts },
      streets: { type: 'geojson', data: streetsGeoJSON(city), tolerance: 0.6 },
      discovered: { type: 'geojson', data: fc([]) },
      target: { type: 'geojson', data: fc([]) },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': C.paperEdge } },
      { id: 'city', type: 'fill', source: 'city', paint: { 'fill-color': C.paper } },
      { id: 'city-edge', type: 'line', source: 'city', paint: { 'line-color': C.copper, 'line-width': 1.2, 'line-opacity': 0.5, 'line-dasharray': [4, 2, 1, 2] } },
      { id: 'parks', type: 'fill', source: 'parks', paint: { 'fill-pattern': 'hatch', 'fill-opacity': 0.9 } },
      { id: 'parks-edge', type: 'line', source: 'parks', paint: { 'line-color': '#6A5136', 'line-width': 0.8, 'line-opacity': 0.7 } },
      { id: 'water', type: 'fill', source: 'water', paint: { 'fill-color': C.water } },
      { id: 'water-edge', type: 'line', source: 'water', paint: { 'line-color': C.waterLine, 'line-width': 0.9 } },
      // Warta podwójną linią: line-gap-width rysuje dwie równoległe kreski
      {
        id: 'river',
        type: 'line',
        source: 'river',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': C.waterLine,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 15, 1.4],
          'line-gap-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 13, 8, 16, 30],
        },
      },
      {
        id: 'districts',
        type: 'line',
        source: 'districts',
        paint: { 'line-color': C.district, 'line-width': 1, 'line-dasharray': [3, 3], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.9, 15, 0.4] },
      },
      {
        id: 'paths',
        type: 'line',
        source: 'streets',
        filter: ['==', ['get', 'c'], 3],
        minzoom: 13,
        paint: { 'line-color': C.path, 'line-width': 0.7, 'line-dasharray': [2, 1.5] },
      },
      {
        id: 'streets',
        type: 'line',
        source: 'streets',
        filter: ['<', ['get', 'c'], 3],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['match', ['get', 'c'], 0, C.street0, 1, C.street1, C.street2],
          'line-width': [
            'interpolate',
            ['exponential', 1.6],
            ['zoom'],
            11,
            ['match', ['get', 'c'], 0, 1.2, 1, 0.8, 0.4],
            16,
            ['match', ['get', 'c'], 0, 6, 1, 4.5, 3],
          ],
        },
      },
      // Odkryte ulice świecą bursztynem: szeroka rozmyta poświata + cienki rdzeń
      {
        id: 'disc-glow',
        type: 'line',
        source: 'discovered',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': C.amber,
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 4, 16, 16],
          'line-blur': ['interpolate', ['linear'], ['zoom'], 11, 3, 16, 10],
          'line-opacity': 0.35,
        },
      },
      {
        id: 'disc-core',
        type: 'line',
        source: 'discovered',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['case', ['==', ['get', 'c'], 3], C.copper, C.amber],
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 11, 0.8, 16, 3.2],
        },
      },
    ],
  };
}

export class CityMap {
  map: MlMap;
  fog!: Fog;
  ready: Promise<void>;
  private labels: maplibregl.Marker[] = [];

  constructor(
    el: HTMLElement,
    private city: CityData,
  ) {
    const lls = city.city.ll.flat();
    const lons = lls.map((p) => p[0]),
      lats = lls.map((p) => p[1]);
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ];
    this.map = new maplibregl.Map({
      container: el,
      style: buildStyle(city),
      center: [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2 + 0.005],
      zoom: 10.6,
      maxBounds: [
        [bounds[0][0] - 0.25, bounds[0][1] - 0.15],
        [bounds[1][0] + 0.25, bounds[1][1] + 0.15],
      ],
      minZoom: 9.5,
      maxZoom: 18,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: false,
      fadeDuration: 0,
    });
    this.map.touchZoomRotate.disableRotation();
    this.map.keyboard.disableRotation();
    this.map.on('styleimagemissing', () => {});
    this.ready = new Promise((res) => {
      this.map.on('load', () => {
        if (!this.map.hasImage('hatch')) this.map.addImage('hatch', hatchImage());
        this.fog = new Fog(this.map);
        this.addLabels();
        res();
      });
    });
    // obraz kreskowania musi istnieć zanim warstwa się wyrenderuje
    this.map.on('styledata', () => {
      if (!this.map.hasImage('hatch')) this.map.addImage('hatch', hatchImage());
    });
  }

  private addLabels() {
    // Większe osiedla mają pierwszeństwo, gdy podpisy na siebie nachodzą
    const order = this.city.districts
      .map((d, i) => ({ d, i, area: (d.bbox[2] - d.bbox[0]) * (d.bbox[3] - d.bbox[1]) }))
      .sort((a, b) => b.area - a.area);
    for (const { d } of order) {
      const el = document.createElement('div');
      el.className = 'district-label';
      el.textContent = d.name;
      this.labels.push(new maplibregl.Marker({ element: el }).setLngLat(d.center).addTo(this.map));
    }
    const sync = () => {
      const z = this.map.getZoom();
      const placed: [number, number, number, number][] = [];
      const H = this.map.getCanvas().clientHeight;
      const W = this.map.getCanvas().clientWidth;
      for (const m of this.labels) {
        const el = m.getElement();
        let show = z >= 11.5 && z < 15.8;
        if (show) {
          const p = this.map.project(m.getLngLat());
          const w = (el.textContent!.length * 7.4) / 2 + 6;
          const r: [number, number, number, number] = [p.x - w, p.y - 11, p.x + w, p.y + 11];
          show = p.y > 120 && p.y < H - 40 && r[0] > 4 && r[2] < W - 4 && !placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
          if (show) placed.push(r);
        }
        el.classList.toggle('hidden', !show);
      }
    };
    this.map.on('move', sync);
    sync();
  }

  setDiscovered(ids: Iterable<number>) {
    (this.map.getSource('discovered') as GeoJSONSource).setData(streetsGeoJSON(this.city, ids));
  }

  fitTrail(pieces: LonLat[][], duration = 900) {
    const pts = pieces.flat();
    if (!pts.length) return;
    const lons = pts.map((p) => p[0]),
      lats = pts.map((p) => p[1]);
    this.map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: { top: 150, bottom: 220, left: 40, right: 40 }, maxZoom: 16, duration },
    );
  }
}
