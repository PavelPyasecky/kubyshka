#!/usr/bin/env python3
"""Рисует иконку приложения: монограмма «К» на зелёном фоне.

Запуск: python3 scripts/make-icons.py
"""

import struct
import zlib
from pathlib import Path

BACKGROUND = (21, 114, 76)
INK = (244, 241, 230)

# Доли от стороны иконки: стойка, верхний луч, нижняя ножка.
STROKES = (
    ((0.345, 0.270), (0.345, 0.730)),
    ((0.660, 0.270), (0.395, 0.505)),
    ((0.430, 0.487), (0.680, 0.730)),
)
STROKE_WIDTH = 0.088

SIZES = {
    'apps/web/public/icon-192.png': 192,
    'apps/web/public/icon-512.png': 512,
    'apps/web/public/apple-touch-icon.png': 180,
}


def distance_to_segment(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    length = dx * dx + dy * dy
    t = 0.0 if length == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length))
    return ((px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2) ** 0.5


def coverage(distance, feather):
    if distance <= -feather:
        return 1.0
    if distance >= feather:
        return 0.0
    return (feather - distance) / (2 * feather)


def render(size):
    half_width = STROKE_WIDTH / 2
    feather = 0.6 / size
    rows = []

    for y in range(size):
        row = bytearray([0])
        py = (y + 0.5) / size
        for x in range(size):
            px = (x + 0.5) / size
            nearest = min(distance_to_segment(px, py, *start, *end) for start, end in STROKES)
            alpha = coverage(nearest - half_width, feather)
            row.extend(round(b + (i - b) * alpha) for b, i in zip(BACKGROUND, INK))
        rows.append(bytes(row))

    return b''.join(rows)


def chunk(tag, payload):
    return struct.pack('>I', len(payload)) + tag + payload + struct.pack('>I', zlib.crc32(tag + payload))


def write_png(path, size):
    header = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    data = zlib.compress(render(size), 9)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', data) + chunk(b'IEND', b''))
    print(f'{path} — {size}×{size}')


if __name__ == '__main__':
    root = Path(__file__).resolve().parent.parent
    for relative, size in SIZES.items():
        write_png(root / relative, size)
