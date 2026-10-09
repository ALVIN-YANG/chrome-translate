// 独立绘制插件用的双向箭头图标，不依赖远程素材。
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function chunk(type, data) {
  const content = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of content) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, content, checksum]);
}
function segmentDistance(x, y, ax, ay, bx, by) {
  const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay));
}
const segments = [[.25,.36,.75,.36],[.61,.22,.75,.36],[.75,.36,.61,.50],[.75,.66,.25,.66],[.39,.52,.25,.66],[.25,.66,.39,.80]];
await mkdir(new URL('../public/icons/', import.meta.url), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const rgba = [0, 0, 0, 0];
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const px = (x + (sx + .5) / 4) / size, py = (y + (sy + .5) / 4) / size;
      const dx = Math.max(.20 - px, 0, px - .80), dy = Math.max(.20 - py, 0, py - .80);
      if (Math.hypot(dx, dy) > .16) continue;
      const white = segments.some(args => segmentDistance(px, py, ...args) < .036);
      const color = white ? [255,255,255,255] : [51,112,255,255];
      for (let c = 0; c < 4; c++) rgba[c] += color[c] / 16;
    }
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    const alpha = rgba[3];
    for (let c = 0; c < 3; c++) raw[offset + c] = alpha ? Math.round(rgba[c] * 255 / alpha) : 0;
    raw[offset + 3] = Math.round(alpha);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  await writeFile(new URL(`../public/icons/${size}.png`, import.meta.url), Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
console.log('已生成 16/32/48/128 像素插件图标。');
