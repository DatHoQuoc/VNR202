import './style.css';
import { content } from './content';
import { Engine } from './engine/Engine';
import { parseQuery } from './engine/nav';
import { createStation } from './stations';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function showFallback(): void {
  const box = document.getElementById('fallback')!;
  const h = document.createElement('h1');
  h.textContent = content.ui.noWebgl.title;
  const p = document.createElement('p');
  p.textContent = content.ui.noWebgl.hint;
  box.append(h, p);
  box.hidden = false;
  document.body.dataset.ready = 'nowebgl';
}

const ids = content.stations.map((s) => s.id);
const counts = content.stations.map((s) => s.beats.length);

if (!webglAvailable()) {
  showFallback();
} else {
  const query = parseQuery(window.location.search, ids, counts);
  const engine = new Engine(
    document.getElementById('gl') as HTMLCanvasElement,
    document.getElementById('frame')!,
    document.getElementById('fade')!,
    content,
    query,
    createStation,
  );
  engine.start().catch((e) => {
    console.error(e);
    showFallback();
  });
}
