import { currencyMark, formatAmount } from '@kubyshka/shared';

// Пропорции с чертежа Нацбанка в заявке Unicode L2/26-089: буква «Б», черта толщиной x.
const SIGN =
  'M15 0H65V10H25V30H45A30 30 0 0 1 45 90H15V65H0V55H15V0ZM25 40H45A20 20 0 0 1 45 80H25V65H45V55H25V40Z';

export const CurrencySign = () => (
  <svg className="currency-sign" viewBox="0 0 78 90" aria-hidden="true" focusable="false">
    <path fill="currentColor" fillRule="evenodd" d={SIGN} />
  </svg>
);

export const MoneyAmount = ({ minor, signed = false }: { minor: number; signed?: boolean }) => {
  const body = signed && minor > 0 ? `+${formatAmount(minor)}` : formatAmount(minor);

  return (
    <span className="money">
      {body}
      <CurrencySign />
      <span className="sr-only"> {currencyMark}</span>
    </span>
  );
};
