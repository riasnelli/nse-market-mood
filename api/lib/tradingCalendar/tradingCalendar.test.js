const {
  isWeekend,
  isHoliday,
  isTradingDay,
  nextTradingDay,
  prevTradingDay,
  resolveSignalDates
} = require('./index');

// Test nextTradingDay with holiday
console.log('Testing nextTradingDay:');
const next1 = nextTradingDay('2025-12-24');
console.log('nextTradingDay("2025-12-24") =>', next1); // Should be '2025-12-26' (25 is holiday)
console.assert(next1 === '2025-12-26', `Expected 2025-12-26, got ${next1}`);

// Test prevTradingDay
console.log('\nTesting prevTradingDay:');
const prev1 = prevTradingDay('2025-12-26');
console.log('prevTradingDay("2025-12-26") =>', prev1); // Should be '2025-12-24'
console.assert(prev1 === '2025-12-24', `Expected 2025-12-24, got ${prev1}`);

// Test resolveSignalDates
console.log('\nTesting resolveSignalDates:');
const result = resolveSignalDates('2025-12-25');
console.log('resolveSignalDates("2025-12-25") =>', result);
console.assert(result.signalDate === '2025-12-26', `Expected signalDate 2025-12-26, got ${result.signalDate}`);
console.assert(result.refDate === '2025-12-24', `Expected refDate 2025-12-24, got ${result.refDate}`);

// Test isTradingDay
console.log('\nTesting isTradingDay:');
console.assert(!isTradingDay('2025-12-25'), '2025-12-25 should not be a trading day (holiday)');
console.assert(isTradingDay('2025-12-24'), '2025-12-24 should be a trading day');
console.assert(isTradingDay('2025-12-26'), '2025-12-26 should be a trading day');

// Test isHoliday
console.log('\nTesting isHoliday:');
console.assert(isHoliday('2025-12-25'), '2025-12-25 should be a holiday');
console.assert(!isHoliday('2025-12-24'), '2025-12-24 should not be a holiday');
console.assert(!isHoliday('2025-12-26'), '2025-12-26 should not be a holiday');

// Test isWeekend
console.log('\nTesting isWeekend:');
console.assert(isWeekend('2025-12-20'), '2025-12-20 (Saturday) should be weekend');
console.assert(isWeekend('2025-12-21'), '2025-12-21 (Sunday) should be weekend');
console.assert(!isWeekend('2025-12-24'), '2025-12-24 (Wednesday) should not be weekend');

console.log('\n✅ All tests passed!');

