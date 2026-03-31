/**
 * useFilterData — role-scoped filter dropdown data.
 * Change 2: Always returns data in hierarchy order:
 * Curriculum → Division → Branch → Stage → Class → Section → Subject → Exam → Semester
 */
import { useState, useEffect } from 'react';
import { rest } from './supabaseClient';
import { t, getField } from './langHelper';

export function useFilterData(user, lang) {
    const [data, setData] = useState({
        curriculums: [], divisions: [],
        stages: [], classes: [], sections: [], subjects: [],
        exams: [], semisters: [], types: [], employees: [], students: []
    });

    useEffect(() => {
        if (!user) return;
        (async () => {
            try {
                const role = user.role;
                const eid  = user.employeeid;
                const sid  = user.schoolid;
                const bid  = user.branchid;

                const uniq = (arr, key) => [...new Map(arr.map(r => [r[key], r])).values()];
                const opt  = (label) => [{ value: 'All', label }];

                // Always fetch shared lookup tables
                const [examTbl, semTbl, typesTbl, divTbl, curTbl] = await Promise.all([
                    rest('exams_tbl', { select: 'examid,examname_en,examname' }),
                    rest('semisters_tbl', { select: 'semisterid,semistername_en,semistername,yearid' }),
                    rest('types_tbl', { select: 'typeid,typename_en,typename' }),
                    rest('divisions_tbl', { schoolid: `eq.${sid}`, branchid: `eq.${bid}`, select: 'divisionid,divisionname_en,divisionname' }).catch(() => []),
                    rest('curriculums_tbl', { schoolid: `eq.${sid}`, branchid: `eq.${bid}`, select: 'curriculumid,curriculumname_en,curriculumname' }).catch(() => []),
                ]);

                const divOptions = [...opt(t('allDivisions', lang)),   ...uniq(divTbl || [], 'divisionid').map(r => ({ value: String(r.divisionid),   label: getField(r, 'divisionname', 'divisionname_en', lang)   || `Division ${r.divisionid}` }))];
                const curOptions = [...opt(t('allCurriculums', lang)), ...uniq(curTbl || [], 'curriculumid').map(r => ({ value: String(r.curriculumid), label: getField(r, 'curriculumname', 'curriculumname_en', lang) || `Curriculum ${r.curriculumid}` }))];

                // ── TEACHER ──────────────────────────────────────────────
                if (role === 'Teacher') {
                    const assignments = await rest(
                        'employees_sections_subjects_classes_semisters_curriculums_tbl',
                        { employeeid: `eq.${eid}`, schoolid: `eq.${sid}`, branchid: `eq.${bid}`, select: 'classid,sectionid,subjectid,stageid,semisterid,curriculumid,divisionid' }
                    );

                    const classIds   = [...new Set(assignments.map(a => a.classid))];
                    const sectionIds = [...new Set(assignments.map(a => a.sectionid))];
                    const subjectIds = [...new Set(assignments.map(a => a.subjectid))];
                    const stageIds   = [...new Set(assignments.map(a => a.stageid))];
                    const semIds     = [...new Set(assignments.map(a => a.semisterid))];

                    const [clRows, secRows, subRows, stageRows] = await Promise.all([
                        classIds.length   ? rest('classes_tbl',  { classid:   `in.(${classIds})`,   select: 'classid,classname_en,classname' }) : [],
                        sectionIds.length ? rest('sections_tbl', { sectionid: `in.(${sectionIds})`, select: 'sectionid,sectionname_en,sectionname' }) : [],
                        subjectIds.length ? rest('subjects_tbl', { subjectid: `in.(${subjectIds})`, select: 'subjectid,Subjectname_en,subjectname' }) : [],
                        stageIds.length   ? rest('stages_tbl',   { stageid:   `in.(${stageIds})`,   select: 'stageid,stagename_en,stagename' }) : [],
                    ]);

                    const filteredSems = semTbl.filter(s => semIds.includes(s.semisterid));

                    // Scope curriculums and divisions to only what this teacher is assigned to
                    const teacherCurIds = [...new Set(assignments.map(a => a.curriculumid).filter(Boolean))];
                    const teacherDivIds = [...new Set(assignments.map(a => a.divisionid).filter(Boolean))];
                    const teacherCurOptions = [...opt(t('allCurriculums', lang)), ...(curTbl || []).filter(r => teacherCurIds.includes(r.curriculumid)).map(r => ({ value: String(r.curriculumid), label: getField(r, 'curriculumname', 'curriculumname_en', lang) || `Curriculum ${r.curriculumid}` }))];
                    const teacherDivOptions = [...opt(t('allDivisions', lang)),   ...(divTbl || []).filter(r => teacherDivIds.includes(r.divisionid)).map(r => ({ value: String(r.divisionid),   label: getField(r, 'divisionname', 'divisionname_en', lang)   || `Division ${r.divisionid}` }))];

                    setData({
                        curriculums: teacherCurOptions,
                        divisions:   teacherDivOptions,
                        stages:   [...opt(t('allStages', lang)),    ...uniq(stageRows, 'stageid').map(r   => ({ value: String(r.stageid),   label: getField(r, 'stagename', 'stagename_en', lang) }))],
                        classes:  [...opt(t('allClasses', lang)),   ...uniq(clRows,    'classid').map(r   => ({ value: String(r.classid),   label: getField(r, 'classname', 'classname_en', lang) }))],
                        sections: [...opt(t('allSections', lang)),  ...uniq(secRows,   'sectionid').map(r => ({ value: String(r.sectionid), label: getField(r, 'sectionname', 'sectionname_en', lang) }))],
                        subjects: [...opt(t('allSubjects', lang)),  ...uniq(subRows,   'subjectid').map(r => ({ value: String(r.subjectid), label: getField(r, 'subjectname', 'Subjectname_en', lang) }))],
                        exams:    [...opt(t('allExams', lang)),     ...examTbl.map(r => ({ value: String(r.examid), label: getField(r, 'examname', 'examname_en', lang) }))],
                        semisters:[...opt(t('allSemesters', lang)), ...uniq(filteredSems.length ? filteredSems : semTbl, 'semisterid').map(r => ({ value: String(r.semisterid), label: getField(r, 'semistername', 'semistername_en', lang) }))],
                        types:    [...opt(t('allTypes', lang) || 'All Types'),     ...typesTbl.map(r => ({ value: String(r.typeid), label: getField(r, 'typename', 'typename_en', lang) }))],
                        employees:[{ value: 'All', label: t('allEmployees', lang) }, { value: String(eid), label: user.name }],
                        students: [...opt(t('allStudents', lang))],
                    });
                    return;
                }

                // ── SUPERVISOR ───────────────────────────────────────────
                if (role === 'Supervisor') {
                    const supStages = await rest('employees_types_stages_tbl', { employeeid: `eq.${eid}`, schoolid: `eq.${sid}`, branchid: `eq.${bid}`, select: 'stageid' });
                    const stageIds  = [...new Set((supStages || []).map(s => s.stageid))];

                    const classStages = stageIds.length
                        ? await rest('classes_stages_tbl', { stageid: `in.(${stageIds})`, schoolid: `eq.${sid}`, branchid: `eq.${bid}`, select: 'classid,stageid' }) : [];
                    const classIds = [...new Set((classStages || []).map(r => r.classid))];

                    const assignedClasses = classIds.length
                        ? await rest('employees_sections_subjects_classes_semisters_curriculums_tbl', {
                            classid: `in.(${classIds})`, schoolid: `eq.${sid}`, branchid: `eq.${bid}`,
                            select: 'classid,sectionid,subjectid,semisterid,employeeid,curriculumid,divisionid'
                          })
                        : [];

                    const activeClassIds   = [...new Set(assignedClasses.map(r => r.classid))];
                    const activeSectionIds = [...new Set(assignedClasses.map(r => r.sectionid))];
                    const activeSubjectIds = [...new Set(assignedClasses.map(r => r.subjectid))];
                    const activeSemIds     = [...new Set(assignedClasses.map(r => r.semisterid))];
                    const activeEmpIds     = [...new Set(assignedClasses.map(r => r.employeeid))];

                    const [clRows, secRows, subNames, stageRows, empNames] = await Promise.all([
                        activeClassIds.length   ? rest('classes_tbl',  { classid:   `in.(${activeClassIds})`,   select: 'classid,classname_en,classname' }) : [],
                        activeSectionIds.length ? rest('sections_tbl', { sectionid: `in.(${activeSectionIds})`, select: 'sectionid,sectionname_en,sectionname' }) : [],
                        activeSubjectIds.length ? rest('subjects_tbl', { subjectid: `in.(${activeSubjectIds})`, select: 'subjectid,Subjectname_en,subjectname' }) : [],
                        stageIds.length         ? rest('stages_tbl',   { stageid:   `in.(${stageIds})`,         select: 'stageid,stagename_en,stagename' }) : [],
                        activeEmpIds.length     ? rest('employee_tbl', { employeeid:`in.(${activeEmpIds})`,     select: 'employeeid,employeename_en,employeename' }) : [],
                    ]);

                    const filteredSems = semTbl.filter(s => activeSemIds.includes(s.semisterid));

                    setData({
                        curriculums: curOptions,
                        divisions:   divOptions,
                        stages:   [...opt(t('allStages', lang)),    ...uniq(stageRows, 'stageid').map(r   => ({ value: String(r.stageid),   label: getField(r, 'stagename', 'stagename_en', lang) }))],
                        classes:  [...opt(t('allClasses', lang)),   ...uniq(clRows,   'classid').map(r   => ({ value: String(r.classid),   label: getField(r, 'classname', 'classname_en', lang) }))],
                        sections: [...opt(t('allSections', lang)),  ...uniq(secRows,  'sectionid').map(r => ({ value: String(r.sectionid), label: getField(r, 'sectionname', 'sectionname_en', lang) }))],
                        subjects: [...opt(t('allSubjects', lang)),  ...uniq(subNames, 'subjectid').map(r => ({ value: String(r.subjectid), label: getField(r, 'subjectname', 'Subjectname_en', lang) }))],
                        employees:[...opt(t('allEmployees', lang)), ...uniq(empNames, 'employeeid').map(r => ({ value: String(r.employeeid), label: getField(r, 'employeename', 'employeename_en', lang) }))],
                        exams:    [...opt(t('allExams', lang)),     ...examTbl.map(r => ({ value: String(r.examid), label: getField(r, 'examname', 'examname_en', lang) }))],
                        semisters:[...opt(t('allSemesters', lang)), ...uniq(filteredSems.length ? filteredSems : semTbl, 'semisterid').map(r => ({ value: String(r.semisterid), label: getField(r, 'semistername', 'semistername_en', lang) }))],
                        types:    [...opt(t('allTypes', lang) || 'All Types'),     ...typesTbl.map(r => ({ value: String(r.typeid), label: getField(r, 'typename', 'typename_en', lang) }))],
                        students: [...opt(t('allStudents', lang))],
                    });
                    return;
                }

                // ── ADMIN / GM ───────────────────────────────────────────
                const [assignRows, stuScRows, stageTbl, subTbl, empTbl, teacherTypes] = await Promise.all([
                    rest('employees_sections_subjects_classes_semisters_curriculums_tbl', {
                        schoolid: `eq.${sid}`, branchid: `eq.${bid}`,
                        select: 'classid,sectionid,subjectid,stageid,semisterid,employeeid,curriculumid,divisionid'
                    }),
                    rest('students_sections_classes_tbl', {
                        schoolid: `eq.${sid}`, branchid: `eq.${bid}`,
                        select: 'classid,sectionid,stageid'
                    }),
                    rest('stages_tbl', { schoolid: `eq.${sid}`, branchid: `eq.${bid}`, select: 'stageid,stagename_en,stagename' }),
                    rest('subjects_tbl', { select: 'subjectid,Subjectname_en,subjectname' }),
                    rest('employee_tbl', { schoolid: `eq.${sid}`, branchid: `eq.${bid}`, select: 'employeeid,employeename_en,employeename' }),
                    rest('employees_types_tbl', { typeid: 'eq.1', select: 'employeeid' }),
                ]);

                const activeClassIds   = [...new Set([...assignRows.map(r => r.classid),   ...stuScRows.map(r => r.classid)])];
                const activeSectionIds = [...new Set([...assignRows.map(r => r.sectionid), ...stuScRows.map(r => r.sectionid)])];
                const activeStageIds   = [...new Set([...assignRows.map(r => r.stageid),   ...stuScRows.map(r => r.stageid)].filter(Boolean))];
                const activeSemIds     = [...new Set(assignRows.map(r => r.semisterid).filter(Boolean))];

                const [clRows, secRows] = await Promise.all([
                    activeClassIds.length   ? rest('classes_tbl',  { classid:   `in.(${activeClassIds})`,   select: 'classid,classname_en,classname' }) : [],
                    activeSectionIds.length ? rest('sections_tbl', { sectionid: `in.(${activeSectionIds})`, select: 'sectionid,sectionname_en,sectionname' }) : [],
                ]);

                const activeStages = uniq((stageTbl || []).filter(r => activeStageIds.includes(r.stageid)), 'stageid');
                const filteredSems = semTbl.filter(s => activeSemIds.includes(s.semisterid));

                setData({
                    curriculums: curOptions,
                    divisions:   divOptions,
                    stages:   [...opt(t('allStages', lang)),    ...activeStages.map(r               => ({ value: String(r.stageid),   label: getField(r, 'stagename', 'stagename_en', lang) }))],
                    classes:  [...opt(t('allClasses', lang)),   ...uniq(clRows,  'classid').map(r   => ({ value: String(r.classid),   label: getField(r, 'classname', 'classname_en', lang) }))],
                    sections: [...opt(t('allSections', lang)),  ...uniq(secRows, 'sectionid').map(r => ({ value: String(r.sectionid), label: getField(r, 'sectionname', 'sectionname_en', lang) }))],
                    subjects: [...opt(t('allSubjects', lang)),  ...subTbl.map(r                    => ({ value: String(r.subjectid), label: getField(r, 'subjectname', 'Subjectname_en', lang) }))],
                    exams:    [...opt(t('allExams', lang)),     ...examTbl.map(r                   => ({ value: String(r.examid),    label: getField(r, 'examname', 'examname_en', lang) }))],
                    semisters:[...opt(t('allSemesters', lang)), ...uniq(filteredSems.length ? filteredSems : semTbl, 'semisterid').map(r => ({ value: String(r.semisterid), label: getField(r, 'semistername', 'semistername_en', lang) }))],
                    types:    [...opt(t('allTypes', lang) || 'All Types'),     ...typesTbl.map(r                  => ({ value: String(r.typeid),    label: getField(r, 'typename', 'typename_en', lang) }))],
                    employees:[...opt(t('teachers', lang) || 'All Teachers'), ...empTbl.filter(e => (teacherTypes||[]).some(t => t.employeeid === e.employeeid)).map(r => ({ value: String(r.employeeid), label: getField(r, 'employeename', 'employeename_en', lang) }))],
                    students: [...opt(t('allStudents', lang))],
                });
            } catch (e) {
                console.error('useFilterData error:', e);
            }
        })();
    }, [user?.employeeid, user?.role, user?.schoolid, user?.branchid, lang]);

    return data;
}
