import { supabase } from './supabaseClient';

const TEMPLATE_CONFIG = {
  employee_upload: {
    tables: ['employee_tbl', 'employees_types_tbl'],
    exclude: ['employeeid', 'auth_user_id', 'created_at', 'updated_at', 'schoolid', 'branchid'],
    fileName: 'employees_template.csv',
    preferredOrder: ['employeename', 'employeeemail', 'employeemobile', 'typeid']
  },
  student_upload: {
    tables: ['students_tbl', 'students_sections_classes_tbl'],
    exclude: ['studentid', 'auth_user_id', 'created_at', 'updated_at', 'schoolid', 'branchid', 'yearid', 'semisterid', 'notes'],
    fileName: 'students_template.csv',
    preferredOrder: ['studentname', 'studentemail', 'studentmobile', 'parentname', 'parentemail', 'parentmobile', 'parent_position', 'classid', 'sectionid', 'stageid', 'divisionid', 'curriculumid']
  },
  class_upload: {
    tables: ['classes_tbl', 'sections_classes_tbl', 'classes_stages_tbl'],
    exclude: ['classid', 'created_at', 'updated_at', 'schoolid', 'branchid', 'yearid', 'semisterid', 'notes'],
    fileName: 'classes_template.csv',
    preferredOrder: ['classname', 'sectionid', 'stageid', 'divisionid', 'curriculumid']
  },
  subject_upload: {
    tables: ['subjects_tbl'],
    exclude: ['subjectid', 'created_at', 'updated_at', 'schoolid', 'branchid', 'notes'],
    fileName: 'subjects_template.csv',
    preferredOrder: ['Subjectname_en', 'subjectname']
  }
};

function csvEscape(value) {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function getColumnsForTable(tableName) {
  const { data, error } = await supabase.rpc('get_table_columns', {
    p_table_name: tableName,
  });
  if (error) throw error;
  return (data || []).map((row) => row.column_name).filter(Boolean);
}

function orderColumns(columns, preferredOrder = []) {
  const preferred = preferredOrder.filter((name) => columns.includes(name));
  const remaining = columns.filter((name) => !preferred.includes(name));
  return [...preferred, ...remaining];
}

export async function downloadTemplate(configKeyOrTableName, overrideFileName = null) {
  const config = TEMPLATE_CONFIG[configKeyOrTableName]
    ? TEMPLATE_CONFIG[configKeyOrTableName]
    : { tables: [configKeyOrTableName], exclude: [], fileName: `${configKeyOrTableName}_template.csv`, preferredOrder: [] };

  const columnsByTable = await Promise.all(config.tables.map((table) => getColumnsForTable(table)));
  const excluded = new Set(config.exclude || []);
  const merged = [];

  columnsByTable.flat().forEach((column) => {
    if (!excluded.has(column) && !merged.includes(column)) merged.push(column);
  });

  const orderedColumns = orderColumns(merged, config.preferredOrder || []);
  if (!orderedColumns.length) throw new Error('No template columns found for this upload.');

  const csv = `${orderedColumns.map(csvEscape).join(',')}\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = overrideFileName || config.fileName || 'template.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
