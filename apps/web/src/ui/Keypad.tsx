import './keypad.css';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'];

export const appendDigit = (raw: string, key: string): string => {
  if (key === '⌫') return raw.slice(0, -1);
  if (key === ',') return raw.includes(',') ? raw : `${raw || '0'},`;

  const [whole, fraction] = raw.split(',');
  if (fraction !== undefined) return fraction.length >= 2 ? raw : `${whole},${fraction}${key}`;
  if (whole.length >= 9) return raw;
  return whole === '0' ? key : whole + key;
};

export const Keypad = ({ onKey }: { onKey: (key: string) => void }) => (
  <div className="keypad">
    {KEYS.map((key) => (
      <button key={key} type="button" onClick={() => onKey(key)} aria-label={key === '⌫' ? 'Стереть' : key}>
        {key}
      </button>
    ))}
  </div>
);
