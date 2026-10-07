import type { AnswerField } from '../../exercises/types';
import { clsx } from './ui';

interface Props {
  field: AnswerField;
  selected?: string;
  /** Set once the answer is in; switches the grid into review colours. */
  revealed?: boolean;
  correctId?: string;
  onSelect: (optionId: string) => void;
  /** Extra line on the right of the field label. */
  note?: string;
}

export function AnswerGrid({ field, selected, revealed, correctId, onSelect, note }: Props) {
  const columns = field.variant === 'pitch' ? undefined : (field.columns ?? 2);
  return (
    <div className="field">
      <div className="field__label">
        <span>{field.label}</span>
        {note && <span>{note}</span>}
      </div>
      <div
        className={clsx('optgrid', field.variant === 'pitch' && 'optgrid--pitch')}
        style={columns ? ({ '--cols': columns } as React.CSSProperties) : undefined}
        role="group"
        aria-label={field.label}
      >
        {field.options.map((option) => {
          const isSelected = selected === option.id;
          const isCorrect = revealed && correctId === option.id;
          const isWrong = revealed && isSelected && correctId !== option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isSelected}
              disabled={revealed}
              className={clsx(
                'opt',
                !revealed && isSelected && 'opt--on',
                isCorrect && 'opt--right',
                isWrong && 'opt--wrong',
                revealed && !isCorrect && !isWrong && 'opt--dim',
              )}
              onClick={() => onSelect(option.id)}
            >
              <span className="opt__label">{option.label}</span>
              {option.sub && <span className="opt__sub">{option.sub}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
