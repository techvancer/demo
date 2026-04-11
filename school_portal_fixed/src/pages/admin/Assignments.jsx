import { t, getField, getStudentName as _getStudentName } from '../../lib/langHelper';
import { useLang } from '../../context/LanguageContext';
import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, X, Loader2, User, BookOpen, Layers, Shield, CheckCircle2, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { rest, insert, update, SUPABASE_URL, SUPABASE_SERVICE_KEY } from '../../lib/supabaseClient';

export default function AdminAssignments() {
    const { lang, isAr } = useLang();

    const { addToast } = useToast();
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('students');
    const [loading, setLoading] = useState(true);
    const [addingNew, setAddingNew] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [editingRow, setEditingRow] = useState(null);
    const [editForm, setEditForm] = useState({});

    const [students, setStudents] = useState([]);
    const [classes, setClasses] = useState([]);
    const [sections, setSections] = useState([]);
    const [stages, setStages] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [employees, setEmployees] = useState({ all: [], teachers: [], supervisors: [] });
    const [assignments, setAssignments] = useState({ students: [], subjects: [], supervisors: [], teachers: [] });
    const [newRow, setNewRow] = useState({});

    const fetchData = useCallback(async () => {
        if (!user) return;
        try {
            setLoading(true);
            const [clRows, clTbl, secRows, stgRows, subRows, empRows, stuRows,
                stuScRows, subClRows, empStgRows, empTchRows, empTypesRows] = await Promise.all([
                rest('sections_classes_tbl', { schoolid: `eq.${user.schoolid}`, branchid: `eq.${user.branchid}`, select: '*' }),
                rest('classes_tbl', { select: '*' }),
                rest('sections_tbl', { select: '*' }),
                rest('stages_tbl', { schoolid: `eq.${user.schoolid}`, branchid: `eq.${user.branchid}`, select: '*' }),
                rest('subjects_tbl', { select: '*' }),
                rest('employee_tbl', { schoolid: `eq.${user.schoolid}`, branchid: `eq.${user.branchid}`, select: '*' }),
                rest('students_tbl', { select: '*' }),
                rest('students_sections_classes_tbl', { schoolid: `eq.${user.schoolid}`, branchid: `eq.${user.branchid}`, select: '*' }),
                rest('sections_subjects_classes_tbl', { schoolid: `eq.${user.schoolid}`, branchid: `eq.${user.branchid}`, select: '*' }),
                rest('employees_types_stages_tbl', { schoolid: `eq.${user.schoolid}`, branchid: `eq.${user.branchid}`, select: '*' }),
                rest('employees_sections_subjects_classes_semisters_curriculums_tbl', { select: '*' }),
                rest('employees_types_tbl', { select: '*' }),
            ]);

            setStudents(stuRows);
            setClasses(clTbl);
            setSections(secRows);
            setStages([...new Map(stgRows.map(s => [s.stageid, s])).values()]);
            setSubjects(subRows);

            const teacherIds = new Set(empTypesRows.filter(t => t.typeid === 1).map(t => t.employeeid));
            const supervisorIds = new Set(empTypesRows.filter(t => t.typeid === 2).map(t => t.employeeid));
            setEmployees({ all: empRows, teachers: empRows.filter(e => teacherIds.has(e.employeeid)), supervisors: empRows.filter(e => supervisorIds.has(e.employeeid)) });

            const stuAssignments = stuScRows.map(sc => {
                const stu = stuRows.find(s => s.studentid === sc.studentid);
                const cl  = clTbl.find(c => c.classid === sc.classid);
                const sec = secRows.find(s => s.sectionid === sc.sectionid);
                const stg = stgRows.find(s => s.stageid === sc.stageid);
                return { ...sc, studentName: _getStudentName(stu, lang), classname: getField(cl, 'classname', 'classname_en', lang) || cl?.classname, sectionname: getField(sec, 'sectionname', 'sectionname_en', lang) || sec?.sectionname, stageName: getField(stg, 'stagename', 'stagename_en', lang) };
            });

            const subAssignments = subClRows.map(sc => {
                const sub = subRows.find(s => s.subjectid === sc.subjectid);
                const cl = clTbl.find(c => c.classid === sc.classid);
                const sec = secRows.find(s => s.sectionid === sc.sectionid);
                return { ...sc, subjectName: getField(sub, 'subjectname', 'Subjectname_en', lang), classname: getField(cl, 'classname', 'classname_en', lang) || cl?.classname, sectionname: getField(sec, 'sectionname', 'sectionname_en', lang) || sec?.sectionname };
            });

            const supAssignments = empStgRows.map(row => {
                const emp = empRows.find(e => e.employeeid === row.employeeid);
                const stg = stgRows.find(s => s.stageid === row.stageid);
                return { ...row, empName: getField(emp, 'employeename', 'employeename_en', lang) || emp?.employeename, stageName: getField(stg, 'stagename', 'stagename_en', lang) };
            });

            const tchAssignments = empTchRows.map(row => {
                const emp = empRows.find(e => e.employeeid === row.employeeid);
                const sub = subRows.find(s => s.subjectid === row.subjectid);
                const cl = clTbl.find(c => c.classid === row.classid);
                const sec = secRows.find(s => s.sectionid === row.sectionid);
                return { ...row, empName: getField(emp, 'employeename', 'employeename_en', lang) || emp?.employeename, subjectName: getField(sub, 'subjectname', 'Subjectname_en', lang), classname: getField(cl, 'classname', 'classname_en', lang) || cl?.classname, sectionname: getField(sec, 'sectionname', 'sectionname_en', lang) || sec?.sectionname };
            });

            setAssignments({ students: stuAssignments, subjects: subAssignments, supervisors: supAssignments, teachers: tchAssignments });
        } catch (e) { addToast(e.message, 'error'); }
        finally { setLoading(false); }
    }, [user]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const tabs = [
        { id: 'students', label: t('studentsToClasses', lang), icon: User },
        { id: 'subjects', label: t('subjectsToClasses', lang), icon: BookOpen },
        { id: 'supervisors', label: t('supervisorsToStages', lang), icon: Shield },
        { id: 'teachers', label: t('teachersToClasses', lang), icon: Layers },
    ];

    // Subject → class assignment: must insert into 3 tables in order
    const assignSubjectToClass = async (subjectid, classid, sectionid, stageid) => {
        const div = user.divisionid || 1, cur = user.curriculumid || 1;

        // Look up the correct stageid from classes_stages_tbl to satisfy FK fk_subjectclass_classstage.
        // The dropdown stageid may not match the exact row in classes_stages_tbl for this class.
        const classStageRows = await rest('classes_stages_tbl', {
            classid: `eq.${classid}`,
            schoolid: `eq.${user.schoolid}`,
            branchid: `eq.${user.branchid}`,
            select: 'stageid,curriculumid,divisionid',
        });
        if (!classStageRows.length) throw new Error('This class has no stage linked in classes_stages_tbl. Please set up the class first.');
        // Use the first matching row; prefer the one matching the selected stageid if available
        const classStage = classStageRows.find(r => r.stageid === stageid) || classStageRows[0];
        const resolvedStageid = classStage.stageid;
        const resolvedCur = classStage.curriculumid || cur;
        const resolvedDiv = classStage.divisionid || div;

        const sc = { subjectid, classid, stageid: resolvedStageid, curriculumid: resolvedCur, divisionid: resolvedDiv, branchid: user.branchid, schoolid: user.schoolid };

        // 1. subjects_classes_tbl
        const existsSC = await rest('subjects_classes_tbl', { subjectid: `eq.${subjectid}`, classid: `eq.${classid}`, schoolid: `eq.${user.schoolid}`, select: 'subjectid' });
        if (!existsSC.length) await insert('subjects_classes_tbl', sc);
        // 2. subjects_classes_semisters_curriculums_tbl
        const existsSCS = await rest('subjects_classes_semisters_curriculums_tbl', { subjectid: `eq.${subjectid}`, classid: `eq.${classid}`, schoolid: `eq.${user.schoolid}`, select: 'subjectid' });
        if (!existsSCS.length) await insert('subjects_classes_semisters_curriculums_tbl', { ...sc, semisterid: 1, yearid: 2026 });
        // 3. sections_subjects_classes_tbl - check for duplicate PK first
        const existsSSC = await rest('sections_subjects_classes_tbl', { subjectid: `eq.${subjectid}`, classid: `eq.${classid}`, sectionid: `eq.${sectionid}`, schoolid: `eq.${user.schoolid}`, select: 'subjectid' });
        if (!existsSSC.length) await insert('sections_subjects_classes_tbl', { subjectid, classid, sectionid, stageid: resolvedStageid, curriculumid: resolvedCur, divisionid: resolvedDiv, branchid: user.branchid, schoolid: user.schoolid });
        else throw new Error('This subject is already assigned to this class-section combination.');

        return resolvedStageid;
    };

    // Teacher → class assignment: subjects must already be linked, then insert emp_sec_sub
    const assignTeacherToClass = async (employeeid, subjectid, classid, sectionid, stageid) => {
        const div = user.divisionid || 1, cur = user.curriculumid || 1;
        // Ensure subject is linked to class first (all 3 tables); get back the resolved stageid
        const resolvedStageid = await assignSubjectToClass(parseInt(subjectid), parseInt(classid), parseInt(sectionid), parseInt(stageid));
        // Check for duplicate teacher assignment
        const existsTch = await rest('employees_sections_subjects_classes_semisters_curriculums_tbl', { employeeid: `eq.${employeeid}`, subjectid: `eq.${subjectid}`, classid: `eq.${classid}`, sectionid: `eq.${sectionid}`, select: 'employeeid' });
        if (existsTch.length) throw new Error('This teacher is already assigned to this subject/class/section.');
        // Now insert teacher assignment
        await insert('employees_sections_subjects_classes_semisters_curriculums_tbl', {
            employeeid, subjectid, classid, sectionid, stageid: resolvedStageid, semisterid: 1, yearid: 2026,
            divisionid: div, curriculumid: cur, branchid: user.branchid, schoolid: user.schoolid
        });
    };

    const handleConfirmAdd = async () => {
        setIsLoading(true);
        try {
            if (activeTab === 'subjects') {
                await assignSubjectToClass(
                    parseInt(newRow.subjectid), parseInt(newRow.classid),
                    parseInt(newRow.sectionid), parseInt(newRow.stageid)
                );
            } else if (activeTab === 'supervisors') {
                await insert('employees_types_stages_tbl', { employeeid: parseInt(newRow.employeeid), typeid: 2, stageid: parseInt(newRow.stageid), schoolid: user.schoolid, branchid: user.branchid, divisionid: user.divisionid || 1, curriculumid: user.curriculumid || 1 });
            } else if (activeTab === 'teachers') {
                await assignTeacherToClass(
                    parseInt(newRow.employeeid), parseInt(newRow.subjectid),
                    parseInt(newRow.classid), parseInt(newRow.sectionid), parseInt(newRow.stageid)
                );
            }
            addToast(t('assignmentAdded', lang), 'success');
            setAddingNew(false);
            setNewRow({});
            fetchData();
        } catch (err) { addToast(err.message, 'error'); }
        finally { setIsLoading(false); }
    };

    // Student: add new assignment
    const handleConfirmStudentAdd = async () => {
            addToast(t('pleaseFillAllFields', lang), 'warning'); return;
        setIsLoading(true);
        try {
            const sc = assignments.students.find(a => String(a.studentid) === String(newRow.studentid));
            if (sc) {
                await fetch(`${SUPABASE_URL}/rest/v1/students_sections_classes_tbl?studentid=eq.${newRow.studentid}&classid=eq.${sc.classid}&sectionid=eq.${sc.sectionid}`, { method: 'DELETE', headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } });
            }
            await insert('students_sections_classes_tbl', { studentid: parseInt(newRow.studentid), classid: parseInt(newRow.classid), sectionid: parseInt(newRow.sectionid), stageid: parseInt(newRow.stageid), schoolid: user.schoolid, branchid: user.branchid, divisionid: user.divisionid || 1, curriculumid: user.curriculumid || 1 });
            addToast(t('studentAssigned', lang), 'success');
            setAddingNew(false); setNewRow({});
            fetchData();
        } catch (err) { addToast(err.message, 'error'); }
        finally { setIsLoading(false); }
    };

    // Student: edit class/section
    const handleSaveEdit = async () => {
        if (editingRow === null || editingRow === undefined) return;
        const row = currentData[editingRow];
        setIsLoading(true);
        try {
            if (activeTab === 'students') {
                await fetch(`${SUPABASE_URL}/rest/v1/students_sections_classes_tbl?studentid=eq.${row.studentid}&classid=eq.${row.classid}&sectionid=eq.${row.sectionid}`, {
                    method: 'DELETE', headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }
                });
                await insert('students_sections_classes_tbl', { studentid: row.studentid, classid: parseInt(editForm.classid), sectionid: parseInt(editForm.sectionid), stageid: parseInt(editForm.stageid), schoolid: user.schoolid, branchid: user.branchid, divisionid: user.divisionid || 1, curriculumid: user.curriculumid || 1 });
            } else if (activeTab === 'subjects') {
                await fetch(`${SUPABASE_URL}/rest/v1/sections_subjects_classes_tbl?subjectid=eq.${row.subjectid}&classid=eq.${row.classid}&sectionid=eq.${row.sectionid}&schoolid=eq.${user.schoolid}`, {
                    method: 'DELETE', headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }
                });
                await insert('sections_subjects_classes_tbl', { subjectid: row.subjectid, classid: parseInt(editForm.classid), sectionid: parseInt(editForm.sectionid), schoolid: user.schoolid, branchid: user.branchid, stageid: row.stageid || 1, curriculumid: row.curriculumid || 1, divisionid: row.divisionid || 1 });
            } else if (activeTab === 'supervisors') {
                await fetch(`${SUPABASE_URL}/rest/v1/employees_types_stages_tbl?employeeid=eq.${row.employeeid}&stageid=eq.${row.stageid}`, {
                    method: 'DELETE', headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }
                });
                await insert('employees_types_stages_tbl', { employeeid: row.employeeid, typeid: 2, stageid: parseInt(editForm.stageid), schoolid: user.schoolid, branchid: user.branchid, divisionid: user.divisionid || 1, curriculumid: user.curriculumid || 1 });
            } else if (activeTab === 'teachers') {
                await fetch(`${SUPABASE_URL}/rest/v1/employees_sections_subjects_classes_semisters_curriculums_tbl?employeeid=eq.${row.employeeid}&subjectid=eq.${row.subjectid}&classid=eq.${row.classid}&sectionid=eq.${row.sectionid}`, {
                    method: 'DELETE', headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }
                });
                await insert('employees_sections_subjects_classes_semisters_curriculums_tbl', { employeeid: row.employeeid, subjectid: row.subjectid, classid: parseInt(editForm.classid), sectionid: parseInt(editForm.sectionid), stageid: row.stageid, semisterid: row.semisterid || 1, yearid: row.yearid || 2026, curriculumid: row.curriculumid || 1, divisionid: row.divisionid || 1, branchid: user.branchid, schoolid: user.schoolid });
            }
            addToast(t('assignmentUpdated', lang), 'success');
            setEditingRow(null);
            fetchData();
        } catch (err) { addToast(err.message, 'error'); }
        finally { setIsLoading(false); }
    };

    const handleDelete = async (row) => {
        try {
            if (activeTab === 'students') {
                await fetch(`${SUPABASE_URL}/rest/v1/students_sections_classes_tbl?studentid=eq.${row.studentid}&classid=eq.${row.classid}&sectionid=eq.${row.sectionid}`, { method: 'DELETE', headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } });
            } else if (activeTab === 'subjects') {
                await fetch(`${SUPABASE_URL}/rest/v1/sections_subjects_classes_tbl?subjectid=eq.${row.subjectid}&classid=eq.${row.classid}&sectionid=eq.${row.sectionid}&schoolid=eq.${user.schoolid}`, { method: 'DELETE', headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } });
            } else if (activeTab === 'supervisors') {
                await fetch(`${SUPABASE_URL}/rest/v1/employees_types_stages_tbl?employeeid=eq.${row.employeeid}&stageid=eq.${row.stageid}`, { method: 'DELETE', headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } });
            } else if (activeTab === 'teachers') {
                await fetch(`${SUPABASE_URL}/rest/v1/employees_sections_subjects_classes_semisters_curriculums_tbl?employeeid=eq.${row.employeeid}&subjectid=eq.${row.subjectid}&classid=eq.${row.classid}&sectionid=eq.${row.sectionid}`, { method: 'DELETE', headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } });
            }
            addToast(t('removed', lang), 'error');
            fetchData();
        } catch (err) { addToast(err.message, 'error'); }
    };

    const currentData = assignments[activeTab] || [];
    const sel = "input-field h-9 text-xs px-2";

    return (
        <div className="space-y-6 animate-fade-in pb-12">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a]">{t('assignments', lang)}</h1>
                    <p className="text-[#64748b] text-sm">{t('manageSchoolAssignments', lang)}</p>
                </div>
                    <button onClick={() => { setAddingNew(true); setNewRow({}); }}
                        className="flex items-center gap-2 bg-[#1d4ed8] hover:bg-[#1e40af] text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-100">
                        <Plus className="h-4 w-4" /> {t('addAssignment', lang)}
                    </button>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-1 p-1 bg-slate-50 rounded-xl border border-slate-100">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => { setActiveTab(tab.id); setAddingNew(false); setEditingRow(null); }}
                        className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-lg transition-all ${activeTab === tab.id ? 'bg-white text-[#1d4ed8] shadow-md border border-blue-50' : 'text-[#64748b] hover:bg-white/50'}`}>
                        <tab.icon className={`h-4 w-4 ${activeTab === tab.id ? 'text-[#1d4ed8]' : 'text-slate-400'}`} />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="card bg-white rounded-2xl border border-[#e2e8f0] overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                            <tr>
                                {activeTab === 'students' && <><th className="px-6 py-4 text-[11px] font-black text-[#64748b] uppercase">{t('student', lang)}</th><th className="px-6 py-4 text-[11px] font-black text-[#64748b] uppercase">{t('class', lang)}</th><th className="px-6 py-4 text-[11px] font-black text-[#64748b] uppercase">{t('section', lang)}</th><th className="px-6 py-4 text-[11px] font-black text-[#64748b] uppercase">{t('stage', lang)}</th><th className="px-6 py-4 text-[11px] font-black text-[#64748b] uppercase">{t('actions', lang)}</th></>}
                                {activeTab === 'subjects' && <><th className="px-6 py-4 text-[11px] font-black text-[#64748b] uppercase">{t('subject', lang)}</th><th className="px-6 py-4 text-[11px] font-black text-[#64748b] uppercase">{t('class', lang)}</th><th className="px-6 py-4 text-[11px] font-black text-[#64748b] uppercase">{t('section', lang)}</th><th className="px-6 py-4 text-[11px] font-black text-[#64748b] uppercase">{t('actions', lang)}</th></>}
                                {activeTab === 'supervisors' && <><th className="px-6 py-4 text-[11px] font-black text-[#64748b] uppercase">{t('supervisor', lang)}</th><th className="px-6 py-4 text-[11px] font-black text-[#64748b] uppercase">{t('stage', lang)}</th><th className="px-6 py-4 text-[11px] font-black text-[#64748b] uppercase">{t('actions', lang)}</th></>}
                                {activeTab === 'teachers' && <><th className="px-6 py-4 text-[11px] font-black text-[#64748b] uppercase">{t('teacher', lang)}</th><th className="px-6 py-4 text-[11px] font-black text-[#64748b] uppercase">{t('subject', lang)}</th><th className="px-6 py-4 text-[11px] font-black text-[#64748b] uppercase">{t('class', lang)}</th><th className="px-6 py-4 text-[11px] font-black text-[#64748b] uppercase">{t('section', lang)}</th><th className="px-6 py-4 text-[11px] font-black text-[#64748b] uppercase">{t('actions', lang)}</th></>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#f1f5f9]">
                            <AnimatePresence>
                                {addingNew && (
                                    <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-blue-50/50 border-b-2 border-blue-200">
                                        {activeTab === 'students' && <>
                                            <td className="px-4 py-3">
                                                <select className={sel} value={newRow.studentid || ''} onChange={e => setNewRow({ ...newRow, studentid: e.target.value })}>
                                                    <option value="">{t('selectStudent', lang)}</option>
                                                    {students.map(s => <option key={s.studentid} value={s.studentid}>{_getStudentName(s, lang)}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <select className={sel} value={newRow.classid || ''} onChange={e => setNewRow({ ...newRow, classid: e.target.value })}>
                                                    <option value="">{t('selectClass', lang)}</option>
                                                    {classes.map(c => <option key={c.classid} value={c.classid}>{t('class', lang)} {getField(c, 'classname', 'classname_en', lang) || c.classname}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <select className={sel} value={newRow.sectionid || ''} onChange={e => setNewRow({ ...newRow, sectionid: e.target.value })}>
                                                    <option value="">{t('selectSection', lang)}</option>
                                                    {sections.map(s => <option key={s.sectionid} value={s.sectionid}>{getField(s, 'sectionname', 'sectionname_en', lang) || s.sectionname}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <select className={sel} value={newRow.stageid || ''} onChange={e => setNewRow({ ...newRow, stageid: e.target.value })}>
                                                    <option value="">{t('selectStage', lang)}</option>
                                                    {stages.map(s => <option key={s.stageid} value={s.stageid}>{getField(s, 'stagename', 'stagename_en', lang)}</option>)}
                                                </select>
                                            </td>
                                        </>}
                                        {activeTab === 'subjects' && <>
                                            <td className="px-4 py-3">
                                                <select className={sel} value={newRow.subjectid || ''} onChange={e => setNewRow({ ...newRow, subjectid: e.target.value })}>
                                                    <option value="">{t('subject', lang)}</option>
                                                    {subjects.map(s => <option key={s.subjectid} value={s.subjectid}>{getField(s, 'subjectname', 'Subjectname_en', lang)}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <select className={sel} value={newRow.classid || ''} onChange={e => setNewRow({ ...newRow, classid: e.target.value })}>
                                                    <option value="">{t('class', lang)}</option>
                                                    {classes.map(c => <option key={c.classid} value={c.classid}>{t('class', lang)} {getField(c, 'classname', 'classname_en', lang) || c.classname || ''}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <select className={sel} value={newRow.sectionid || ''} onChange={e => setNewRow({ ...newRow, sectionid: e.target.value })}>
                                                    <option value="">{t('section', lang)}</option>
                                                    {sections.map(s => <option key={s.sectionid} value={s.sectionid}>{getField(s, 'sectionname', 'sectionname_en', lang) || s.sectionname}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <select className={sel} value={newRow.stageid || ''} onChange={e => setNewRow({ ...newRow, stageid: e.target.value })}>
                                                    <option value="">{t('stage', lang)}</option>
                                                    {stages.map(s => <option key={s.stageid} value={s.stageid}>{getField(s, 'stagename', 'stagename_en', lang)}</option>)}
                                                </select>
                                            </td>
                                        </>}
                                        {activeTab === 'supervisors' && <>
                                            <td className="px-4 py-3">
                                                <select className={sel} value={newRow.employeeid || ''} onChange={e => setNewRow({ ...newRow, employeeid: e.target.value })}>
                                                    <option value="">{t('supervisor', lang)}</option>
                                                    {employees.supervisors.map(e => <option key={e.employeeid} value={e.employeeid}>{getField(e, 'employeename', 'employeename_en', lang) || e.employeename}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <select className={sel} value={newRow.stageid || ''} onChange={e => setNewRow({ ...newRow, stageid: e.target.value })}>
                                                    <option value="">{t('stage', lang)}</option>
                                                    {stages.map(s => <option key={s.stageid} value={s.stageid}>{getField(s, 'stagename', 'stagename_en', lang)}</option>)}
                                                </select>
                                            </td>
                                        </>}
                                        {activeTab === 'teachers' && <>
                                            <td className="px-4 py-3">
                                                <select className={sel} value={newRow.employeeid || ''} onChange={e => setNewRow({ ...newRow, employeeid: e.target.value })}>
                                                    <option value="">{t('teacher', lang)}</option>
                                                    {employees.teachers.map(e => <option key={e.employeeid} value={e.employeeid}>{getField(e, 'employeename', 'employeename_en', lang) || e.employeename}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <select className={sel} value={newRow.subjectid || ''} onChange={e => setNewRow({ ...newRow, subjectid: e.target.value })}>
                                                    <option value="">{t('subject', lang)}</option>
                                                    {subjects.map(s => <option key={s.subjectid} value={s.subjectid}>{getField(s, 'subjectname', 'Subjectname_en', lang)}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <select className={sel} value={newRow.classid || ''} onChange={e => setNewRow({ ...newRow, classid: e.target.value })}>
                                                    <option value="">{t('class', lang)}</option>
                                                    {classes.map(c => <option key={c.classid} value={c.classid}>{t('class', lang)} {getField(c, 'classname', 'classname_en', lang) || c.classname || ''}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <select className={sel} value={newRow.sectionid || ''} onChange={e => setNewRow({ ...newRow, sectionid: e.target.value })}>
                                                    <option value="">{t('section', lang)}</option>
                                                    {sections.map(s => <option key={s.sectionid} value={s.sectionid}>{getField(s, 'sectionname', 'sectionname_en', lang) || s.sectionname}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <select className={sel} value={newRow.stageid || ''} onChange={e => setNewRow({ ...newRow, stageid: e.target.value })}>
                                                    <option value="">{t('stage', lang)}</option>
                                                    {stages.map(s => <option key={s.stageid} value={s.stageid}>{getField(s, 'stagename', 'stagename_en', lang)}</option>)}
                                                </select>
                                            </td>
                                        </>}
                                        <td className="px-4 py-3">
                                            <div className="flex gap-2">
                                                <button onClick={activeTab === 'students' ? handleConfirmStudentAdd : handleConfirmAdd} disabled={isLoading} className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg">
                                                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                                                </button>
                                                <button onClick={() => setAddingNew(false)} className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg"><X className="h-5 w-5" /></button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                )}
                            </AnimatePresence>
                            {loading ? (
                                <tr><td colSpan={6} className="px-6 py-12 text-center text-[#94a3b8]">{t('loading', lang)}...</td></tr>
                            ) : currentData.length === 0 ? (
                                <tr><td colSpan={6} className="px-6 py-12 text-center text-[#94a3b8]">{t('noAssignments', lang)}</td></tr>
                            ) : currentData.map((row, i) => (
                                <tr key={i} className="hover:bg-blue-50/20 transition-all">
                                    {activeTab === 'students' && <>
                                        <td className="px-6 py-4 text-sm font-bold text-[#0f172a]">{row.studentName}</td>
                                        {editingRow === i ? <>
                                            <td className="px-4 py-3">
                                                <select className={sel} value={editForm.classid || ''} onChange={e => setEditForm({...editForm, classid: e.target.value})}>
                                                    {classes.map(c => <option key={c.classid} value={c.classid}>{t('class', lang)} {getField(c, 'classname', 'classname_en', lang) || c.classname || ''}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <select className={sel} value={editForm.sectionid || ''} onChange={e => setEditForm({...editForm, sectionid: e.target.value})}>
                                                    {sections.map(s => <option key={s.sectionid} value={s.sectionid}>{getField(s, 'sectionname', 'sectionname_en', lang) || s.sectionname}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <select className={sel} value={editForm.stageid || ''} onChange={e => setEditForm({...editForm, stageid: e.target.value})}>
                                                    {stages.map(s => <option key={s.stageid} value={s.stageid}>{getField(s, 'stagename', 'stagename_en', lang)}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex gap-2">
                                                    <button onClick={handleSaveEdit} disabled={isLoading} className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg">
                                                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                                                    </button>
                                                    <button onClick={() => setEditingRow(null)} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg"><X className="h-4 w-4" /></button>
                                                </div>
                                            </td>
                                        </> : <>
                                            <td className="px-6 py-4 text-sm text-[#475569]">{t('class', lang)} {row.classname}</td>
                                            <td className="px-6 py-4"><span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-[#eff6ff] text-[#1d4ed8] text-xs font-bold border border-blue-100">{row.sectionname}</span></td>
                                            <td className="px-6 py-4 text-xs text-[#64748b]">{row.stageName || '—'}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex gap-2">
                                                    <button onClick={() => { setEditingRow(i); setEditForm({ classid: String(row.classid), sectionid: String(row.sectionid), stageid: String(row.stageid) }); }} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg border border-blue-100"><Edit2 className="h-4 w-4" /></button>
                                                    <button onClick={() => handleDelete(row)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg border border-red-100"><Trash2 className="h-4 w-4" /></button>
                                                </div>
                                            </td>
                                        </>}
                                    </>}
                                    {activeTab === 'subjects' && <>
                                        <td className="px-6 py-4 text-sm font-bold text-[#0f172a]">{row.subjectName}</td>
                                        {editingRow === i ? <>
                                            <td className="px-4 py-3"><select className={sel} value={editForm.classid || ''} onChange={e => setEditForm({...editForm, classid: e.target.value})}>{classes.map(c => <option key={c.classid} value={c.classid}>{t('class', lang)} {getField(c, 'classname', 'classname_en', lang) || c.classname}</option>)}</select></td>
                                            <td className="px-4 py-3"><select className={sel} value={editForm.sectionid || ''} onChange={e => setEditForm({...editForm, sectionid: e.target.value})}>{sections.map(s => <option key={s.sectionid} value={s.sectionid}>{getField(s, 'sectionname', 'sectionname_en', lang) || s.sectionname}</option>)}</select></td>
                                            <td className="px-4 py-3"><div className="flex gap-2"><button onClick={handleSaveEdit} disabled={isLoading} className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg">{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}</button><button onClick={() => setEditingRow(null)} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg"><X className="h-4 w-4" /></button></div></td>
                                        </> : <>
                                            <td className="px-6 py-4 text-sm text-[#475569]">{t('class', lang)} {row.classname}</td>
                                            <td className="px-6 py-4"><span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-[#eff6ff] text-[#1d4ed8] text-xs font-bold border border-blue-100">{row.sectionname}</span></td>
                                            <td className="px-6 py-4"><div className="flex gap-2"><button onClick={() => { setEditingRow(i); setEditForm({ classid: String(row.classid), sectionid: String(row.sectionid) }); }} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg border border-blue-100"><Edit2 className="h-4 w-4" /></button><button onClick={() => handleDelete(row)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg border border-red-100"><Trash2 className="h-4 w-4" /></button></div></td>
                                        </>}
                                    </>}
                                    {activeTab === 'supervisors' && <>
                                        <td className="px-6 py-4 text-sm font-bold text-[#0f172a]">{row.empName}</td>
                                        {editingRow === i ? <>
                                            <td className="px-4 py-3"><select className={sel} value={editForm.stageid || ''} onChange={e => setEditForm({...editForm, stageid: e.target.value})}>{stages.map(s => <option key={s.stageid} value={s.stageid}>{getField(s, 'stagename', 'stagename_en', lang)}</option>)}</select></td>
                                            <td className="px-4 py-3"><div className="flex gap-2"><button onClick={handleSaveEdit} disabled={isLoading} className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg">{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}</button><button onClick={() => setEditingRow(null)} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg"><X className="h-4 w-4" /></button></div></td>
                                        </> : <>
                                            <td className="px-6 py-4 text-sm text-[#475569]">{row.stageName}</td>
                                            <td className="px-6 py-4"><div className="flex gap-2"><button onClick={() => { setEditingRow(i); setEditForm({ stageid: String(row.stageid) }); }} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg border border-blue-100"><Edit2 className="h-4 w-4" /></button><button onClick={() => handleDelete(row)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg border border-red-100"><Trash2 className="h-4 w-4" /></button></div></td>
                                        </>}
                                    </>}
                                    {activeTab === 'teachers' && <>
                                        <td className="px-6 py-4 text-sm font-bold text-[#0f172a]">{row.empName}</td>
                                        <td className="px-6 py-4"><span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">{row.subjectName}</span></td>
                                        {editingRow === i ? <>
                                            <td className="px-4 py-3"><select className={sel} value={editForm.classid || ''} onChange={e => setEditForm({...editForm, classid: e.target.value})}>{classes.map(c => <option key={c.classid} value={c.classid}>{t('class', lang)} {getField(c, 'classname', 'classname_en', lang) || c.classname}</option>)}</select></td>
                                            <td className="px-4 py-3"><select className={sel} value={editForm.sectionid || ''} onChange={e => setEditForm({...editForm, sectionid: e.target.value})}>{sections.map(s => <option key={s.sectionid} value={s.sectionid}>{getField(s, 'sectionname', 'sectionname_en', lang) || s.sectionname}</option>)}</select></td>
                                            <td className="px-4 py-3"><div className="flex gap-2"><button onClick={handleSaveEdit} disabled={isLoading} className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg">{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}</button><button onClick={() => setEditingRow(null)} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg"><X className="h-4 w-4" /></button></div></td>
                                        </> : <>
                                            <td className="px-6 py-4 text-sm text-[#475569]">{t('class', lang)} {row.classname}</td>
                                            <td className="px-6 py-4"><span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-[#eff6ff] text-[#1d4ed8] text-xs font-bold border border-blue-100">{row.sectionname}</span></td>
                                            <td className="px-6 py-4"><div className="flex gap-2"><button onClick={() => { setEditingRow(i); setEditForm({ classid: String(row.classid), sectionid: String(row.sectionid) }); }} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg border border-blue-100"><Edit2 className="h-4 w-4" /></button><button onClick={() => handleDelete(row)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg border border-red-100"><Trash2 className="h-4 w-4" /></button></div></td>
                                        </>}
                                    </>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="p-4 bg-slate-50/50 border-t border-[#e2e8f0] flex items-center">
                    <span className="text-xs font-bold text-[#64748b] uppercase tracking-wider mr-3">{t('total', lang)}</span>
                    <div className="px-3 py-1 bg-white rounded-lg border border-[#e2e8f0] text-xs font-black text-[#0f172a] shadow-sm">{currentData.length} {t('rows', lang)}</div>
                </div>
            </div>
        </div>
    );
}
