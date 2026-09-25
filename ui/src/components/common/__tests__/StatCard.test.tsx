import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatCard from '../StatCard';

/**
 * `StatCard` grouped digits only for `typeof value === 'number'`, but most
 * stats endpoints hand the dashboard their counts as strings (Postgres
 * `count(*)` over `pg`). So `ApiLatencyStats` rendered `1284922` while
 * `StatsSummary`, which happens to pass real numbers, rendered `184,922` — the
 * same dashboard, two formats.
 *
 * The rule the fix implements: group a string ONLY when it is a bare decimal
 * number in canonical form — optional `-`, no leading zeros, at most 15 integer
 * digits, optional fractional part. Anything with a unit, a percent sign, a
 * space, a colon, letters, leading zeros, or more than 15 integer digits is
 * rendered exactly as given. The digit cap is what keeps a Discord snowflake
 * (17-19 digits) out: wrong grouping on an identifier is worse than no grouping
 * on a count.
 */
describe('StatCard value grouping', () => {
  it('groups a numeric string the same way it groups a number', () => {
    render(<StatCard value="1284922" label="Total Requests" />);
    expect(screen.getByText('1,284,922')).toBeInTheDocument();
  });

  it('still groups a real number', () => {
    render(<StatCard value={184922} label="Total Commands" />);
    expect(screen.getByText('184,922')).toBeInTheDocument();
  });

  it('groups a negative numeric string', () => {
    render(<StatCard value="-1284922" label="Delta" />);
    expect(screen.getByText('-1,284,922')).toBeInTheDocument();
  });

  it('groups the integer part of a decimal and keeps every fractional digit', () => {
    render(<StatCard value="1234567.8901" label="Avg" />);
    expect(screen.getByText('1,234,567.8901')).toBeInTheDocument();
  });

  it('leaves a small number alone', () => {
    render(<StatCard value="42" label="Sounds" />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('never groups a Discord snowflake', () => {
    render(<StatCard value="123456789012345678" label="Guild" />);
    expect(screen.getByText('123456789012345678')).toBeInTheDocument();
  });

  it('leaves a latency value with its unit alone', () => {
    render(<StatCard value="12000000ms" label="Max" />);
    expect(screen.getByText('12000000ms')).toBeInTheDocument();
  });

  it('leaves a percentage alone', () => {
    render(<StatCard value="99.4%" label="Success Rate" />);
    expect(screen.getByText('99.4%')).toBeInTheDocument();
  });

  it('leaves a formatted duration alone', () => {
    render(<StatCard value="973h 55m" label="Total Time" />);
    expect(screen.getByText('973h 55m')).toBeInTheDocument();
  });

  it('leaves a zero-padded value alone', () => {
    render(<StatCard value="0012345678" label="Code" />);
    expect(screen.getByText('0012345678')).toBeInTheDocument();
  });

  it('leaves free text alone', () => {
    render(<StatCard value="TypeError" label="Most Common Error" />);
    expect(screen.getByText('TypeError')).toBeInTheDocument();
  });

  it('renders a node value untouched', () => {
    render(<StatCard value={<span data-testid="node">1284922ms</span>} label="P99" />);
    expect(screen.getByTestId('node')).toHaveTextContent('1284922ms');
  });
});
