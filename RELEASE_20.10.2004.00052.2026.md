# Vyapar AI 20.10.2004.00052.2026

- Apply one universal dark hierarchy across the app: background `#000000`, top/bottom chrome and all popup sheets `#121212`, main cards `#1A1A1A`, inner cards/inputs/buttons `#242424`, borders `#343434`, primary text `#FFFFFF`, secondary text `#A8A8A8`.
- Remove the remaining bluish-black surface drift from Home, Business, Sales, Stock, More, Settings and shared tool sheets. Active navigation/selection uses `#A50035`.
- Match the supplied three-dot sketch more closely: the selection menu expands from the top-right three-dot anchor and reverses back into it when closed.
- Opening the three-dot menu reveals the row-selection checkbox column. Closing it by tapping the trigger again, tapping outside, pressing Back/Escape, opening another menu, or the untouched 10-second idle timeout hides the checkbox column automatically.
- Preserve already-selected rows when the menu closes; only **Deselect all** clears selection. Existing delete/cancel confirmations and accounting safeguards remain unchanged.
- Keep the invisible 10-second idle behavior: interaction with the menu cancels the idle auto-close for that session.

Android versionCode: `2010200452`. Application ID and original signing identity are unchanged.

Validation is performed by the main Android GitHub Actions workflow before the APK/ZIP release is published.
