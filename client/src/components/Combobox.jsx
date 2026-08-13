// Type-ahead picker: type to filter, click/Enter to select.
// items: [{ id, label }]. value = selected id. onChange(id) ('' to clear).
import { useEffect, useMemo, useRef, useState } from 'react';

const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function Combobox({
  items,
  value,
  onChange,
  placeholder = 'Tapez pour rechercher…',
  label,
  max = 8,
  emptyText = 'Aucun résultat',
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef(null);

  const selected = useMemo(() => items.find((i) => i.id === value), [items, value]);
  // Reflect a selected value in the input (don't wipe what the user is typing
  // when the value is cleared, e.g. while searching for another student).
  useEffect(() => {
    if (selected) setQ(selected.label);
  }, [selected]);

  const matches = useMemo(() => {
    const nq = norm(q.trim());
    const list = nq ? items.filter((i) => norm(i.label).includes(nq)) : items;
    return list.slice(0, max);
  }, [items, q, max]);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(item) {
    onChange(item.id);
    setQ(item.label);
    setOpen(false);
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHi((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (matches[hi]) pick(matches[hi]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="combo" ref={ref}>
      {label && <label className="lbl">{label}</label>}
      <input
        className="input"
        placeholder={placeholder}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setHi(0);
          if (value) onChange('');
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <ul className="combo-list">
          {matches.map((m, i) => (
            <li
              key={m.id}
              className={'combo-item' + (i === hi ? ' hi' : '')}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
              onMouseEnter={() => setHi(i)}
            >
              {m.label}
            </li>
          ))}
        </ul>
      )}
      {open && q.trim() && matches.length === 0 && (
        <ul className="combo-list">
          <li className="combo-empty">{emptyText}</li>
        </ul>
      )}
    </div>
  );
}
