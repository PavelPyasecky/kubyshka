import { useState } from 'react';
import { Keypad } from '../../ui/Keypad.tsx';
import { unlock, verifyPin } from '../../state/lock.ts';

export const LockScreen = () => {
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);

  const handle = async (key: string) => {
    if (key === ',') return;

    if (key === '⌫') {
      setPin(pin.slice(0, -1));
      return;
    }

    const next = `${pin}${key}`.slice(0, 4);
    setPin(next);
    setWrong(false);

    if (next.length < 4) return;

    if (await verifyPin(next)) {
      await unlock();
      return;
    }

    setWrong(true);
    setPin('');
    navigator.vibrate?.([20, 60, 20]);
  };

  return (
    <div className="lock">
      <h1>Кубышка</h1>
      <div className="dots">
        {[0, 1, 2, 3].map((index) => (
          <i key={index} className={index < pin.length ? 'on' : undefined} />
        ))}
      </div>
      <p className="error" style={{ minHeight: 20 }}>
        {wrong ? 'Неверный PIN' : ''}
      </p>
      <Keypad onKey={(key) => void handle(key)} />
    </div>
  );
};
