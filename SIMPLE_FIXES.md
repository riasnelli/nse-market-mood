# THREE SIMPLE FIXES NEEDED

## Problem Summary:
- Signals page has mood card (unwanted)
- Header title not changing
- Navigation using old style.setProperty instead of .hidden class

## Solution:

Will make ONLY these changes to working code from commit 9808ffc:

1. Add `id="headerTitle"` to header
2. Replace Signals page HTML (remove mood card, add AI sections)
3. Update showMoodView() to use .hidden and update title
4. Update showSignalsView() to use .hidden and update title
5. Add .hidden class to CSS

No other changes. Keep everything else exactly as is.
