import { Languages, AudioLines, Sparkles, Square, Copy, X, ArrowUp, Settings2, ExternalLink, Check, Pause, Play, ChevronRight, Eye } from 'lucide';
const icons = { translate: Languages, speaker: AudioLines, ai: Sparkles, stop: Square, copy: Copy, close: X, send: ArrowUp, settings: Settings2, external: ExternalLink, check: Check, pause: Pause, play: Play, arrow: ChevronRight, eye: Eye };
export function icon(name) {
  const nodes = icons[name]; if (!nodes) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${nodes.map(([tag, attributes]) => `<${tag} ${Object.entries(attributes).filter(([key]) => key !== 'key').map(([key, value]) => `${key}="${value}"`).join(' ')} />`).join('')}</svg>`;
}
