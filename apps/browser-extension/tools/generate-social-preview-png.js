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
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      putPixel(xx, yy, color);
    }
  }
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
      const greenGlow = Math.max(0, 1 - Math.hypot((x - 245) / 340, (y - 160) / 260));
      const goldGlow = Math.max(0, 1 - Math.hypot((x - 1060) / 420, (y - 128) / 300));
      putPixel(x, y, [
        mix(16, 24, diagonal) + greenGlow * 8 + goldGlow * 10,
        mix(24, 42, diagonal) + greenGlow * 44 + goldGlow * 24,
        mix(32, 54, diagonal) + greenGlow * 26 + goldGlow * 8,
        255
      ]);
    }
  }
}

function drawShield() {
  const outer = [[220, 80], [365, 130], [365, 258], [332, 365], [220, 475], [108, 365], [75, 258], [75, 130]];
  const inner = [[220, 118], [330, 156], [330, 260], [303, 344], [220, 428], [137, 344], [110, 260], [110, 156]];
  fillPolygon(outer, [17, 30, 43, 255]);
  fillPolygon(inner, [28, 49, 69, 255]);
  drawLine(220, 98, 350, 142, 4, [159, 178, 196, 210]);
  drawLine(350, 142, 350, 258, 4, [159, 178, 196, 210]);
  drawLine(350, 258, 318, 356, 4, [159, 178, 196, 210]);
  drawLine(318, 356, 220, 452, 4, [159, 178, 196, 210]);
  drawLine(220, 452, 122, 356, 4, [159, 178, 196, 210]);
  drawLine(122, 356, 90, 258, 4, [159, 178, 196, 210]);
  drawLine(90, 258, 90, 142, 4, [159, 178, 196, 210]);
  drawLine(90, 142, 220, 98, 4, [159, 178, 196, 210]);
  drawLine(100, 302, 155, 302, 7, [47, 230, 129, 255]);
  drawLine(155, 302, 185, 222, 7, [47, 230, 129, 255]);
  drawLine(185, 222, 238, 390, 7, [47, 230, 129, 255]);
  drawLine(238, 390, 276, 302, 7, [47, 230, 129, 255]);
  drawLine(276, 302, 342, 302, 7, [47, 230, 129, 255]);
  drawLine(282, 224, 338, 224, 5, [255, 209, 102, 255]);
}

function drawBadges() {
  [
    ["SAFE", 470, [47, 230, 129, 255]],
    ["RISKY", 620, [255, 209, 102, 255]],
    ["LOCAL", 790, [215, 224, 231, 255]],
    ["OPEN SRC", 990, [215, 224, 231, 255]]
  ].forEach(([label, x, color]) => {
    fillRect(x - 16, 478, label.length * 30 + 28, 62, [255, 255, 255, 18]);
    drawLine(x - 16, 478, x + label.length * 30 + 12, 478, 2, [255, 255, 255, 46]);
    drawText(label, x, 496, 5, color);
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
drawShield();
drawText("GUARD SIGNAL", 470, 92, 5, [47, 230, 129, 255]);
drawText("STREAMVOLUME", 470, 162, 10, [255, 255, 255, 255]);
drawText("GUARD", 470, 260, 13, [255, 255, 255, 255]);
drawText("PROTECTION AUDIO POUR STREAMERS", 472, 400, 4, [215, 224, 231, 255]);
drawBadges();
writePng();

console.log(`Social preview generated: ${output}`);
