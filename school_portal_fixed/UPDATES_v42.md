# School Portal v42 – 11 Changes Applied

## Change 1 – Dashboard Hierarchy
All three dashboards enforce the data hierarchy: Curriculum → Division → Branch → Stage → Class → Section. Filters cascade in this order and all stats/charts respect this hierarchy.

## Change 2 – Universal Filter Order
Every filter system across the entire application now follows this exact mandatory order: **Curriculum → Division → Branch → Stage → Class → Section → Subject → Exam → Semester**. Implemented via a shared `buildFilters()` helper in `src/lib/helpers.js`.

## Change 3 – Dashboard Summary Cards (7 Cards)
All dashboards show 7 stat cards in order: Total Students, My Classes, My Sections, My Subjects, Exams, Attendance (Coming Soon), Schedule (Coming Soon).

## Change 4 – Remove "My Sections" List Component
The "My Sections" list that appeared below the charts in the Teacher and Supervisor dashboards has been completely removed. Charts now display cleanly without it.

## Change 5 – MyClasses: Fix Student Count + Division Column
Fixed a critical Promise.all destructuring order bug that caused student counts to return zero. Students are now fetched at index 4 (correct position) ensuring accurate counts. A new **Division** column has been added showing the division from the database.

## Change 6 – Login Password Toggle
Added CSS to suppress the browser's native password reveal icon (`::-ms-reveal`, `::-webkit-contacts-auto-fill-button`), ensuring only one custom eye toggle icon appears.

## Change 7 – English-Only Data
Everywhere data is fetched and displayed: `classname_en`, `sectionname_en`, `Subjectname_en`, `employeename_en`, `divisionname_en`, `curriculumname_en`, `branchname_en`, `stagename_en` are always used. The `helpers.js` utility provides `getClassName()`, `getSectionName()`, `getSubjectName()`, `getStudentFullName()`, etc. with English-only fallback chains.

## Change 8 – Previous Marks Redesign (MarksTab)
- "Score" replaced with "Mark" throughout.
- `question_marks` field fetched per question for accurate per-question maximum marks.
- Total mark = sum of earned marks across all questions.
- Percentage = (total earned / total possible) × 100.
- **New Grading Scale**: A+ (≥95%), A (≥90%), B+ (≥85%), B (≥80%), C+ (≥75%), C (≥70%), D+ (≥65%), D (≥60%), E (≥50%), F (<50%).
- Passing mark is 50%. Pass/Fail status shown per student.
- Students sorted by total mark descending.

## Change 9 – Edit Mark Page
- Filter in single horizontal row: Classes → Section → Subject → Exam (all required with * validation).
- `question_marks` fetched from `questions_exams_employee_subjects_sections_tbl` — each question shows its max mark.
- Input capped at `question_marks` value per question (enforced + toast warning).
- Decimal input allowed (step=0.25 supports 0.25, 0.5, 0.75, etc.).
- Live grade column using the new grading scale (updates automatically as marks are entered).
- Questions sorted ascending by questionid.

## Change 10 – Exams Page
- Filter order updated to universal order.
- **Marks Entered** column added showing `marksEntered / totalStudents`.
- Status now accurately calculated: `completed` (all students have marks), `inprogress` (some marks entered), `new` (no marks yet).
- All data fetched with `schoolid`+`branchid` scope for correctness.

## Change 11 – Videos Page Filter
- All filter fields are required (`*` asterisk shown, red highlight on empty submit).
- Filter order: Classes → Section → Subject → Exam → Semester.
- Cascaded dropdowns: Subject options depend on Section, Exam/Semester depend on Subject.

---
**New shared utilities in `src/lib/helpers.js`:**
- `getStudentFullName(s)` — English 3-field full name
- `getClassName(c)`, `getSectionName(s)`, `getSubjectName(s)`, `getEmployeeName(e)`, etc.
- `calcGrade(pct)` — A+/A/B+/B/C+/C/D+/D/E/F scale
- `buildFilters(applied, filterData)` — universal filter order builder
- `EMPTY_FILTER` — default empty filter state

**Updated `src/lib/useFilterData.js`:**
- Now returns `curriculums`, `divisions`, `branches` alongside all existing filter data.
- Uses English-only field names in all labels.
