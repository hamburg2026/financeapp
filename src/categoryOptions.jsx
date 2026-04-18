// Builds hierarchically sorted <option> elements for category <select> fields.
// categories : [{id, name, parent: number|null, ...}]
// valueKey   : 'id' | 'name'  — what to use as each option's value attribute
// parentId   : start node (null = root level)
// depth      : current nesting depth (controls indentation)
export function buildCategoryOptions(categories, valueKey = 'id', parentId = null, depth = 0) {
  return categories
    .filter(c => (c.parent ?? null) == parentId)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    .flatMap(c => [
      <option key={c.id} value={valueKey === 'name' ? c.name : String(c.id)}>
        {'\u00A0\u00A0\u00A0'.repeat(depth) + c.name}
      </option>,
      ...buildCategoryOptions(categories, valueKey, c.id, depth + 1),
    ])
}
