import {
  defaultState, parseState, migrateV1, validateName, createList, renameList, deleteList, restoreList,
  addSymbol, removeSymbol, dropSymbolEverywhere, MAX_LISTS, type ListsState,
} from '@/lib/lists';

const L = (id: string, name: string, symbols: string[] = []) => ({
  id, name, createdAt: '2026-10-01T00:00:00Z',
  items: symbols.map((symbol) => ({ symbol, addedAt: '2026-10-01T00:00:00Z' })),
});
const S = (lists = [L('a', 'Alpha'), L('b', 'Beta'), L('c', 'Gamma')], activeId = 'a'): ListsState => ({ activeId, lists });

describe('defaultState', () => {
  test('one empty "My watchlist", active', () => {
    const s = defaultState();
    expect(s.lists).toHaveLength(1);
    expect(s.lists[0].name).toBe('My watchlist');
    expect(s.activeId).toBe(s.lists[0].id);
    expect(s.lists[0].items).toEqual([]);
  });
});

describe('parseState', () => {
  test('round-trips valid state', () => expect(parseState(S())).toEqual(S()));
  test.each([null, {}, { lists: [] }, 'x', 5])('garbage %p → null', (v) => expect(parseState(v)).toBeNull());
  test('drops bad items only', () => {
    const raw = { activeId: 'a', lists: [{ ...L('a', 'Alpha'), items: [{ symbol: 'TCS', addedAt: 'x' }, { symbol: 5 }, null] }] };
    expect(parseState(raw)!.lists[0].items.map((i) => i.symbol)).toEqual(['TCS']);
  });
  test('dedupes symbols case-insensitively keeping first', () => {
    const raw = { activeId: 'a', lists: [L('a', 'Alpha', ['tcs', 'TCS', 'INFY'])] };
    expect(parseState(raw)!.lists[0].items.map((i) => i.symbol)).toEqual(['tcs', 'INFY']);
  });
  test('invalid activeId falls back to first list', () => expect(parseState({ ...S(), activeId: 'zzz' })!.activeId).toBe('a'));
  test('caps lists at 8 and items at 25', () => {
    const many = Array.from({ length: 12 }, (_, i) => L(`i${i}`, `N${i}`));
    expect(parseState({ activeId: 'i0', lists: many })!.lists).toHaveLength(MAX_LISTS);
    const syms = Array.from({ length: 40 }, (_, i) => `S${i}`);
    expect(parseState({ activeId: 'a', lists: [L('a', 'A', syms)] })!.lists[0].items).toHaveLength(25);
  });
});

describe('migrateV1', () => {
  test('creates one "My watchlist" keeping addedAt', () => {
    const s = migrateV1([{ symbol: 'TCS', addedAt: '2026-10-01T00:00:00Z' }])!;
    expect(s.lists[0].name).toBe('My watchlist');
    expect(s.lists[0].items).toEqual([{ symbol: 'TCS', addedAt: '2026-10-01T00:00:00Z' }]);
  });
  test('non-array → null', () => expect(migrateV1({ a: 1 })).toBeNull());
  test('drops entries without a symbol', () => expect(migrateV1([{ addedAt: 'x' }, { symbol: 'TCS', addedAt: 'x' }])!.lists[0].items).toHaveLength(1));
});

describe('validateName', () => {
  test('blank rejected', () => expect(validateName(S(), '   ').ok).toBe(false));
  test('25 chars rejected', () => expect(validateName(S(), 'x'.repeat(25)).ok).toBe(false));
  test('24 chars ok', () => expect(validateName(S(), 'x'.repeat(24)).ok).toBe(true));
  test('case-insensitive duplicate rejected', () => expect(validateName(S(), 'alpha', 'b').ok).toBe(false));
  test('own name allowed with exceptId', () => expect(validateName(S(), 'Alpha', 'a').ok).toBe(true));
  test('trims', () => expect(validateName(S(), '  Banks ')).toEqual({ ok: true, name: 'Banks' }));
});

describe('createList', () => {
  test('names Watchlist 2 then 3 and activates new list', () => {
    const s1 = createList(defaultState());
    expect(s1.lists[1].name).toBe('Watchlist 2');
    expect(s1.activeId).toBe(s1.lists[1].id);
    expect(createList(s1).lists[2].name).toBe('Watchlist 3');
  });
  test('no-op at max lists', () => {
    let s = defaultState();
    for (let i = 0; i < 10; i++) s = createList(s);
    expect(s.lists).toHaveLength(MAX_LISTS);
    expect(createList(s)).toBe(s);
  });
});

describe('renameList', () => {
  test('updates only the name', () => {
    const r = renameList(S(), 'b', 'Banks');
    expect(r.ok && r.state.lists[1]).toMatchObject({ id: 'b', name: 'Banks' });
  });
  test('invalid leaves state untouched', () => {
    const s = S();
    const r = renameList(s, 'b', 'alpha');
    expect(r.ok).toBe(false);
  });
});

describe('deleteList / restoreList', () => {
  test('last list cannot be deleted', () => expect(deleteList(defaultState(), defaultState().lists[0].id)).toBeNull());
  test('unknown id → null', () => expect(deleteList(S(), 'zzz')).toBeNull());
  test('deleting active middle list activates neighbor', () => {
    const r = deleteList(S(undefined, 'b'), 'b')!;
    expect(r.state.lists.map((l) => l.id)).toEqual(['a', 'c']);
    expect(r.state.activeId).toBe('c');
    expect(r.removed.index).toBe(1);
  });
  test('deleting active last list activates previous', () => expect(deleteList(S(undefined, 'c'), 'c')!.state.activeId).toBe('b'));
  test('deleting a non-active list keeps active', () => expect(deleteList(S(), 'c')!.state.activeId).toBe('a'));
  test('restore puts it back at its index and re-activates', () => {
    const r = deleteList(S(undefined, 'b'), 'b')!;
    const back = restoreList(r.state, r.removed);
    expect(back.lists.map((l) => l.id)).toEqual(['a', 'b', 'c']);
    expect(back.activeId).toBe('b');
  });
});

describe('symbols', () => {
  test('addSymbol idempotent, keeps original addedAt, case-insensitive', () => {
    const s1 = addSymbol(S(), 'a', 'TCS').state;
    const first = s1.lists[0].items[0].addedAt;
    const r = addSymbol(s1, 'a', 'tcs');
    expect(r.ok).toBe(true);
    expect(r.state.lists[0].items).toHaveLength(1);
    expect(r.state.lists[0].items[0].addedAt).toBe(first);
  });
  test('full list → ok:false', () => {
    const syms = Array.from({ length: 25 }, (_, i) => `S${i}`);
    expect(addSymbol(S([L('a', 'A', syms)]), 'a', 'EXTRA').ok).toBe(false);
  });
  test('removeSymbol reports index; unknown → no removed', () => {
    const s = S([L('a', 'A', ['X', 'Y', 'Z'])]);
    expect(removeSymbol(s, 'a', 'y').removed).toMatchObject({ index: 1 });
    expect(removeSymbol(s, 'a', 'NOPE').removed).toBeUndefined();
  });
  test('dropSymbolEverywhere', () => {
    const s = S([L('a', 'A', ['TCS', 'X']), L('b', 'B', ['tcs'])]);
    const d = dropSymbolEverywhere(s, 'TCS');
    expect(d.lists.flatMap((l) => l.items)).toHaveLength(1);
  });
});
