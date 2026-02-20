# Alerts Queue Acceptance Test Plan

1. Open `/alerts` and verify queue data loads.
2. Click a row to open the drawer, then click `Acknowledge` (2-click acknowledge path).
3. Confirm acknowledged alert leaves Open tab and appears in Acknowledged tab.
4. Keep Open tab selected and verify refresh timestamps update roughly every 12 seconds.
5. Simulate offline mode and verify polling pauses while existing data remains visible.
6. Verify search/source/unseen/time filters narrow the list correctly.
7. Resize to mobile width and verify stacked alert card layout and accessible action buttons.
