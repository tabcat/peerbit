import { Entry } from './entry'
import { LamportClock as Clock } from './lamport-clock'
import { arraysCompare } from '@dao-xyz/peerbit-borsh-utils';

const First = (a: any, b: any) => a

export type ISortFunction = <T> (a: Entry<T>, b: Entry<T>, resolveConflict?: (a: Entry<T>, b: Entry<T>) => number) => number;
/**
 * Sort two entries as Last-Write-Wins (LWW).
 *
 * Last Write Wins is a conflict resolution strategy for sorting elements
 * where the element with a greater clock (latest) is chosen as the winner.
 *
 * @param {Entry} a First entry
 * @param {Entry} b Second entry
 * @returns {number} 1 if a is latest, -1 if b is latest
 */
export const LastWriteWins: ISortFunction = <T>(a: Entry<T>, b: Entry<T>) => {
  // Ultimate conflict resolution (take the first/left arg)
  // Sort two entries by their clock id, if the same always take the first
  const sortById = (a: Entry<T>, b: Entry<T>) => SortByClockId(a, b, First)
  // Sort two entries by their clock time, if concurrent,
  // determine sorting using provided conflict resolution function
  const sortByEntryClocks = (a: Entry<T>, b: Entry<T>) => SortByClocks(a, b, sortById)
  // Sort entries by clock time as the primary sort criteria
  return sortByEntryClocks(a, b)
}

/**
 * Sort two entries by their hash.
 *
 * @param {Entry} a First entry
 * @param {Entry} b Second entry
 * @returns {number} 1 if a is latest, -1 if b is latest
 */
export const SortByEntryHash: ISortFunction = (a, b) => {
  // Ultimate conflict resolution (compare hashes)
  const compareHash = (a: Entry<any>, b: Entry<any>) => a.hash < b.hash ? -1 : 1
  // Sort two entries by their clock id, if the same then compare hashes
  const sortById = (a: Entry<any>, b: Entry<any>) => SortByClockId(a, b, compareHash)
  // Sort two entries by their clock time, if concurrent,
  // determine sorting using provided conflict resolution function
  const sortByEntryClocks = (a: Entry<any>, b: Entry<any>) => SortByClocks(a, b, sortById)
  // Sort entries by clock time as the primary sort criteria
  return sortByEntryClocks(a, b)
}

/**
 * Sort two entries by their clock time.
 * @param {Entry} a First entry to compare
 * @param {Entry} b Second entry to compare
 * @param {function(a, b)} resolveConflict A function to call if entries are concurrent (happened at the same time). The function should take in two entries and return 1 if the first entry should be chosen and -1 if the second entry should be chosen.
 * @returns {number} 1 if a is greater, -1 if b is greater
 */
export const SortByClocks: ISortFunction = <T>(a: Entry<T>, b: Entry<T>, resolveConflict?: (a: Entry<any>, b: Entry<any>) => number) => {
  // Compare the clocks
  const diff = Clock.compare(a.clock, b.clock)
  // If the clocks are concurrent, use the provided
  // conflict resolution function to determine which comes first
  return diff === 0 ? (resolveConflict || First)(a, b) : diff
}

/**
 * Sort two entries by their clock id.
 * @param {Entry} a First entry to compare
 * @param {Entry} b Second entry to compare
 * @param {function(a, b)} resolveConflict A function to call if the clocks ids are the same. The function should take in two entries and return 1 if the first entry should be chosen and -1 if the second entry should be chosen.
 * @returns {number} 1 if a is greater, -1 if b is greater
 */
export const SortByClockId: ISortFunction = (a, b, resolveConflict) => {
  // Sort by ID if clocks are concurrent,
  // take the entry with a "greater" clock id
  const clockCompare = arraysCompare(a.clock.id, b.clock.id);
  return clockCompare === 0 ?
    (resolveConflict || First)(a, b)
    : clockCompare
}

/**
 * A wrapper function to throw an error if the results of a passed function return zero
 * @param {function(a, b)} [tiebreaker] The tiebreaker function to validate.
 * @returns {function(a, b)} 1 if a is greater, -1 if b is greater
 * @throws {Error} if func ever returns 0
 */
export const NoZeroes = (func: ISortFunction) => {
  const msg = `Your log's tiebreaker function, ${func.name}, has returned zero and therefore cannot be`

  const comparator = <T>(a: Entry<T>, b: Entry<T>) => {
    // Validate by calling the function
    const result = func(a, b, (a, b) => -1)
    if (result === 0) { throw Error(msg) }
    return result
  }

  return comparator
}