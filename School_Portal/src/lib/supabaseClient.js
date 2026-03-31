import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = "https://odrrbazlehamooggsouv.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kcnJiYXpsZWhhbW9vZ2dzb3V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0OTE3ODEsImV4cCI6MjA4ODA2Nzc4MX0.o2hqPzmPDZvPAKyC2bCzVfBKI21cP1ZB78OIWRociow";
export const SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kcnJiYXpsZWhhbW9vZ2dzb3V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ5MTc4MSwiZXhwIjoyMDg4MDY3NzgxfQ.JmCPHQ3-EI9rggjHYQhoCi12fWz5f37ZyXLzHXUHa9w";
export const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/create-employee`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// READ (anon)
export async function rest(table, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${SUPABASE_ANON_KEY}`, "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`${table}: ${res.status}`);
  return res.json();
}

// WRITE (service role — bypasses RLS)
export async function insert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { "apikey": SUPABASE_SERVICE_KEY, "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation" },
    body: JSON.stringify(data),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Insert failed"); }
  return res.json();
}

export async function update(table, id, idField, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${idField}=eq.${id}`, {
    method: "PATCH",
    headers: { "apikey": SUPABASE_SERVICE_KEY, "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation" },
    body: JSON.stringify(data),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Update failed"); }
  return res.json();
}

export async function remove(table, id, idField) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${idField}=eq.${id}`, {
    method: "DELETE",
    headers: { "apikey": SUPABASE_SERVICE_KEY, "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Delete failed"); }
  return true;
}

// Get next available ID for tables without auto-increment
export async function nextId(table, idField) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${idField}&order=${idField}.desc&limit=1`, {
      headers: { "apikey": SUPABASE_SERVICE_KEY, "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`, "Accept": "application/json" },
    });
    if (!res.ok) return 1;
    const rows = await res.json();
    return rows.length > 0 ? (rows[0][idField] + 1) : 1;
  } catch { return 1; }
}

// ============================================================
// NAME DISPLAY HELPER FUNCTIONS (CORRECTED STRUCTURE)
// studentfirstname, studentfathersname, studentgrandfathersname, surname
// ============================================================

/**
 * Display student full name (all 4 name parts)
 * Format: FirstName FathersName GrandFathersName Surname
 * @param {Object} student - Student object
 * @param {string} language - 'ar' or 'en'
 * @returns {string} Formatted full name
 */
export function getStudentFullName(student, language = 'ar') {
  if (!student) return '';
  
  if (language === 'en') {
    const parts = [
      student.studentfirstname_en || '',
      student.studentfathersname_en || '',
      student.studentgrandfathersname_en || '',
      student.studentsurname_en || ''
    ].filter(Boolean);
    return parts.join(' ').trim();
  }
  
  const parts = [
    student.studentfirstname_ar || '',
    student.studentfathersname_ar || '',
    student.studentgrandfathersname_ar || '',
    student.studentsurname_ar || ''
  ].filter(Boolean);
  return parts.join(' ').trim();
}

/**
 * Display student first name only
 * @param {Object} student - Student object
 * @param {string} language - 'ar' or 'en'
 * @returns {string} Student first name
 */
export function getStudentFirstName(student, language = 'ar') {
  if (!student) return '';
  if (language === 'en') {
    return student.studentfirstname_en || '';
  }
  return student.studentfirstname_ar || '';
}

/**
 * Display parent name (single combined field)
 * @param {Object} student - Student object
 * @param {string} language - 'ar' or 'en'
 * @returns {string} Parent full name
 */
export function getParentName(student, language = 'ar') {
  if (!student) return '';
  if (language === 'en') {
    return student.parentname_en || '';
  }
  return student.parentname_ar || '';
}

/**
 * Display teacher/employee name in Arabic (primary) or English (fallback)
 * @param {Object} teacher - Teacher object
 * @param {string} language - 'ar' or 'en'
 * @returns {string} Formatted name
 */
export function getTeacherDisplayName(teacher, language = 'ar') {
  if (!teacher) return '';
  if (language === 'en') {
    return `${teacher.employeename_en || teacher.employeename || ''} ${teacher.employeelastname_en || ''}`.trim();
  }
  return `${teacher.employeename_ar || teacher.employeename || ''} ${teacher.employeelastname_ar || ''}`.trim();
}

/**
 * Display class name in Arabic (primary) or English (fallback)
 * @param {Object} cls - Class object
 * @param {string} language - 'ar' or 'en'
 * @returns {string} Class name
 */
export function getClassDisplayName(cls, language = 'ar') {
  if (!cls) return 'Class';
  if (language === 'en') {
    return cls.classname_en || cls.classname || 'Class';
  }
  return cls.classname || cls.classname_en || 'Class';
}
