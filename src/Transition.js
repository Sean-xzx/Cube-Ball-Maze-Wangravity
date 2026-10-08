import { LEVELS } from './LevelData.js';

const FACE_ROTATIONS = [
  { x: 0, y: 0 },       // front
  { x: 0, y: 90 },      // right
  { x: 0, y: 180 },     // back
  { x: 0, y: -90 },     // left
  { x: 90, y: 0 },      // top
  { x: -90, y: 0 },     // bottom
];

export default class Transition {
  constructor() {
    this.container = document.getElementById('cube-container');
    this.cube = document.getElementById('cube');
    this.screen = document.getElementById('transition-screen');
    this.faces = [
      document.getElementById('cube-front'),
      document.getElementById('cube-right'),
      document.getElementById('cube-back'),
      document.getElementById('cube-left'),
      document.getElementById('cube-top'),
      document.getElementById('cube-bottom'),
    ];

    this.faces.forEach((face) => {
      face.style.display = 'flex';
      face.style.alignItems = 'center';
      face.style.justifyContent = 'center';
      face.style.flexDirection = 'column';
      face.style.gap = '0.5rem';
    });

    this.faces.forEach((_, index) => this._paintFace(index));
  }

  show() {
    this.screen.classList.add('active');
  }

  hide() {
    this.screen.classList.remove('active');
  }

  play(currentFace, nextFace) {
    return new Promise((resolve) => {
      this._updateFaceVisuals(currentFace, nextFace);

      const from = FACE_ROTATIONS[currentFace];
      this.cube.style.transition = 'none';
      this.cube.style.transform = `rotateX(${-from.x}deg) rotateY(${-from.y}deg)`;

      this.cube.offsetHeight;

      const to = FACE_ROTATIONS[nextFace];
      this.cube.style.transition = 'transform 0.9s cubic-bezier(0.4, 0, 0.2, 1)';
      this.cube.style.transform = `rotateX(${-to.x}deg) rotateY(${-to.y}deg)`;

      setTimeout(resolve, 950);
    });
  }

  _updateFaceVisuals(currentFace, nextFace) {
    [currentFace, nextFace].forEach((faceIndex) => this._paintFace(faceIndex));
  }

  _paintFace(faceIndex) {
    const level = LEVELS[faceIndex];
    const face = this.faces[faceIndex];

    while (face.firstChild) face.removeChild(face.firstChild);

    face.style.color = level.color;
    face.style.background = `linear-gradient(145deg, ${level.color}60, ${level.color}18)`;
    face.style.borderColor = `${level.color}cc`;
    face.style.boxShadow = `inset 0 0 0 9px ${level.color}20, inset 0 0 48px ${level.color}52, 0 0 32px ${level.color}44`;

    const markEl = document.createElement('div');
    markEl.className = 'cube-face-mark';
    face.appendChild(markEl);

    const nameEl = document.createElement('div');
    nameEl.className = 'cube-face-name';
    nameEl.textContent = level.name;
    face.appendChild(nameEl);

    const subEl = document.createElement('div');
    subEl.className = 'cube-face-index';
    subEl.textContent = `LEVEL ${String(faceIndex + 1).padStart(2, '0')}`;
    face.appendChild(subEl);
  }
}
