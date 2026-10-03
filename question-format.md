# ToothQBank question data format (v1)

This is the format every course's questions are delivered in. The website should import these files as they are, without anyone editing them by hand.

## File
One JSON file per course batch, e.g. `gm1-pilot.json`.

```json
{
  "format_version": 1,
  "course": { "id": "gm1", "name": "General Medicine 1", "year": 3, "semester": 1 },
  "questions": [ ... ]
}
```

## Question fields

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Unique and stable, e.g. `GM1-007`. Re-imports update the question that has the same id. |
| `course_id` | string | Matches `course.id`. Access is unlocked per course. |
| `chapter` | string | Chapter name from the course chapter list. Used for filtering. |
| `lecture` | string | Lecture label as students know it, e.g. `Lecture 1 & 2`. |
| `category` | `past_paper` \| `quiz_midterm` \| `chapter` | The three sections of each course: past papers and quizzes/midterms are top priority, chapter questions are extra practice. |
| `exam_label` | string or null | e.g. `Final Spring 2021`, if known. Usually null. |
| `stem` | string | The question text. |
| `options` | array of `{key, text}` | Usually 4 options, keys `A`–`D`. Can be more or fewer. |
| `answer` | string | Key of the correct option. |
| `explanation` | string | Shown after answering (tutor mode) or on review (timed mode). |
| `answer_status` | `confirmed` \| `verified` \| `corrected` | Internal only, for quality tracking. Not shown to students. |
| `times_seen` | integer | How many times this question appeared across the source papers. Used for the "Seen in X papers" badge and the "most repeated first" sort. |
| `source_pages` | string | Internal reference to the source PDF. Not shown to students. |
| `images` | array of file names | Images for the stem (empty for now; Radiology will use this). |

## Notes for the build
- Questions with the same stem but different options are separate questions on purpose.
- Every question should have a "Report an error" button, and reports should appear in the admin dashboard.
