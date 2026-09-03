import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StationTable } from './StationTable'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

describe('StationTable', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    )
  })

  it('adds a grid track when geolocation enables the distance column', () => {
    const baseProps = {
      rows: [],
      fuelTypes: ['regular', 'premium', 'diesel', 'duba'] as const,
      isLoading: false,
      canLoadMore: false,
      isLoadingMore: false,
      onLoadMore: vi.fn(),
    }
    const { rerender } = render(
      <StationTable {...baseProps} fuelTypes={[...baseProps.fuelTypes]} sortMode="price" />,
    )

    const getHeaderGrid = () =>
      screen.getByRole('table').querySelector<HTMLElement>('[role="rowgroup"]')

    expect(screen.getAllByRole('columnheader')).toHaveLength(6)
    expect(getHeaderGrid()?.style.gridTemplateColumns.split(' ')).toHaveLength(6)

    rerender(
      <StationTable
        {...baseProps}
        fuelTypes={[...baseProps.fuelTypes]}
        sortMode="distance"
      />,
    )

    expect(screen.getAllByRole('columnheader')).toHaveLength(7)
    expect(getHeaderGrid()?.style.gridTemplateColumns.split(' ')).toHaveLength(7)
    expect(screen.getByRole('columnheader', { name: /Distancia/ })).toBeTruthy()
  })
})
