import { useEffect, useRef, useState } from 'react';

// A six box one-time-code field. Typing moves forward, Backspace moves back,
// arrows move between boxes, and pasting a whole code fills every box. A
// password manager or the phone keyboard can also drop the full code into the
// first box.
export function OtpInput({
  value = '',
  onChange,
  length = 6,
  autoFocus = false,
  disabled = false,
  invalid = false,
  label = 'Authentication code',
}) {
  const boxes = useRef([]);
  const [slots, setSlots] = useState(() => Array.from({ length }, (_, index) => value[index] || ''));

  // The parent owns the value. Only a reset clears the boxes; re-deriving on
  // every keystroke would shift digits left whenever a box was skipped.
  useEffect(() => {
    if (value === '') setSlots(Array.from({ length }, () => ''));
  }, [value, length]);

  const commit = next => {
    setSlots(next);
    onChange(next.join(''));
  };

  const focusAt = index => {
    const box = boxes.current[Math.max(0, Math.min(length - 1, index))];
    if (box) {
      box.focus();
      box.select?.();
    }
  };

  const writeDigits = (start, digits) => {
    const next = slots.slice();
    let cursor = start;
    for (const digit of digits) {
      if (cursor >= length) break;
      next[cursor] = digit;
      cursor += 1;
    }
    commit(next);
    return cursor;
  };

  const handleChange = (index, raw) => {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits) {
      const next = slots.slice();
      next[index] = '';
      commit(next);
      return;
    }
    focusAt(writeDigits(index, digits));
  };

  const handleKeyDown = (index, event) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const next = slots.slice();
      if (next[index]) {
        next[index] = '';
        commit(next);
        return;
      }
      if (index > 0) {
        next[index - 1] = '';
        commit(next);
        focusAt(index - 1);
      }
      return;
    }
    if (event.key === 'Delete') {
      event.preventDefault();
      const next = slots.slice();
      next[index] = '';
      commit(next);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusAt(index - 1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusAt(index + 1);
    }
  };

  const handlePaste = event => {
    const digits = String(event.clipboardData?.getData('text') || '')
      .replace(/\D/g, '')
      .slice(0, length);
    if (!digits) return;
    event.preventDefault();
    // A pasted code always fills from the first box.
    commit(Array.from({ length }, (_, index) => digits[index] || ''));
    focusAt(digits.length >= length ? length - 1 : digits.length);
  };

  return (
    <div className={`otp${invalid ? ' is-invalid' : ''}`} role="group" aria-label={label}>
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          ref={element => {
            boxes.current[index] = element;
          }}
          className="otp-box"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={slots[index] || ''}
          onChange={event => handleChange(index, event.target.value)}
          onKeyDown={event => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={event => event.currentTarget.select()}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${index + 1} of ${length}`}
          autoFocus={autoFocus && index === 0}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
