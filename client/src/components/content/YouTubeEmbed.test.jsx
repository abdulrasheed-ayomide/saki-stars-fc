import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { YouTubeEmbed } from './VideoCard.jsx';

describe('YouTubeEmbed', () => {
  it('shows a thumbnail first and loads the privacy-enhanced player when tapped', () => {
    const { container } = render(<YouTubeEmbed videoId="dQw4w9WgXcQ" title="Match highlights" />);
    expect(container.querySelector('iframe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /play video: match highlights/i }));
    const iframe = container.querySelector('iframe');
    expect(iframe.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&autoplay=1');
  });

  it('says "Video temporarily unavailable." when YouTube no longer has the video', () => {
    const { container } = render(<YouTubeEmbed videoId="dQw4w9WgXcQ" />);
    fireEvent.error(container.querySelector('img'));
    expect(screen.getByText('Video temporarily unavailable.')).toBeInTheDocument();
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('never builds an embed from anything but a valid video ID', () => {
    const { container } = render(<YouTubeEmbed videoId={'"><script>alert(1)</script>'} />);
    expect(screen.getByText('Video temporarily unavailable.')).toBeInTheDocument();
    expect(container.querySelector('iframe, img')).toBeNull();
  });
});
