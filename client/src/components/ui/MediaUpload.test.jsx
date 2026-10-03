import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MediaUpload, linkProblem } from './ImageUpload.jsx';
import { SafeImage } from './SafeImage.jsx';

const IMG = 'https://images.example.org/club/photo.jpg';

function Harness({ initial = null, onValue = () => {} }) {
  const [value, setValue] = useState(initial);
  return (
    <MediaUpload
      label="Photo"
      folder="players"
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue(v);
      }}
    />
  );
}

describe('linkProblem (mirrors the server rule)', () => {
  it('accepts direct https image links and rejects unsafe or page links', () => {
    expect(linkProblem(IMG)).toBeNull();
    expect(linkProblem('http://a.example.com/x.jpg')).toMatch(/https/);
    expect(linkProblem('javascript:alert(1)')).toMatch(/https/);
    expect(linkProblem('data:image/png;base64,AA')).toMatch(/https/);
    expect(linkProblem('<iframe src="x">')).toMatch(/https/);
    expect(linkProblem('https://u:p@a.example.com/x.jpg')).toMatch(/login details/);
    expect(linkProblem('https://www.instagram.com/p/abc/')).toMatch(/page or post/);
  });
});

describe('MediaUpload: Paste link or Upload', () => {
  it('starts on "Paste link" for a new image and offers both choices', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: /paste link/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /upload/i })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));
    expect(screen.getByRole('button', { name: /^upload$/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses a link only after the browser loads it (live preview), storing just the link', async () => {
    vi.useFakeTimers();
    const onValue = vi.fn();
    const { container } = render(<Harness onValue={onValue} />);
    fireEvent.change(screen.getByLabelText(/image link/i), { target: { value: IMG } });
    await act(async () => vi.advanceTimersByTime(500));
    const probe = container.querySelector('img[hidden]');
    expect(probe).toBeTruthy();
    Object.defineProperty(probe, 'naturalWidth', { value: 800 });
    Object.defineProperty(probe, 'naturalHeight', { value: 600 });
    fireEvent.load(probe);
    expect(onValue).toHaveBeenLastCalledWith({ source: 'link', url: IMG, alt: '', width: 800, height: 600 });
    expect(screen.getByRole('button', { name: /remove image/i })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('shows a plain message when the image cannot load, and does not use the link', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onValue = vi.fn();
    const { container } = render(<Harness onValue={onValue} />);
    fireEvent.change(screen.getByLabelText(/image link/i), { target: { value: 'https://images.example.org/missing.jpg' } });
    await act(async () => vi.advanceTimersByTime(500));
    fireEvent.error(container.querySelector('img[hidden]'));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load this image. Please check the link or upload the image instead.');
    expect(onValue).not.toHaveBeenCalled();
    spy.mockRestore();
    vi.useRealTimers();
  });

  it('explains why a Facebook/Instagram post link cannot be used, and warns about expiring image links', () => {
    render(<Harness />);
    const input = screen.getByLabelText(/image link/i);
    fireEvent.change(input, { target: { value: 'https://www.facebook.com/sakistars/photos/1' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/page or post, not to an image/);
    fireEvent.change(input, { target: { value: 'https://scontent.fbcdn.net/v/t39/photo.jpg' } });
    expect(screen.getByText(/usually stop working after a few weeks/)).toBeInTheDocument();
  });

  it('opens an existing link on the link tab and an existing upload on the upload tab', () => {
    const { unmount } = render(<Harness initial={{ source: 'link', url: IMG, alt: '' }} />);
    expect(screen.getByLabelText(/image link/i)).toHaveValue(IMG);
    unmount();
    render(<Harness initial={{ source: 'cloudinary', url: 'https://res.cloudinary.com/demo/image/upload/x.jpg', publicId: 'saki/x', alt: '' }} />);
    expect(screen.getByRole('button', { name: /^upload$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /replace/i })).toBeInTheDocument();
  });
});

describe('SafeImage', () => {
  it('shows the fallback instead of a broken image', () => {
    const { container } = render(<SafeImage src={IMG} alt="" fallback={<span>gone</span>} />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    fireEvent.error(img);
    expect(screen.getByText('gone')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
