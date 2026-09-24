import { Fragment } from 'react';

/**
 * A deliberately small, safe formatter for news and match reports.
 * Supports: ## headings, - lists, 1. lists, > quotes, **bold**, *italic*, [text](https://link)
 * and paragraphs. It builds React elements, never HTML strings, so article text can
 * never inject scripts.
 */
function inline(text, keyBase) {
  const out = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\))/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = pattern.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    const key = `${keyBase}-${i++}`;
    if (token.startsWith('**')) out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('*')) out.push(<em key={key}>{token.slice(1, -1)}</em>);
    else {
      const label = token.slice(1, token.indexOf(']'));
      const href = m[2];
      const external = href.startsWith('http');
      out.push(
        <a key={key} href={href} className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-900" {...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}>
          {label}
        </a>,
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text = '', className = '' }) {
  const blocks = [];
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  let para = [];
  let list = null;

  const flushPara = () => {
    if (para.length) blocks.push({ type: 'p', text: para.join(' ') });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    const h = line.match(/^(#{2,4})\s+(.*)$/);
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const quote = line.match(/^>\s?(.*)$/);
    if (h) {
      flushPara();
      flushList();
      blocks.push({ type: `h${h[1].length}`, text: h[2] });
    } else if (ul || ol) {
      flushPara();
      const type = ul ? 'ul' : 'ol';
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push((ul || ol)[1]);
    } else if (quote) {
      flushPara();
      flushList();
      blocks.push({ type: 'quote', text: quote[1] });
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();

  return (
    <div className={`space-y-4 text-base leading-relaxed text-slate-800 ${className}`}>
      {blocks.map((b, i) => {
        const key = `b${i}`;
        if (b.type === 'h2') return <h2 key={key} className="pt-2 text-xl font-bold text-brand-900">{inline(b.text, key)}</h2>;
        if (b.type === 'h3') return <h3 key={key} className="pt-1 text-lg font-semibold text-brand-900">{inline(b.text, key)}</h3>;
        if (b.type === 'h4') return <h4 key={key} className="font-semibold text-brand-900">{inline(b.text, key)}</h4>;
        if (b.type === 'quote') return <blockquote key={key} className="border-l-4 border-brand-200 pl-4 italic text-slate-700">{inline(b.text, key)}</blockquote>;
        if (b.type === 'ul' || b.type === 'ol') {
          const Tag = b.type;
          return (
            <Tag key={key} className={`space-y-1 pl-6 ${b.type === 'ul' ? 'list-disc' : 'list-decimal'}`}>
              {b.items.map((item, j) => (
                <li key={`${key}-${j}`}>{inline(item, `${key}-${j}`)}</li>
              ))}
            </Tag>
          );
        }
        return <p key={key}>{inline(b.text, key).map((part, j) => <Fragment key={j}>{part}</Fragment>)}</p>;
      })}
    </div>
  );
}
