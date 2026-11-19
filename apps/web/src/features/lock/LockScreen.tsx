import { useEffect, useState } from 'react';
import { Keypad } from '../../ui/Keypad.tsx';
import { unlock, verifyPin } from '../../state/lock.ts';

export const LockScreen = () => {
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);

  useEffect(() => {
    if (pin.length < 4) return;

    let cancelled = false;
    void verifyPin(pin).then(async (correct) => {
      if (cancelled) return;
      if (correct) {
        await unlock();
        return;
      }
      setWrong(true);
      setPin('');
      navigator.vibrate?.([20, 60, 20]);
    });

    return () => {
      cancelled = true;
    };
  }, [pin]);

  const handle = (key: string) => {
    if (key === ',') return;
    setWrong(false);
    setPin((current) => (key === '⌫' ? current.slice(0, -1) : `${current}${key}`.slice(0, 4)));
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
      <Keypad onKey={handle} />
    </div>
  );
};
