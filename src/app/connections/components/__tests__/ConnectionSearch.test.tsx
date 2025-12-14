import { fireEvent, render, screen } from '@/test-utils/render';
import ConnectionSearch from '../ConnectionSearch';

describe('ConnectionSearch', () => {
  it('renders placeholder and calls onSearchChange', () => {
    const onSearchChange = jest.fn();
    render(
      <ConnectionSearch
        searchTerm=""
        onSearchChange={onSearchChange}
        placeholder="Find connection"
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Find connection'), {
      target: { value: 'violin' },
    });
    expect(onSearchChange).toHaveBeenCalledWith('violin');
  });
});
