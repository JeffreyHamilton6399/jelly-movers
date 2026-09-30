export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  kind: 'droplet' | 'dust' | 'confetti' | 'spark';
  rot: number;
  vr: number;
}

const MAX_PARTICLES = 320;

export class Particles {
  list: Particle[] = [];

  private push(p: Particle): void {
    if (this.list.length >= MAX_PARTICLES) this.list.shift();
    this.list.push(p);
  }

  splat(x: number, y: number, color: string, strength: number): void {
    const count = Math.round(5 + strength * 8);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 260 * strength;
      this.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: -Math.abs(Math.sin(a)) * sp - 40,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7,
        size: 2.5 + Math.random() * 4,
        color,
        gravity: 1600,
        kind: 'droplet',
        rot: 0,
        vr: 0,
      });
    }
    for (let i = 0; i < 3; i++) {
      this.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y - 4,
        vx: (Math.random() - 0.5) * 60,
        vy: -20 - Math.random() * 40,
        life: 0.5 + Math.random() * 0.3,
        maxLife: 0.8,
        size: 8 + Math.random() * 10,
        color: 'rgba(120, 100, 80, 0.25)',
        gravity: -30,
        kind: 'dust',
        rot: 0,
        vr: 0,
      });
    }
  }

  chips(x: number, y: number, color: string, strength: number): void {
    const count = Math.round(4 + strength * 6);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 220 * strength;
      this.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: -Math.abs(Math.sin(a)) * sp - 60,
        life: 0.4 + Math.random() * 0.4,
        maxLife: 0.8,
        size: 2 + Math.random() * 3.5,
        color,
        gravity: 1800,
        kind: 'droplet',
        rot: 0,
        vr: 0,
      });
    }
  }

  confetti(x: number, y: number): void {
    const colors = ['#FF6B6B', '#2EC4B6', '#FFC53D', '#C79BF2', '#FFD98A'];
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const sp = 200 + Math.random() * 380;
      this.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.9 + Math.random() * 0.6,
        maxLife: 1.5,
        size: 4 + Math.random() * 4,
        color: colors[i % colors.length],
        gravity: 900,
        kind: 'confetti',
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 12,
      });
    }
  }

  spark(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      this.push({
        x,
        y,
        vx: Math.cos(a) * 120,
        vy: Math.sin(a) * 120,
        life: 0.25,
        maxLife: 0.25,
        size: 3,
        color: '#FFFFFF',
        gravity: 0,
        kind: 'spark',
        rot: 0,
        vr: 0,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.list) {
      const alpha = Math.min(1, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.kind === 'confetti') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else if (p.kind === 'dust') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - alpha * 0.6), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
