// Fetch EVERY row of a query, paging past Supabase's 1000-row response cap.
// Pass a factory that returns a fresh query builder each call. Always include a
// stable .order() (ideally on a unique column) so pages don't overlap or skip.
//
//   const eleves = await fetchAll(() =>
//     supabase.from('eleves').select('*').eq('actif', true).order('nom').order('id'));
export async function fetchAll(makeQuery, pageSize = 1000) {
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}
