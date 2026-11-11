import { cursorAfter } from '../paged-list';

describe('cursorAfter', () => {
  it('continues from the cursor the server sent', () => {
    expect(cursorAfter({ items: [{ id: 5 }], next_cursor: 5 })).toBe(5);
  });
  it('ends when the server says there is no more', () => {
    expect(cursorAfter({ items: [{ id: 5 }], next_cursor: null })).toBeNull();
  });
  it('treats an empty page as the end, even if the server still sent a cursor', () => {
    expect(cursorAfter({ items: [], next_cursor: 7 })).toBeNull();
  });
});
