import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/app/hooks';
import { NumberField } from '@/design-system/primitives';
import { toCanonical, toDisplay, unitKey, type Measure } from '@/lib/units';

/** UI conversion only: callbacks always receive canonical kilograms/centimetres. */
export function MeasureField({
  measure = 'mass',
  value,
  onChange,
  ...props
}: ComponentProps<typeof NumberField> & { measure?: Measure }) {
  const { units } = useSettings();
  const { t } = useTranslation();
  return (
    <NumberField
      {...props}
      key={units}
      value={value === '' ? '' : Math.round(toDisplay(value, measure, units) * 100) / 100}
      suffix={t(`units.${unitKey(measure, units)}`)}
      onChange={(next) => onChange(next === '' ? '' : toCanonical(next, measure, units))}
    />
  );
}
