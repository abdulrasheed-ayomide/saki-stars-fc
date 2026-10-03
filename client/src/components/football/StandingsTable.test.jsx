import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { StandingsTable } from './StandingsTable.jsx';
import { DataTable } from '../ui/DataTable.jsx';

const row = (position, team, extra = {}) => ({
  position,
  team: { id: `t${position}`, slug: `team-${position}`, logo: null, shortName: '', isClubTeam: false, ...team },
  played: 18, won: 10, drawn: 4, lost: 4, goalsFor: 30, goalsAgainst: 20, goalDifference: 10, points: 34, form: ['W'],
  adjustment: null,
  ...extra,
});

describe('StandingsTable on small phones', () => {
  it('keeps every column and the full team name, with a compact name for phones', () => {
    const { container } = render(
      <MemoryRouter>
        <StandingsTable
          rows={[
            row(1, { name: 'Saki Stars Sports Club First Team', shortName: 'Saki Stars', isClubTeam: true }),
            row(2, { name: 'Akwa United', shortName: 'AKW' }),
            row(3, { name: 'Enugu Rangers International FC' }),
          ]}
        />
      </MemoryRouter>,
    );
    // No column removed.
    const headers = [...container.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    expect(headers).toEqual(['Pos', 'Team', 'P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts', 'Form']);

    const [first, second, third] = within(container.querySelector('tbody')).getAllByRole('row');
    // Long name with a short name: phones show the short name; the full name is the tooltip and
    // what screen readers (and the link) announce.
    const compact1 = first.querySelector('[aria-hidden="true"][title]');
    expect(compact1).toHaveTextContent('Saki Stars');
    expect(compact1).toHaveAttribute('title', 'Saki Stars Sports Club First Team');
    expect(compact1).toHaveClass('truncate', 'sm:hidden');
    expect(within(first).getByRole('link', { name: 'Saki Stars Sports Club First Team' })).toBeInTheDocument();
    // Short full names stay in full even when a short name exists.
    expect(second.querySelector('[aria-hidden="true"][title]')).toHaveTextContent('Akwa United');
    // Long name without a short name: the full name, shortened with "…" by CSS only.
    expect(third.querySelector('[aria-hidden="true"][title]')).toHaveTextContent('Enugu Rangers International FC');
    expect(within(third).getByRole('rowheader')).toHaveTextContent('Enugu Rangers International FC');
    // Numbers are never truncated.
    expect(within(first).getByText('34')).not.toHaveClass('truncate');
    // Desktop/tablet minimum widths unchanged (applied from the sm breakpoint).
    expect(container.querySelector('table')).toHaveClass('sm:min-w-[40rem]');
    expect(screen.getByRole('columnheader', { name: 'Team' })).toHaveClass('sm:min-w-[11rem]');
  });
});

describe('DataTable widths', () => {
  it('gives the phone name width to the name column, not to a "#" or date column; wide screens unchanged', () => {
    const { container } = render(
      <DataTable
        caption="Players"
        rows={[{ id: 1, no: 9, name: 'Oluwaseun Adebayo-Okonkwo', team: 'Saki Stars Sports Club First Team', email: 'a@example.org' }]}
        columns={[
          { key: 'no', nowrap: true, label: '#' },
          { key: 'name', label: 'Name' },
          { key: 'team', label: 'Team' },
          { key: 'email', label: 'Email', truncate: true },
        ]}
      />,
    );
    const [no, name, team, email] = container.querySelectorAll('tbody td');
    // Wide screens: exactly the original rule (first column 12rem).
    expect(no.style.getPropertyValue('--dt-min')).toBe('12rem');
    expect(no.style.getPropertyValue('--dt-min-phone')).toBe('0px');
    // Phones: the name column gets the room; other wrapping text keeps a readable minimum.
    expect(name.style.getPropertyValue('--dt-min-phone')).toBe('11rem');
    expect(team.style.getPropertyValue('--dt-min-phone')).toBe('7rem');
    expect(name).toHaveClass('min-w-(--dt-min-phone)', 'sm:min-w-(--dt-min)');
    // Truncated text keeps its full value in a tooltip.
    expect(email.firstChild).toHaveAttribute('title', 'a@example.org');
    expect(email.firstChild).toHaveClass('max-w-[11rem]', 'sm:max-w-[16rem]');
  });
});
