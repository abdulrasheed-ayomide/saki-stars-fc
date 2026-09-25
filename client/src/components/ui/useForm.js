import { useCallback, useState } from 'react';
import { fieldMessage, logError } from '../../lib/errors.js';

/**
 * Minimal form state: values, per-field errors (including those returned by the API
 * as VALIDATION_ERROR details) and a submit helper that tracks "submitting".
 */
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const set = useCallback(
    (name) => (eventOrValue) => {
      const v = eventOrValue && eventOrValue.target ? (eventOrValue.target.type === 'checkbox' ? eventOrValue.target.checked : eventOrValue.target.value) : eventOrValue;
      setValues((s) => setPath(s, name, v));
      setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
    },
    [],
  );

  const submit = useCallback(
    (fn) => async (e) => {
      e?.preventDefault?.();
      setSubmitting(true);
      setFormError(null);
      setErrors({});
      try {
        return await fn(values);
      } catch (err) {
        if (err?.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
          const map = {};
          for (const d of err.details) map[d.path] = map[d.path] || fieldMessage(d.message);
          setErrors(map);
          setFormError(err);
        } else {
          if (!err?.status) logError(err, 'form submit');
          setFormError(err);
        }
        return undefined;
      } finally {
        setSubmitting(false);
      }
    },
    [values],
  );

  return { values, setValues, set, errors, setErrors, formError, setFormError, submitting, submit };
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  const out = Array.isArray(obj) ? [...obj] : { ...obj };
  let cur = out;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const k = keys[i];
    cur[k] = Array.isArray(cur[k]) ? [...cur[k]] : { ...(cur[k] || {}) };
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return out;
}

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
