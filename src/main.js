import Game from './Game.js';

const game = new Game();
window.__cubeMazeGame = game;

// 开始按钮
document.getElementById('btn-start').addEventListener('click', () => {
  game.openCalibration();
});

// 重新开始按钮
document.getElementById('btn-restart').addEventListener('click', () => {
  game.restart();
});

document.getElementById('btn-restart-ingame').addEventListener('click', () => {
  game.restartFromLevelOne();
});

// 窗口大小变化时重新适配 Canvas
window.addEventListener('resize', () => {
  if (game.renderer) {
    game.renderer.resize();
  }
});

// 防止手机端拖拽滚动
document.addEventListener('touchmove', (e) => {
  e.preventDefault();
}, { passive: false });

// 初始化
game.start();
