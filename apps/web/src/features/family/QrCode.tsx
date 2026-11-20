import { encode } from 'uqr';

export const QrCode = ({ text }: { text: string }) => {
  const qr = encode(text, { ecc: 'M', border: 2 });
  const path: string[] = [];
  qr.data.forEach((row, y) => {
    row.forEach((on, x) => {
      if (on) path.push(`M${x} ${y}h1v1h-1z`);
    });
  });

  return (
    <svg className="qr" viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label="Ссылка для второго телефона">
      <rect width={qr.size} height={qr.size} fill="#fff" />
      <path d={path.join('')} fill="#111" />
    </svg>
  );
};
