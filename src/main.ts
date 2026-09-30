import './style.css';
import { Game } from './game';
import { Overlay } from './ui/overlay';

const canvas = document.getElementById('game') as HTMLCanvasElement;
let game: Game;
const overlay = new Overlay({
  start: () => game.startRound(),
  menu: () => game.toMenu(),
});
game = new Game(canvas, (v) => overlay.update(v));

// canvas text uses the handwriting font too; start once it's ready (or after a beat)
Promise.race([document.fonts.load('20px "Patrick Hand"'), new Promise((r) => setTimeout(r, 1200))]).finally(() =>
  game.start()
);

// handy for poking at the physics from the dev console
if (import.meta.env.DEV) (window as unknown as { jelly: Game }).jelly = game;
