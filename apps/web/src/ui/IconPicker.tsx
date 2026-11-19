import { PICK_COLORS, PICK_ICONS } from './palette.ts';

type Props = {
  icon: string;
  color: string;
  onIcon: (icon: string) => void;
  onColor: (color: string) => void;
};

export const IconPicker = ({ icon, color, onIcon, onColor }: Props) => (
  <div className="picker">
    <div className="picker-row">
      {PICK_ICONS.map((item) => (
        <button key={item} type="button" className="swatch" aria-pressed={item === icon} onClick={() => onIcon(item)}>
          {item}
        </button>
      ))}
    </div>
    <div className="picker-row">
      {PICK_COLORS.map((item) => (
        <button
          key={item}
          type="button"
          className="swatch color"
          style={{ background: item }}
          aria-label={item}
          aria-pressed={item === color}
          onClick={() => onColor(item)}
        />
      ))}
    </div>
  </div>
);
