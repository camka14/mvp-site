export const xor = (a: unknown, b: unknown) => (a && !b) || (!a && b);

type VisitedMap = WeakMap<object, WeakMap<object, boolean>>;

const markVisited = (visited: VisitedMap, a: object, b: object) => {
  const entry = visited.get(a);
  if (entry) {
    entry.set(b, true);
  } else {
    const inner = new WeakMap<object, boolean>();
    inner.set(b, true);
    visited.set(a, inner);
  }
};

const wasVisited = (visited: VisitedMap, a: object, b: object) => visited.get(a)?.get(b) === true;

export const deepEqual = (a: unknown, b: unknown, visited: VisitedMap = new WeakMap()): boolean => {
  if (Object.is(a, b)) {
    return true;
  }

  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }

  const objectA = a as Record<string, unknown>;
  const objectB = b as Record<string, unknown>;

  if (wasVisited(visited, objectA, objectB)) {
    return true;
  }
  markVisited(visited, objectA, objectB);

  if (Array.isArray(objectA) || Array.isArray(objectB)) {
    if (!Array.isArray(objectA) || !Array.isArray(objectB) || objectA.length !== objectB.length) {
      return false;
    }
    for (let index = 0; index < objectA.length; index += 1) {
      if (!deepEqual(objectA[index], objectB[index], visited)) {
        return false;
      }
    }
    return true;
  }

  if (objectA instanceof Date || objectB instanceof Date) {
    if (!(objectA instanceof Date) || !(objectB instanceof Date)) {
      return false;
    }
    return objectA.getTime() === objectB.getTime();
  }

  const keysA = Object.keys(objectA);
  const keysB = Object.keys(objectB);
  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(objectB, key)) {
      return false;
    }
    if (!deepEqual(objectA[key], objectB[key], visited)) {
      return false;
    }
  }

  return true;
};
