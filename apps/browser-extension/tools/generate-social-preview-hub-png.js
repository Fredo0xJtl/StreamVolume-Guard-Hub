const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "assets", "social-preview.png");
const width = 1280;
const height = 640;
const pixels = Buffer.alloc(width * height * 4);

const font = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  "G": ["01111", "10000", "10000", "10111", "10001", "10001", "01110"],
  "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  "W": ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"]
};

const crcTable = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function mix(a, b, amount) {
  return a + (b - a) * amount;
}

function putPixel(x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const index = (Math.floor(y) * width + Math.floor(x)) * 4;
  const alpha = (color[3] ?? 255) / 255;
  pixels[index] = clamp(color[0] * alpha + pixels[index] * (1 - alpha));
  pixels[index + 1] = clamp(color[1] * alpha + pixels[index + 1] * (1 - alpha));
  pixels[index + 2] = clamp(color[2] * alpha + pixels[index + 2] * (1 - alpha));
  pixels[index + 3] = 255;
}

function fillRect(x, y, w, h, color) {
  for (let yy = Math.floor(y); yy < y + h; yy += 1) {
    for (let xx = Math.floor(x); xx < x + w; xx += 1) {
      putPixel(xx, yy, color);
    }
  }
}

function strokeRect(x, y, w, h, thickness, color) {
  fillRect(x, y, w, thickness, color);
  fillRect(x, y + h - thickness, w, thickness, color);
  fillRect(x, y, thickness, h, color);
  fillRect(x + w - thickness, y, thickness, h, color);
}

function fillCircle(cx, cy, radius, color) {
  const r2 = radius * radius;
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) putPixel(x, y, color);
    }
  }
}

function drawLine(x1, y1, x2, y2, thickness, color) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    fillCircle(Math.round(mix(x1, x2, t)), Math.round(mix(y1, y2, t)), thickness, color);
  }
}

function fillPolygon(points, color) {
  const minY = Math.floor(Math.min(...points.map((point) => point[1])));
  const maxY = Math.ceil(Math.max(...points.map((point) => point[1])));
  for (let y = minY; y <= maxY; y += 1) {
    const nodes = [];
    let j = points.length - 1;
    for (let i = 0; i < points.length; i += 1) {
      const pi = points[i];
      const pj = points[j];
      if ((pi[1] < y && pj[1] >= y) || (pj[1] < y && pi[1] >= y)) {
        nodes.push(pi[0] + ((y - pi[1]) / (pj[1] - pi[1])) * (pj[0] - pi[0]));
      }
      j = i;
    }
    nodes.sort((a, b) => a - b);
    for (let i = 0; i < nodes.length; i += 2) {
      for (let x = Math.floor(nodes[i]); x < Math.ceil(nodes[i + 1]); x += 1) {
        putPixel(x, y, color);
      }
    }
  }
}

function drawText(text, x, y, scale, color) {
  let cursor = x;
  for (const char of text.toUpperCase()) {
    const glyph = font[char] || font[" "];
    glyph.forEach((row, rowIndex) => {
      [...row].forEach((cell, colIndex) => {
        if (cell === "1") {
          fillRect(cursor + colIndex * scale, y + rowIndex * scale, scale, scale, color);
        }
      });
    });
    cursor += 6 * scale;
  }
}

function drawBackground() {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const diagonal = (x / width + y / height) / 2;
      const topGlow = Math.max(0, 1 - Math.hypot((x - 260) / 430, (y - 92) / 260));
      const greenGlow = Math.max(0, 1 - Math.hypot((x - 960) / 360, (y - 445) / 240));
      const goldGlow = Math.max(0, 1 - Math.hypot((x - 1120) / 320, (y - 130) / 250));
      putPixel(x, y, [
        mix(10, 22, diagonal) + topGlow * 8 + goldGlow * 11,
        mix(18, 35, diagonal) + topGlow * 30 + greenGlow * 36 + goldGlow * 22,
        mix(27, 45, diagonal) + topGlow * 42 + greenGlow * 22 + goldGlow * 7,
        255
      ]);
    }
  }

  for (let x = 0; x < width; x += 32) {
    drawLine(x, 0, x - 180, height, 1, [255, 255, 255, 8]);
  }
}

function drawShield(x, y, scale) {
  const outer = [
    [x + 80 * scale, y],
    [x + 145 * scale, y + 22 * scale],
    [x + 145 * scale, y + 88 * scale],
    [x + 129 * scale, y + 140 * scale],
    [x + 80 * scale, y + 188 * scale],
    [x + 31 * scale, y + 140 * scale],
    [x + 15 * scale, y + 88 * scale],
    [x + 15 * scale, y + 22 * scale]
  ];
  const inner = [
    [x + 80 * scale, y + 20 * scale],
    [x + 128 * scale, y + 36 * scale],
    [x + 128 * scale, y + 88 * scale],
    [x + 115 * scale, y + 130 * scale],
    [x + 80 * scale, y + 165 * scale],
    [x + 45 * scale, y + 130 * scale],
    [x + 32 * scale, y + 88 * scale],
    [x + 32 * scale, y + 36 * scale]
  ];

  fillPolygon(outer, [10, 18, 28, 255]);
  fillPolygon(inner, [25, 45, 64, 255]);
  outer.forEach((point, index) => {
    const next = outer[(index + 1) % outer.length];
    drawLine(point[0], point[1], next[0], next[1], 3 * scale, [146, 166, 186, 220]);
  });
  drawLine(x + 32 * scale, y + 105 * scale, x + 58 * scale, y + 105 * scale, 5 * scale, [47, 230, 129, 255]);
  drawLine(x + 58 * scale, y + 105 * scale, x + 72 * scale, y + 70 * scale, 5 * scale, [47, 230, 129, 255]);
  drawLine(x + 72 * scale, y + 70 * scale, x + 94 * scale, y + 142 * scale, 5 * scale, [47, 230, 129, 255]);
  drawLine(x + 94 * scale, y + 142 * scale, x + 112 * scale, y + 105 * scale, 5 * scale, [47, 230, 129, 255]);
  drawLine(x + 112 * scale, y + 105 * scale, x + 136 * scale, y + 105 * scale, 5 * scale, [47, 230, 129, 255]);
  drawLine(x + 112 * scale, y + 72 * scale, x + 136 * scale, y + 72 * scale, 4 * scale, [255, 209, 102, 255]);
}

function drawMixerPanel() {
  fillRect(910, 86, 270, 322, [12, 22, 33, 224]);
  strokeRect(910, 86, 270, 322, 2, [255, 255, 255, 38]);
  drawText("LIVE MIX", 938, 116, 3, [159, 178, 196, 255]);

  const channels = [
    ["WIN", 950, 250, [47, 230, 129, 255]],
    ["WEB", 1026, 186, [255, 209, 102, 255]],
    ["OBS", 1102, 226, [126, 213, 255, 255]]
  ];

  channels.forEach(([label, x, knobY, color]) => {
    fillRect(x, 168, 42, 158, [255, 255, 255, 18]);
    fillRect(x + 17, 190, 8, 112, [255, 255, 255, 62]);
    fillRect(x + 9, knobY, 24, 16, color);
    drawText(label, x - 1, 344, 3, [234, 242, 248, 255]);
  });

  drawText("SAFE", 990, 374, 3, [47, 230, 129, 255]);
}

function drawBadges() {
  [
    ["WINDOWS", 94, 510, [47, 230, 129, 255]],
    ["BROWSER", 322, 510, [255, 209, 102, 255]],
    ["LOCAL BRIDGE", 568, 510, [126, 213, 255, 255]],
    ["NO TRACKING", 902, 510, [226, 236, 244, 255]]
  ].forEach(([label, x, y, color]) => {
    fillRect(x - 18, y - 16, label.length * 24 + 32, 54, [255, 255, 255, 18]);
    strokeRect(x - 18, y - 16, label.length * 24 + 32, 54, 2, [255, 255, 255, 42]);
    drawText(label, x, y, 4, color);
  });
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function writePng() {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const png = Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);

  fs.writeFileSync(output, png);
  if (png.length >= 1024 * 1024) {
    throw new Error("Social preview is larger than 1 MB.");
  }
}

drawBackground();
drawShield(76, 88, 1.82);
drawText("STREAMVOLUME", 362, 108, 7, [255, 255, 255, 255]);
drawText("GUARD HUB", 362, 194, 10, [255, 255, 255, 255]);
drawText("SMART MIXER FOR LIVE AUDIO", 366, 332, 3, [215, 224, 231, 255]);
drawText("DESKTOP + BROWSER + LOCAL", 366, 382, 3, [47, 230, 129, 255]);
drawMixerPanel();
drawBadges();
writePng();

console.log(`Social preview generated: ${output}`);
