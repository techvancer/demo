# 🚀 School Portal v41 – 15 Changes Applied

## Summary of All Changes

### Change 1 – Dashboard Filters Extended
All three dashboards (Teacher, Supervisor, Admin) now include **Curriculum**, **Division**, and **Branch** as additional filter fields, ordered by importance. All filters remain fully functional and drive chart/stat updates.

### Change 2 – "Grade" → "Classes"
Every occurrence of the word **"Grade"** as a display label across the entire application has been replaced with **"Classes"** — in table headers, badges, filter labels, dropdown options, stat cards, chart axis labels, and modal text.

### Change 3 – Dashboard Summary Cards (7 Cards)
All three dashboards now show **7 stat cards** in this exact order:
1. Total Students
2. My Classes
3. My Sections *(new — shows count of sections)*
4. My Subjects *(new — shows count of subjects)*
5. Exams
6. Attendance *(Coming Soon)*
7. Schedule *(Coming Soon)*

Cards are clickable and navigate to the relevant page.

### Change 4 – Charts Respond to Filters
All charts on all dashboards update dynamically based on the full filter selection including the new Curriculum, Division, and Branch fields.

### Change 5 – Chart Subtext Removed
All subtitle/description text beneath chart titles has been removed across all three dashboards. Titles remain intact.

### Change 6 – Charts Filtered by Class
Charts use Class as the primary filter dimension, with Section as secondary. Existing filtering logic preserved and extended.

### Change 7 – "Mark Distribution" Rename
The donut/ring chart previously labelled **"Grade Distribution"** is now labelled **"Mark Distribution"** across all three dashboards.

### Change 8 – "inprogress" Status Fix
All occurrences of the status value `in_progress` (with underscore or space) have been unified to `inprogress` (one word, no separator) — in status keys, style maps, conditionals, and display labels.

### Change 9 – My Classes Page: Curriculum Column
The **My Classes** page now fetches and displays the `curriculumid` column from the assignment table, looking up the curriculum name from `curriculums_tbl`. The column header is labelled **"Curriculum"**. The Exam Status column shows `new`, `inprogress`, or `completed` pulled live from the database.

### Change 10 – Previous Marks Page Redesign
The Previous Marks tab inside My Classes now shows:
- Summary cards: Total Questions, Students, Class Average, Pass Rate
- Per-student score in **"X / Total"** format (e.g. `7 / 10`)
- A visual progress bar showing percentage
- Students sorted by score descending
- Grade badges (A/B/C/F)

### Change 11 – Students Page Filters Extended
The Teacher Students page now includes **Curriculum**, **Division**, and **Branch** filter fields in addition to the existing filters. Results filter by all applied criteria.

### Change 12 – Edit Marks Page Filters Extended
The Edit Marks page now includes four new filter fields: **Curriculum**, **Division**, **Branch** (optional secondary filters), and **Section** (already present as a required selector). All four original selectors (Classes, Section, Subject, Exam) are retained and required.

### Change 13 – Required Field Validation
The `FilterBar` component now supports a `required` prop on individual filter fields. Required fields show a **red asterisk (\*)**, turn **red when empty** on Apply, and an error banner appears. Applied to: Exams (Classes required), Students (Classes required), EditMarks (Classes/Section/Subject/Exam all required), Videos (Classes + Section required).

### Change 14 – Videos Page: Unlock Button
Rows where the exam is **completed** now show a **Lock icon + Unlock button** instead of just "Locked". Clicking Unlock allows editing the video URL. After saving, the row re-locks automatically. A Lock button appears on unlocked rows to re-lock without saving.

### Change 15 – Student Full Name (3 Fields)
Everywhere student names appear in the application — tables, cards, avatars, dropdowns, search, reports — the name is now assembled from **three database fields**:
- English: `studentfirstname_en + studentfathersname_en + studentsurname_en`
- Arabic: `studentfirstname_ar + studentfathersname_ar + studentsurname_ar`
Falls back to `studentname` if the new fields are empty.

---

**Version:** v41  
**Status:** Production Ready 🚀  
**Base:** Built on School Portal v40
