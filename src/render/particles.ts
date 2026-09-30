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
    for (let i = 0; i < 2; i++) {
      this.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y - 4,
        vx: (Math.random() - 0.5) * 60,
        vy: -20 - Math.random() * 40,
        life: 0.5 + Math.random() * 0.3,
        maxLife: 0.8,
        size: 8 + Math.random() * 10,
        color: '#3B3229',
        gravity: -30,
        kind: 'dust',
        rot: 0,
        vr: 0,
      });
    }
  }

  /** little puff under a jump */
  dust(x: number, y: number): void {
    for (let i = 0; i < 4; i++) {
      this.push({
        x: x + (Math.random() - 0.5) * 30,
        y: y - 3,
        vx: (Math.random() - 0.5) * 90,
        vy: -10 - Math.random() * 30,
        life: 0.35 + Math.random() * 0.2,
        maxLife: 0.55,
        size: 5 + Math.random() * 5,
        color: '#3B3229',
        gravity: -20,
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
    const colors = ['#E8735A', '#7FB069', '#F2C14E', '#9B7BC7', '#6F9FB0'];
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
        color: '#3B3229',
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
      if (p.kind === 'confetti') {
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else if (p.kind === 'dust') {
        // little pencil puffs
        ctx.globalAlpha = alpha * 0.45;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.4 - alpha * 0.5), 0.3, Math.PI * 1.7);
        ctx.stroke();
      } else if (p.kind === 'spark') {
        // quick ink dashes flying out
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        ctx.stroke();
      } else {
        const r = p.size * (0.4 + alpha * 0.6);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha * 0.8;
        ctx.strokeStyle = '#3B3229';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}
