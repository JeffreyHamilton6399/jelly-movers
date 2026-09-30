import { PLAYERS } from '../types';
import type { GameView } from '../game';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function blobIcon(color: string): string {
  return `<svg viewBox="0 0 40 34"><path d="M4 22 C3 10 12 3 21 3 C31 3 37 11 36 21 C35 30 28 32 20 32 C11 32 5 30 4 22 Z" fill="${color}" stroke="#3B3229" stroke-width="2.5"/><circle cx="15" cy="16" r="2.4" fill="#3B3229"/><circle cx="25" cy="16" r="2.4" fill="#3B3229"/><path d="M17 22 Q20 25 23 22" fill="none" stroke="#3B3229" stroke-width="2" stroke-linecap="round"/></svg>`;
}

const JOIN_HINT = ['press A / D / Space / E', 'press ← / → / Shift', 'press any pad button', 'press any pad button'];

/** DOM menus + HUD. Pure view: reads GameView, sends button clicks back. */
export class Overlay {
  private slots: HTMLElement[] = [];
  private lastPhase = '';
  private lastJoined = '';

  constructor(actions: { start: () => void; menu: () => void }) {
    const wrap = $('slots');
    PLAYERS.forEach((p, i) => {
      const el = document.createElement('div');
      el.className = 'slot';
      el.innerHTML = `${blobIcon(p.color)}<div>${p.name}<small>${JOIN_HINT[i]}</small></div>`;
      wrap.appendChild(el);
      this.slots.push(el);
    });
    const click = (id: string, fn: () => void) =>
      $(id).addEventListener('click', (e) => {
        fn();
        (e.currentTarget as HTMLElement).blur();
      });
    click('start', actions.start);
    click('again', actions.start);
    click('menu-btn', actions.menu);
  }

  update(v: GameView): void {
    if (v.phase !== this.lastPhase) {
      this.lastPhase = v.phase;
      $('menu').hidden = v.phase !== 'menu';
      $('hud').hidden = v.phase !== 'playing';
      $('hint').hidden = v.phase !== 'playing';
      $('end').hidden = v.phase !== 'ended';
      if (v.phase === 'ended' && v.result) this.fillEnd(v);
    }

    const joinedKey = v.joined.join();
    if (joinedKey !== this.lastJoined) {
      this.lastJoined = joinedKey;
      v.joined.forEach((on, i) => {
        this.slots[i].classList.toggle('on', on);
        this.slots[i].querySelector('small')!.textContent = on ? 'ready!' : JOIN_HINT[i];
      });
      ($('start') as HTMLButtonElement).disabled = !v.joined.some(Boolean);
    }

    if (v.phase === 'playing') {
      const m = Math.floor(v.timeLeft / 60);
      const s = String(v.timeLeft % 60).padStart(2, '0');
      const t = $('hud-time');
      t.textContent = `${m}:${s}`;
      t.classList.toggle('low', v.timeLeft <= 30);
      $('hud-items').textContent = `${v.delivered} / ${v.total} in the truck`;
      $('hud-pay').textContent = `$${v.pay}`;
    }
  }

  private fillEnd(v: GameView): void {
    const r = v.result!;
    $('end-title').textContent = r.win ? 'Job done!' : "Time's up!";
    $('end-sub').textContent = r.win
      ? 'everything wobbled safely into the truck'
      : 'anything left behind pays nothing';
    $('end-items').innerHTML = r.items
      .map(
        (i) =>
          `<tr><td>${i.delivered ? '✔' : '✘'} ${i.label}</td>` +
          `<td><span class="meter"><i style="width:${i.damage}%"></i></span></td>` +
          `<td>${i.damage}%</td><td>$${i.pay}</td></tr>`
      )
      .join('');
    $('end-delivered').textContent = `${r.delivered} / ${r.items.length}`;
    $('end-damage').textContent = `${r.totalDamage}%`;
    $('end-base').textContent = `$${r.basePay}`;
    $('end-bonus').textContent = `+ $${r.timeBonus}`;
    $('end-pay').textContent = `$${r.totalPay}`;
  }
}
