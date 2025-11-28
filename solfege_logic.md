Solfege Trainer Interaction Logic
=================================

1. Display the melody first.
   - As soon as the round loads, render the notated melody (with the selected time signature) on the staff.
   - No audio plays yet; the learner visually studies the line before hearing anything.

2. Provide an in-tempo count-off.
   - Play (and optionally show) a metronomic count-off that matches the chosen meter/tempo so the learner internalizes the groove.
   - This is purely a prep; the answer still has not played.

3. Silent singing window.
   - After the count-off, keep the system silent for the exact span of the written melody, letting the learner sing it unaided while watching the notation.

4. Answer playback after singing.
   - Only once the silent window finishes do we play the original melody (audio plus any highlight animation) so the user can check their performance.

5. Self-assessment and advance.
   - Present the "nailed it / needs work" buttons once the playback ends, record the result, then immediately load the next melody and return to step 1.

This loop repeats for the 10-round session.
